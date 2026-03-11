"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useClientProfileStore } from "@/lib/stores/financial-store";
import type { ClientProfile } from "@/lib/stores/financial-store";
import { useRoadmapStore } from "@/lib/stores/roadmap-store";
import type { RoadmapData } from "@/lib/stores/roadmap-store";
import { useConversationStore } from "@/lib/stores/conversation-store";
import type { Message, Source } from "@/lib/stores/conversation-store";
import { useSessionStore } from "@/lib/stores/session-store";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useRoadmapGeneration } from "@/hooks/useRoadmapGeneration";
import { parseReferrals, SPECIALIST_TEAMS } from "@/lib/specialists";
import type { Referral, SpecialistTeam } from "@/lib/specialists";
import EmailDraftModal from "@/components/EmailDraftModal";
import FeedbackButton from "@/components/FeedbackButton";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type ResponseFormat = "concise" | "standard" | "detailed";
const EMPTY_MESSAGES: Message[] = [];

const ADVISOR_NAME = "ILR Property Advisor";

const ROADMAP_INSTRUCTIONS = `

ROADMAP GENERATION:
You can generate a personalised investment roadmap for the client. When they ask for one (or you think they would benefit from one), check whether you have sufficient information:
- Essential: firstName, state, grossAnnualIncome, employmentType, ownsHome (and portfolio details if they own property), primaryGoal, timeHorizon, riskTolerance, investingExperience
- Important for quality: cashSavings, borrowingCapacity, locationPreferences, taxRate, existingDebts

If you have sufficient data:
- Let them know you are putting their roadmap together now
- Tell them they can safely leave this chat -- the roadmap will appear on the home page when it is ready
- Include ROADMAP_ACCEPTED on its own line as the very last line of your response
- Do NOT show this token to the user in your conversational text

If key data is missing:
- Tell the client what information you still need to build a quality roadmap
- Ask for the missing pieces (1-2 questions at a time)
- Once they have provided enough, proceed with ROADMAP_ACCEPTED as above`;

function buildFinancialContext(
  profile: ClientProfile,
  roadmapData?: RoadmapData | null
): string {
  const { agentBriefs: _briefs, summary: _summary, ...structuredData } = profile;

  let context = `${profile.summary}\n\nCLIENT DATA:\n${JSON.stringify(structuredData, null, 2)}`;

  // Always include roadmap instructions for unified advisor
  context += ROADMAP_INSTRUCTIONS;

  if (roadmapData) {
    const netYield = roadmapData.keyMetrics.currentNetYield
      ? `, Current net yield ${roadmapData.keyMetrics.currentNetYield}%`
      : '';
    context += `\n\nROADMAP SUMMARY:
Strategy: ${roadmapData.strategyType}
ILR Phase: ${roadmapData.recommendedPhase}
Investor Score: ${roadmapData.investorScore}/100
Deal Criteria: $${roadmapData.dealCriteria.priceRange.min.toLocaleString()}-$${roadmapData.dealCriteria.priceRange.max.toLocaleString()}, targeting ${roadmapData.dealCriteria.targetYield}% yield
Target Areas: ${roadmapData.dealCriteria.locations.join(', ')}
Property Types: ${roadmapData.dealCriteria.propertyTypes.join(', ')}
Key Metrics: Accessible equity $${roadmapData.keyMetrics.accessibleEquity.toLocaleString()}, Borrowing capacity $${roadmapData.keyMetrics.borrowingCapacity.toLocaleString()}, Max purchase $${roadmapData.keyMetrics.maxPurchasePrice.toLocaleString()}${netYield}
Projections:
  Year 1: ${roadmapData.projections.year1.properties} properties, $${roadmapData.projections.year1.equity.toLocaleString()} equity, $${roadmapData.projections.year1.cashflow.toLocaleString()}/yr cashflow
  Year 3: ${roadmapData.projections.year3.properties} properties, $${roadmapData.projections.year3.equity.toLocaleString()} equity, $${roadmapData.projections.year3.cashflow.toLocaleString()}/yr cashflow
  Year 5: ${roadmapData.projections.year5.properties} properties, $${roadmapData.projections.year5.equity.toLocaleString()} equity, $${roadmapData.projections.year5.cashflow.toLocaleString()}/yr cashflow
Top Priorities: ${roadmapData.topPriorities.join('; ')}
IMPORTANT: These roadmap numbers are commitments made to the client. Always reference them consistently when discussing projections, strategy, or goals.`;
  }

  return context;
}

