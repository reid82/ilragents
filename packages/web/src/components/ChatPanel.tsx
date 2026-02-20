"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import type { AgentDef } from "@/lib/agents";
import { useClientProfileStore } from "@/lib/stores/financial-store";
import type { AgentBriefs, ClientProfile } from "@/lib/stores/financial-store";
import { useRoadmapStore } from "@/lib/stores/roadmap-store";
import type { RoadmapData } from "@/lib/stores/roadmap-store";
import { useChatStore } from "@/lib/stores/chat-store";
import type { Message, Source } from "@/lib/stores/chat-store";
import { useSessionStore } from "@/lib/stores/session-store";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useRoadmapGeneration } from "@/hooks/useRoadmapGeneration";
import { parseReferrals, SPECIALIST_TEAMS } from "@/lib/specialists";
import type { Referral, SpecialistTeam } from "@/lib/specialists";
import EmailDraftModal from "@/components/EmailDraftModal";
import FeedbackButton from "@/components/FeedbackButton";
import AgentAvatar from "@/components/AgentAvatar";

const VoiceChat = dynamic(() => import("@/components/VoiceChat"), {
  ssr: false,
});

type ResponseFormat = "concise" | "standard" | "detailed";
const EMPTY_MESSAGES: Message[] = [];

const AGENT_BRIEF_KEYS: Record<string, keyof AgentBriefs> = {
  "baseline-ben": "baselineBen",
  "finder-fred": "finderFred",
  "investor-coach": "investorCoach",
  "deal-specialist": "dealSpecialist",
  "deal-analyser-dan": "finderFred",
  "fiso-phil": "finderFred",
};

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
  agentId: string,
  roadmapData?: RoadmapData | null
): string {
  const briefKey = AGENT_BRIEF_KEYS[agentId];
  const brief = briefKey ? profile.agentBriefs[briefKey] : profile.summary;
  const { agentBriefs: _briefs, summary: _summary, ...structuredData } = profile;

  let context = `${brief}\n\nCLIENT DATA:\n${JSON.stringify(structuredData, null, 2)}`;

  // Add roadmap instructions for Ben
  if (agentId === "baseline-ben") {
    context += ROADMAP_INSTRUCTIONS;
  }

  if (roadmapData) {
    context += `\n\nROADMAP SUMMARY:
Strategy: ${roadmapData.strategyType}
ILR Phase: ${roadmapData.recommendedPhase}
Investor Score: ${roadmapData.investorScore}/100
Deal Criteria: $${roadmapData.dealCriteria.priceRange.min.toLocaleString()}-$${roadmapData.dealCriteria.priceRange.max.toLocaleString()}, targeting ${roadmapData.dealCriteria.targetYield}% yield
Target Areas: ${roadmapData.dealCriteria.locations.join(', ')}
Property Types: ${roadmapData.dealCriteria.propertyTypes.join(', ')}
Key Metrics: Accessible equity $${roadmapData.keyMetrics.accessibleEquity.toLocaleString()}, Borrowing capacity $${roadmapData.keyMetrics.borrowingCapacity.toLocaleString()}, Max purchase $${roadmapData.keyMetrics.maxPurchasePrice.toLocaleString()}
Top Priorities: ${roadmapData.topPriorities.join('; ')}`;
  }

  return context;
}

interface ChatPanelProps {
  agentSlug: string;
  agent: AgentDef;
  showBackLink?: boolean;
  initialPrompt?: string;
}

