"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MessageSquare, Send, ChevronDown, ThumbsUp, ThumbsDown } from "lucide-react";
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
import ScrollToBottomFAB from "@/components/ScrollToBottomFAB";
import MessageContextMenu from "@/components/MessageContextMenu";
import { getDateDividerLabel, shouldShowDateDivider } from "@/lib/date-utils";

type ResponseFormat = "concise" | "standard" | "detailed";
const EMPTY_MESSAGES: Message[] = [];

const ADVISOR_NAME = "ILR Advisor";

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
  const fetchConversations = useConversationStore((s) => s.fetchConversations);

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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasAutoSubmitted = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ text: string; position: { x: number; y: number } } | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  // Load conversation messages on mount (skip for new conversations with an initial prompt)
  useEffect(() => {
    if (!initialPrompt) {
      loadConversation(conversationId);
    }
  }, [conversationId, loadConversation, initialPrompt]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  const handleMessageTouchStart = useCallback((e: React.TouchEvent, messageText: string) => {
    const touch = e.touches[0];
    longPressTimer.current = setTimeout(() => {
      setContextMenu({
        text: messageText,
        position: { x: touch.clientX, y: touch.clientY },
      });
    }, 500);
  }, []);

  const handleMessageTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleMessageTouchMove = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTextareaResize = useCallback(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const maxHeight = 100;
    textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + "px";
  }, []);

  const sendMessageDirect = useCallback(
    async (userMessage: string) => {
      if (isLoading) return;

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

        setTimeout(() => fetchConversations().catch(() => {}), 1500);

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
    [isLoading, conversationId, format, clientProfile, roadmapData, addMessage, updateLastMessage, fetchConversations, sessionId, authUser?.id, startGeneration]
  );

  // Auto-submit initialPrompt on mount
  useEffect(() => {
    if (initialPrompt && !hasAutoSubmitted.current && !isLoading) {
      hasAutoSubmitted.current = true;
      sendMessageDirect(initialPrompt);
    }
  }, [initialPrompt, isLoading, sendMessageDirect]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const handleResize = () => {
      const keyboardHeight = window.innerHeight - viewport.height;
      const container = document.querySelector('[data-input-container]') as HTMLElement;
      if (container) {
        container.style.transform = keyboardHeight > 50
          ? `translateY(-${keyboardHeight}px)`
          : '';
      }
    };
    viewport.addEventListener('resize', handleResize);
    return () => viewport.removeEventListener('resize', handleResize);
  }, []);

  async function handleSend() {
    if (!input.trim() || isLoading) return;
    const userMessage = input.trim();
    setInput("");
    sendMessageDirect(userMessage);
  }

  function openEmailDraft(referral: Referral, team: SpecialistTeam, msg: Message) {
    const name = clientProfile?.personal.firstName || "there";
    const financialSummary = clientProfile?.summary || "";

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
    <div className="flex flex-col h-full text-white" style={{ background: 'var(--surface-0)' }}>
      {/* Format selector - desktop only */}
      <div className="hidden lg:flex items-center justify-end gap-2 px-6 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="relative">
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as ResponseFormat)}
            className="appearance-none pr-7 pl-3 py-1.5 text-xs rounded-lg transition-colors focus:outline-none"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="concise">Concise</option>
            <option value="standard">Standard</option>
            <option value="detailed">Detailed</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-5 sm:space-y-6 relative">
        {messages.length === 0 && (
          <div className="text-center mt-20">
            <p className="text-lg font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              Ask the ILR Advisor anything
            </p>
            <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--text-muted)' }}>
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
          const displayContent = rawContent
            ?.replace(/<!--REFERRAL:[\s\S]*?(-->|$)/g, "")
            .replace(/\n?ROADMAP_ACCEPTED\s*/g, "")
            .trim() || rawContent;

          return (
            <div key={i} className="space-y-2 animate-message-in">
              {/* Date divider */}
              {shouldShowDateDivider(
                i > 0 ? new Date(messages[i - 1].created_at || Date.now()) : null,
                new Date(msg.created_at || Date.now())
              ) && (
                <div className="flex justify-center my-4">
                  <span
                    className="text-[11px] px-3 py-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {getDateDividerLabel(new Date(msg.created_at || Date.now()))}
                  </span>
                </div>
              )}
              {/* Message bubble */}
              <div
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="flex-shrink-0 mr-3 mt-1">
                    {/* Avatar */}
                    <div
                      className="w-[32px] h-[32px] rounded-full flex items-center justify-center"
                      style={{
                        background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))',
                        boxShadow: '0 0 12px var(--primary-glow)',
                      }}
                    >
                      <MessageSquare className="w-4 h-4 text-white" />
                    </div>
                  </div>
                )}

                <div className={`max-w-[80%] lg:max-w-[70%] ${msg.role === "user" ? "" : "flex-1"}`}>
                  {msg.role === "assistant" && (
                    <p className="text-[11px] mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>
                      ILR Advisor
                    </p>
                  )}

                  <div
                    className={`overflow-hidden ${
                      msg.role === "user"
                        ? "rounded-[18px_4px_18px_18px] px-4 sm:px-5 py-3"
                        : "rounded-[4px_18px_18px_18px] px-4 sm:px-5 py-3"
                    }`}
                    onTouchStart={(e) => handleMessageTouchStart(e, displayContent || "")}
                    onTouchEnd={handleMessageTouchEnd}
                    onTouchMove={handleMessageTouchMove}
                    style={
                      msg.role === "user"
                        ? {
                            background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))',
                            boxShadow: '0 2px 12px rgba(16, 185, 129, 0.2)',
                          }
                        : {
                            background: 'var(--surface-message)',
                            border: '1px solid var(--border-message)',
                          }
                    }
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm prose-invert max-w-none prose-p:my-2 prose-headings:my-3 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-table:border-collapse prose-th:border prose-th:border-zinc-700 prose-th:bg-zinc-800 prose-th:px-2 prose-th:py-1 sm:prose-th:px-3 sm:prose-th:py-1.5 prose-td:border prose-td:border-zinc-700 prose-td:px-2 prose-td:py-1 sm:prose-td:px-3 sm:prose-td:py-1.5 prose-th:text-xs prose-td:text-xs sm:prose-th:text-sm sm:prose-td:text-sm" style={{ lineHeight: 1.7, fontSize: '14px' }}>
                        {displayContent && !(isLastAssistant && !streamingText && statusMessage) ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
                        ) : isLastAssistant && statusMessage ? (
                          <span className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full animate-dot-pulse" style={{ background: 'var(--primary)' }} />
                            <span className="italic" style={{ color: 'var(--text-secondary)' }}>
                              {statusMessage}
                            </span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full animate-dot-pulse" style={{ background: 'var(--primary)' }} />
                            <span style={{ color: 'var(--text-secondary)' }}>Thinking...</span>
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm leading-relaxed whitespace-pre-wrap text-white">
                        {msg.content}
                      </div>
                    )}
                  </div>

                  {/* Sources */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {msg.sources.map((s, j) => (
                        <span
                          key={j}
                          className="inline-block text-[10px] px-2.5 py-1 rounded-full"
                          title={`${s.agent} - ${(s.score * 100).toFixed(0)}% match`}
                          style={{
                            background: 'var(--surface-2)',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {s.title}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Feedback button */}
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

              {/* Referral cards */}
              {msg.referrals && msg.referrals.length > 0 && (
                <div className="flex justify-start pl-[46px]">
                  <div className="max-w-[90%] sm:max-w-[75%] space-y-2">
                    {msg.referrals.map((ref, k) => {
                      const team = SPECIALIST_TEAMS[ref.team];
                      if (!team) return null;
                      return (
                        <button
                          key={k}
                          onClick={() => openEmailDraft(ref, team, msg)}
                          className="w-full text-left rounded-xl px-4 py-3 transition-all group"
                          style={{
                            background: 'linear-gradient(135deg, var(--primary-glow), var(--primary-subtle))',
                            border: '1px solid rgba(16, 185, 129, 0.2)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.4)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.2)';
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium" style={{ color: 'var(--primary-light)' }}>
                                Connect with {team.name}
                              </p>
                              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                                {ref.reason}
                              </p>
                            </div>
                            <span
                              className="text-xs font-medium whitespace-nowrap px-3 py-1.5 rounded-lg transition-colors"
                              style={{
                                color: 'var(--primary)',
                                background: 'var(--primary-subtle)',
                              }}
                            >
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
        <ScrollToBottomFAB scrollContainerRef={scrollContainerRef} />
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="px-3 sm:px-6 py-3 sm:py-4 pb-safe" data-input-container>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="max-w-[680px] mx-auto relative"
        >
          <div
            className="flex items-center gap-2 rounded-[18px] p-1 transition-all input-focus-glow"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border-default)',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.3)';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.06)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-default)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                handleTextareaResize();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask your advisor..."
              rows={1}
              className="flex-1 bg-transparent px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none resize-none"
              style={{ maxHeight: "100px" }}
              autoFocus
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="flex items-center justify-center w-10 h-10 rounded-[14px] text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
              style={{
                background: isLoading || !input.trim()
                  ? 'var(--surface-3)'
                  : 'linear-gradient(135deg, var(--primary), var(--primary-hover))',
                boxShadow: isLoading || !input.trim() ? 'none' : '0 2px 8px rgba(16, 185, 129, 0.3)',
              }}
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
          <p className="text-center text-[10px] mt-1.5" style={{ color: 'var(--text-faint)' }}>
            AI-generated. Not financial advice. Always consult qualified professionals.
          </p>
        </form>
      </div>

      {contextMenu && (
        <MessageContextMenu
          text={contextMenu.text}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
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