async function getAuthToken(): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

interface AdvisorChatPanelProps {
  conversationId: string;
  initialPrompt?: string;
}

export default function AdvisorChatPanel({
  conversationId,
  initialPrompt,
}: AdvisorChatPanelProps) {
  const clientProfile = useClientProfileStore((s) => s.profile);
  const roadmapData = useRoadmapStore((s) => s.reportData);
  const sessionId = useSessionStore((s) => s.sessionId);
  const authUser = useAuthStore((s) => s.user);
  const { startGeneration } = useRoadmapGeneration();
  const messages = useConversationStore((s) => s.messages) ?? EMPTY_MESSAGES;
  const addMessage = useConversationStore((s) => s.addMessage);
  const updateLastMessage = useConversationStore((s) => s.updateLastMessage);
  const clearMessages = useConversationStore((s) => s.clearMessages);
  const loadConversation = useConversationStore((s) => s.loadConversation);
  const persistMessage = useConversationStore((s) => s.persistMessage);

  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [format, setFormat] = useState<ResponseFormat>("standard");
  const [emailDraft, setEmailDraft] = useState<{
    team: SpecialistTeam;
    subject: string;
    body: string;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasAutoSubmitted = useRef(false);

  // Load conversation messages on mount
  useEffect(() => {
    async function load() {
      const token = await getAuthToken();
      if (token) {
        loadConversation(conversationId, token);
      }
    }
    load();
  }, [conversationId, loadConversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  const sendMessageDirect = useCallback(
    async (userMessage: string) => {
      if (isLoading) return;

      const token = await getAuthToken();

      const userMsg: Message = { role: "user", content: userMessage };
      addMessage(userMsg);
      setIsLoading(true);
      setStreamingText("");

      addMessage({ role: "assistant", content: "", sources: [] });

      try {
        const currentMessages = useConversationStore.getState().messages;
        const history = currentMessages.slice(0, -1).map((m) => ({
          role: m.role,
          content: m.content.replace(/<!--REFERRAL:[\s\S]*?-->/g, "").trim(),
        }));

        const res = await fetch("/api/chat/stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            query: userMessage,
            agent: ADVISOR_NAME,
            conversationId,
            history,
            responseFormat: format,
            financialContext: clientProfile
              ? buildFinancialContext(clientProfile, roadmapData)
              : undefined,
          }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";
        let assistantText = "";
        let sources: Source[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (!data) continue;

            try {
              const event = JSON.parse(data);
              if (event.type === "error") {
                throw new Error(event.error || "Something went wrong");
              } else if (event.type === "status") {
                setStatusMessage(event.message || null);
              } else if (event.type === "sources") {
                setStatusMessage(null);
                sources = event.sources;
              } else if (event.type === "text") {
                setStatusMessage(null);
                assistantText += event.text;
                // Strip tokens and referral tags from live display
                const displayText = assistantText
                  .replace(/\n?ROADMAP_ACCEPTED\s*/g, "")
                  .replace(/<!--REFERRAL:[\s\S]*?(-->|$)/g, "")
                  .trim();
                setStreamingText(displayText);
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }

        // Check for ROADMAP_ACCEPTED before cleaning
        const roadmapAccepted = assistantText.includes("ROADMAP_ACCEPTED");

        // Clean content
        const cleanedText = assistantText.replace(/\n?ROADMAP_ACCEPTED\s*/g, "");
        const [cleanContent, referrals] = parseReferrals(cleanedText);

        const assistantMsg: Message = {
          role: "assistant",
          content: cleanContent,
          sources,
          referrals: referrals.length > 0 ? referrals : undefined,
        };

        updateLastMessage(assistantMsg);

        // Persist both messages to Supabase
        if (token) {
          await persistMessage(conversationId, userMsg, token);
          await persistMessage(conversationId, assistantMsg, token);
        }

        // Trigger roadmap generation if accepted
        if (roadmapAccepted && clientProfile && sessionId) {
          startGeneration(clientProfile, sessionId, authUser?.id);
        }
      } catch (error) {
        const isNetworkError =
          error instanceof TypeError && error.message === "Failed to fetch";
        const errorMessage = isNetworkError
          ? "Network error - please check your connection and try again."
          : error instanceof Error
            ? error.message
            : "Something went wrong";

        updateLastMessage({
          role: "assistant",
          content: `Error: ${errorMessage}`,
        });
      } finally {
        setStreamingText(null);
        setStatusMessage(null);
        setIsLoading(false);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    },
    [isLoading, conversationId, format, clientProfile, roadmapData, addMessage, updateLastMessage, persistMessage, sessionId, authUser?.id, startGeneration]
  );

  // Auto-submit initialPrompt on mount
  useEffect(() => {
    if (initialPrompt && !hasAutoSubmitted.current && !isLoading) {
      hasAutoSubmitted.current = true;
      sendMessageDirect(initialPrompt);
    }
  }, [initialPrompt, isLoading, sendMessageDirect]);

  async function handleSend() {
    if (!input.trim() || isLoading) return;
    const userMessage = input.trim();
    setInput("");
    sendMessageDirect(userMessage);
  }

  function openEmailDraft(referral: Referral, team: SpecialistTeam, msg: Message) {
    const name = clientProfile?.personal.firstName || "there";
    const financialSummary = clientProfile?.summary || "";

    // Find the user message that preceded this assistant message
    const msgIndex = messages.indexOf(msg);
    const userQuestion = msgIndex > 0 ? messages[msgIndex - 1].content : "";

    const body = `Hi Team,

I'm a client of the ILR program and I'd like to discuss the following with you:

${referral.suggestedSubject}

For context, here is the question I was exploring with my ILR advisor:

"${userQuestion}"

${financialSummary ? `A bit about my situation:\n${financialSummary}\n\n` : ""}I'd appreciate the opportunity to discuss this further. Please let me know a good time to connect.

Kind regards,
${name}`;

    setEmailDraft({ team, subject: referral.suggestedSubject, body });
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-end gap-2">
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as ResponseFormat)}
          className="bg-zinc-800 border border-zinc-700 rounded-md px-2 sm:px-3 py-1.5 text-xs sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500"
        >
          <option value="concise">Concise</option>
          <option value="standard">Standard</option>
          <option value="detailed">Detailed</option>
        </select>
        <button
          disabled
          title="Coming Soon"
          className="bg-zinc-800 border border-zinc-700 rounded-md px-2 sm:px-3 py-1.5 text-xs sm:text-sm text-zinc-500 cursor-not-allowed opacity-50"
        >
          Voice
        </button>
        <button
          onClick={() => clearMessages()}
          className="bg-zinc-800 border border-zinc-700 rounded-md px-2 sm:px-3 py-1.5 text-xs sm:text-sm text-zinc-400 hover:text-red-400 hover:bg-zinc-700 transition-colors"
        >
          Clear
        </button>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-4 sm:space-y-6">
        {messages.length === 0 && (
          <div className="text-center text-zinc-500 mt-20">
            <p className="text-lg font-medium mb-2">
              Ask the ILR Property Advisor anything
            </p>
            <p className="text-sm max-w-md mx-auto">
              Your unified property investment advisor, here to help with strategy, deals, finance and more.
            </p>
          </div>
        )}

        {messages.map((msg, i) => {
          const isLastAssistant =
            isLoading &&
            msg.role === "assistant" &&
            i === messages.length - 1;
          const rawContent = isLastAssistant
            ? (streamingText || statusMessage || msg.content)
            : msg.content;
          // Defensive strip: catch any referral/roadmap tags that slipped through
          const displayContent = rawContent
            ?.replace(/<!--REFERRAL:[\s\S]*?(-->|$)/g, "")
            .replace(/\n?ROADMAP_ACCEPTED\s*/g, "")
            .trim() || rawContent;

          return (
            <div key={i} className="space-y-2">
              {/* Message bubble */}
              <div
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[90%] sm:max-w-[75%] rounded-2xl px-3 sm:px-5 py-3 overflow-hidden ${
                    msg.role === "user"
                      ? "bg-red-600 text-white"
                      : "bg-zinc-800/80 text-zinc-100"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm prose-invert max-w-none prose-p:my-2 prose-headings:my-3 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-table:border-collapse prose-th:border prose-th:border-zinc-700 prose-th:bg-zinc-800 prose-th:px-2 prose-th:py-1 sm:prose-th:px-3 sm:prose-th:py-1.5 prose-td:border prose-td:border-zinc-700 prose-td:px-2 prose-td:py-1 sm:prose-td:px-3 sm:prose-td:py-1.5 prose-th:text-xs prose-td:text-xs sm:prose-th:text-sm sm:prose-td:text-sm">
                      {displayContent && !(isLastAssistant && !streamingText && statusMessage) ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
                      ) : isLastAssistant && statusMessage ? (
                        <span className="text-zinc-400 italic animate-pulse">
                          {statusMessage}
                        </span>
                      ) : (
                        <span className="text-zinc-400 animate-pulse">
                          Thinking...
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </div>
                  )}

                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-zinc-700">
                      <p className="text-xs text-zinc-400 mb-2">
                        Sources ({msg.sources.length}):
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.sources.map((s, j) => (
                          <span
                            key={j}
                            className="inline-block bg-zinc-700/80 text-zinc-300 text-xs px-2.5 py-1 rounded-full"
                            title={`${s.agent} - ${(s.score * 100).toFixed(0)}% match`}
                          >
                            {s.title}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Feedback button - only on completed assistant messages */}
                  {msg.role === "assistant" && !isLastAssistant && msg.content && (
                    <div className="flex justify-end mt-2">
                      <FeedbackButton
                        agentId="ilr-advisor"
                        agentName={ADVISOR_NAME}
                        userQuestion={i > 0 ? messages[i - 1].content : ""}
                        assistantMessage={msg.content}
                        sessionId={sessionId}
                        userId={authUser?.id}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Referral cards - standalone callouts below the message */}
              {msg.referrals && msg.referrals.length > 0 && (
                <div className="flex justify-start">
                  <div className="max-w-[90%] sm:max-w-[75%] space-y-2">
                    {msg.referrals.map((ref, k) => {
                      const team = SPECIALIST_TEAMS[ref.team];
                      if (!team) return null;
                      return (
                        <button
                          key={k}
                          onClick={() => openEmailDraft(ref, team, msg)}
                          className="w-full text-left bg-gradient-to-r from-red-600/20 to-red-600/10 border border-red-500/30 rounded-xl px-4 py-3 hover:from-red-600/30 hover:to-red-600/20 hover:border-red-500/50 transition-all group"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-red-300 text-sm font-medium">
                                Connect with {team.name}
                              </p>
                              <p className="text-zinc-400 text-xs mt-0.5">
                                {ref.reason}
                              </p>
                            </div>
                            <span className="text-red-400 text-xs font-medium whitespace-nowrap bg-red-600/20 px-3 py-1.5 rounded-lg group-hover:bg-red-600/30 transition-colors">
                              Draft email &rarr;
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-zinc-800 px-3 sm:px-6 py-3 sm:py-4 pb-14 sm:pb-12">
        <p className="text-[11px] text-zinc-500 text-center mb-2 max-w-2xl mx-auto hidden sm:block">
          Thanks for testing! Please use the feedback button on any response to help us improve.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2 sm:gap-3 max-w-4xl mx-auto"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the ILR Property Advisor..."
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            autoFocus
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl text-sm sm:text-base font-medium transition-colors"
          >
            {isLoading ? "..." : "Send"}
          </button>
        </form>
      </div>

      {/* Email Draft Modal */}
      {emailDraft && (
        <EmailDraftModal
          team={emailDraft.team}
          subject={emailDraft.subject}
          body={emailDraft.body}
          replyTo={clientProfile?.personal.email || ""}
          senderName={clientProfile?.personal.firstName || ""}
          onClose={() => setEmailDraft(null)}
          onSent={() => setEmailDraft(null)}
        />
      )}
    </div>
  );
}