export default function ChatPanel({
  agentSlug,
  agent,
  showBackLink = false,
  initialPrompt,
}: ChatPanelProps) {
  const clientProfile = useClientProfileStore((s) => s.profile);
  const roadmapData = useRoadmapStore((s) => s.reportData);
  const sessionId = useSessionStore((s) => s.sessionId);
  const authUser = useAuthStore((s) => s.user);
  const { startGeneration } = useRoadmapGeneration();
  const messages = useChatStore((s) => s.chats[agentSlug]) ?? EMPTY_MESSAGES;
  const addMessage = useChatStore((s) => s.addMessage);
  const updateLastMessage = useChatStore((s) => s.updateLastMessage);
  const clearChat = useChatStore((s) => s.clearChat);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [format, setFormat] = useState<ResponseFormat>("standard");
  const [showVoice, setShowVoice] = useState(false);
  const [emailDraft, setEmailDraft] = useState<{
    team: SpecialistTeam;
    subject: string;
    body: string;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasAutoSubmitted = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  const sendMessageDirect = useCallback(
    async (userMessage: string) => {
      if (isLoading) return;

      addMessage(agentSlug, { role: "user", content: userMessage });
      setIsLoading(true);
      setStreamingText("");

      addMessage(agentSlug, { role: "assistant", content: "", sources: [] });

      try {
        const currentMessages = useChatStore.getState().chats[agentSlug] ?? [];
        const history = currentMessages.slice(0, -1).map((m) => ({
          role: m.role,
          content: m.content.replace(/<!--REFERRAL:[\s\S]*?-->/g, "").trim(),
        }));

        const res = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: userMessage,
            agent: agent.name,
            history,
            responseFormat: format,
            financialContext: clientProfile
              ? buildFinancialContext(clientProfile, agentSlug, roadmapData)
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
              if (event.type === "sources") {
                sources = event.sources;
              } else if (event.type === "text") {
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

        updateLastMessage(agentSlug, {
          role: "assistant",
          content: cleanContent,
          sources,
          referrals: referrals.length > 0 ? referrals : undefined,
        });

        // Trigger roadmap generation if Ben accepted
        if (roadmapAccepted && agentSlug === "baseline-ben" && clientProfile && sessionId) {
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

        updateLastMessage(agentSlug, {
          role: "assistant",
          content: `Error: ${errorMessage}`,
        });
      } finally {
        setStreamingText(null);
        setIsLoading(false);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    },
    [isLoading, agentSlug, agent.name, format, clientProfile, roadmapData, addMessage, updateLastMessage, sessionId, authUser?.id, startGeneration]
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
      <header className="border-b border-zinc-800 px-4 sm:px-6 py-4 flex flex-wrap items-center gap-3 sm:gap-4">
        {showBackLink && (
          <Link
            href="/"
            className="text-zinc-400 hover:text-white transition-colors"
          >
            &larr; Back
          </Link>
        )}
        <div className="flex items-center gap-3 flex-1">
          <AgentAvatar agent={agent} size="sm" />
          <div>
            <h1 className="font-semibold text-lg">{agent.name}</h1>
            <p className="text-zinc-400 text-sm">{agent.domain}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-zinc-400 text-sm">Format:</label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as ResponseFormat)}
            className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="concise">Concise</option>
            <option value="standard">Standard</option>
            <option value="detailed">Detailed</option>
          </select>
          <button
            disabled
            title="Coming Soon"
            className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-zinc-500 cursor-not-allowed opacity-50"
          >
            Voice
          </button>
          <button
            onClick={() => clearChat(agentSlug)}
            className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:text-red-400 hover:bg-zinc-700 transition-colors"
          >
            Clear
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {messages.length === 0 && (
          <div className="text-center text-zinc-500 mt-20">
            <AgentAvatar agent={agent} size="lg" className="mx-auto mb-4" />
            <p className="text-lg font-medium mb-2">
              Ask {agent.name} anything
            </p>
            <p className="text-sm max-w-md mx-auto">{agent.description}</p>
          </div>
        )}

        {messages.map((msg, i) => {
          const isLastAssistant =
            isLoading &&
            msg.role === "assistant" &&
            i === messages.length - 1;
          const rawContent = isLastAssistant
            ? (streamingText ?? msg.content)
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
                  className={`max-w-[90%] sm:max-w-[75%] rounded-2xl px-5 py-3 ${
                    msg.role === "user"
                      ? "bg-red-600 text-white"
                      : "bg-zinc-800/80 text-zinc-100"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm prose-invert max-w-none prose-p:my-2 prose-headings:my-3 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5">
                      {displayContent ? (
                        <ReactMarkdown>{displayContent}</ReactMarkdown>
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
                        agentId={agentSlug}
                        agentName={agent.name}
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
      <div className="border-t border-zinc-800 px-6 py-4 pb-12">
        <p className="text-[11px] text-zinc-500 text-center mb-2 max-w-2xl mx-auto">
          Thanks for testing! Please use the feedback button on any response to help us improve.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-3 max-w-4xl mx-auto"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask ${agent.name}...`}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            autoFocus
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-medium transition-colors"
          >
            {isLoading ? "..." : "Send"}
          </button>
        </form>
      </div>

      {/* Voice Chat Modal */}
      {showVoice && (
        <VoiceChat
          agent={agent}
          agentSlug={agent.id}
          agentName={agent.name}
          agentDomain={agent.domain}
          agentColor={agent.color}
          financialContext={
            clientProfile
              ? buildFinancialContext(clientProfile, agent.id, roadmapData)
              : undefined
          }
          onClose={() => setShowVoice(false)}
        />
      )}

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
