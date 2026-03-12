'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSessionStore } from '@/lib/stores/session-store';
import { useClientProfileStore } from '@/lib/stores/financial-store';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useRoadmapStore } from '@/lib/stores/roadmap-store';
import { useRoadmapGeneration } from '@/hooks/useRoadmapGeneration';
import QuickReplyChips from "@/components/QuickReplyChips";

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const ONBOARDING_STORAGE_KEY = 'ilre-onboarding-progress';

function saveOnboardingProgress(msgs: Message[]) {
  try {
    // Only save completed messages (non-empty content)
    const completed = msgs.filter((m) => m.content.length > 0);
    if (completed.length > 0) {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(completed));
    }
  } catch {
    // localStorage full or unavailable -- non-fatal
  }
}

function loadOnboardingProgress(): Message[] {
  try {
    const stored = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (stored) return JSON.parse(stored) as Message[];
  } catch {
    // corrupted data -- start fresh
  }
  return [];
}

function clearOnboardingProgress() {
  try {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY);
  } catch {
    // non-fatal
  }
}

const STEP_KEYWORDS = [
  { keywords: ["financial position", "income", "employment", "savings"], step: 1 },
  { keywords: ["goal", "timeline", "objective", "target"], step: 2 },
  { keywords: ["risk", "tolerance", "comfortable", "appetite"], step: 3 },
  { keywords: ["portfolio", "property", "properties", "own"], step: 4 },
];

const CHIP_OPTIONS: Record<string, string[]> = {
  "investment goal": ["Build long-term wealth", "Generate passive income", "Retirement planning", "Portfolio diversification"],
  "risk": ["Conservative", "Moderate", "Aggressive"],
  "experience": ["Complete beginner", "Some knowledge", "Experienced investor"],
  "timeline": ["1-3 years", "3-5 years", "5-10 years", "10+ years"],
};

export default function OnboardingPage() {
  const router = useRouter();
  const setOnboarded = useSessionStore((s) => s.setOnboarded);
  const setSessionId = useSessionStore((s) => s.setSessionId);
  const setProfile = useClientProfileStore((s) => s.setProfile);
  const setRawTranscript = useClientProfileStore((s) => s.setRawTranscript);
  const user = useAuthStore((s) => s.user);
  const setRoadmapStatus = useRoadmapStore((s) => s.setStatus);
  const { startGeneration } = useRoadmapGeneration();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasInitialized = useRef(false);
  const [currentStep, setCurrentStep] = useState(1);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleOnboardingComplete = useCallback(
    async (fullHistory: Message[], roadmapAccepted: boolean) => {
      setIsExtracting(true);
      try {
        const transcript = fullHistory
          .map((m) => `${m.role === 'user' ? 'Client' : 'Ben'}: ${m.content}`)
          .join('\n\n');

        const sessionId = user?.id ?? crypto.randomUUID();

        const res = await fetch('/api/onboarding/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript,
            sessionId,
            userId: user?.id,
          }),
        });

        let extractedProfile = null;
        if (res.ok) {
          extractedProfile = await res.json();
          setProfile(extractedProfile);
          setRawTranscript(transcript);
          setSessionId(sessionId);
        }

        clearOnboardingProgress();
        setOnboarded(true);

        // If roadmap was accepted and profile was extracted, fire generation
        if (roadmapAccepted && extractedProfile) {
          setRoadmapStatus('generating');
          // Start generation in background (non-blocking)
          startGeneration(extractedProfile, sessionId, user?.id);
        }

        router.push('/');
      } catch (error) {
        console.error('Failed to extract financial context:', error);
        clearOnboardingProgress();
        setOnboarded(true);
        router.push('/');
      } finally {
        setIsExtracting(false);
      }
    },
    [router, setOnboarded, setProfile, setRawTranscript, setSessionId, user, setRoadmapStatus, startGeneration]
  );

  const sendMessage = useCallback(
    async (userMessage: string, currentMessages: Message[], isInitial = false) => {
      if (isLoading) return;

      const updatedMessages = isInitial
        ? currentMessages
        : [...currentMessages, { role: 'user' as const, content: userMessage }];

      if (!isInitial) {
        setMessages(updatedMessages);
      }

      setIsLoading(true);
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      try {
        const history = updatedMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: isInitial ? 'Hello, I am ready to start my onboarding assessment.' : userMessage,
            agent: 'Baseline Ben',
            history: isInitial ? [] : history,
            responseFormat: 'standard',
            mode: 'onboarding',
          }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';
        let assistantText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (!data) continue;
            try {
              const event = JSON.parse(data);
              if (event.type === 'text') {
                assistantText += event.text;
                const displayText = assistantText
                  .replace(/\n?ROADMAP_ACCEPTED\s*/g, '')
                  .replace(/\n?ONBOARDING_COMPLETE\s*/g, '')
                  .trim();
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: 'assistant',
                    content: displayText,
                  };
                  return updated;
                });
              }
            } catch {
              // skip malformed JSON
            }
          }
        }

        // Save progress after each completed exchange
        const cleanedText = assistantText
          .replace(/\n?ROADMAP_ACCEPTED\s*/g, '')
          .replace(/\n?ONBOARDING_COMPLETE\s*/g, '')
          .trim();
        const fullHistory = [
          ...updatedMessages,
          { role: 'assistant' as const, content: cleanedText },
        ];
        saveOnboardingProgress(fullHistory);

        // Check for onboarding completion signal
        if (assistantText.includes('ONBOARDING_COMPLETE')) {
          const roadmapAccepted = assistantText.includes('ROADMAP_ACCEPTED');
          await handleOnboardingComplete(fullHistory, roadmapAccepted);
        }
      } catch (error) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            content: `Error: ${error instanceof Error ? error.message : 'Something went wrong'}`,
          };
          return updated;
        });
      } finally {
        setIsLoading(false);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    },
    [isLoading, handleOnboardingComplete]
  );

  useEffect(() => {
    const lastAssistantMsg = messages.filter(m => m.role === "assistant").pop();
    if (lastAssistantMsg && lastAssistantMsg.content) {
      const content = lastAssistantMsg.content.toLowerCase();
      for (const { keywords, step } of STEP_KEYWORDS) {
        if (keywords.some(kw => content.includes(kw))) {
          setCurrentStep(step);
          break;
        }
      }
    }
  }, [messages]);

  // Restore saved progress or start fresh
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const saved = loadOnboardingProgress();
    if (saved.length > 0) {
      setMessages(saved);
    } else {
      sendMessage('', [], true);
    }
  }, [sendMessage]);

  function handleSend(overrideMessage?: string) {
    const trimmed = (overrideMessage || input).trim();
    if (!trimmed || isLoading) return;
    const msg = trimmed;
    setInput('');
    sendMessage(msg, messages);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <header className="px-4 sm:px-6 py-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="max-w-3xl mx-auto flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-white rounded-lg px-2.5 py-1 flex-shrink-0">
              <Image src="/ilre-logo.png" alt="I Love Real Estate" width={100} height={47} className="h-7 w-auto" />
            </div>
            <div>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Let Baseline Ben learn about your financial position to personalise
                your experience.
              </p>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                Step {currentStep} of 4
              </span>
            </div>
          </div>
          <Link
            href="/"
            className="text-sm text-zinc-400 hover:text-white bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap flex-shrink-0"
          >
            &larr; Back
          </Link>
        </div>
      </header>
      {/* Progress bar */}
      <div className="relative" style={{ height: "3px", background: "var(--surface-3)" }}>
        <div
          className="absolute left-0 top-0 h-full transition-all duration-300 ease-out"
          style={{
            width: `${(currentStep / 4) * 100}%`,
            background: "linear-gradient(90deg, var(--primary), var(--primary-light))",
          }}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-6 max-w-3xl mx-auto w-full">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[80%] lg:max-w-[70%] px-5 py-3 ${
                msg.role === 'user'
                  ? 'text-white'
                  : 'text-zinc-100'
              }`}
              style={msg.role === 'user'
                ? { background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))', boxShadow: '0 2px 12px rgba(16, 185, 129, 0.2)', borderRadius: '18px 4px 18px 18px' }
                : { background: 'var(--surface-message)', border: '1px solid var(--border-message)', borderRadius: '4px 18px 18px 18px' }
              }
            >
              {msg.role === 'assistant' ? (
                <div className="prose prose-sm prose-invert max-w-none">
                  {msg.content ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
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
            </div>
            {msg.role === "assistant" && (() => {
              const content = msg.content.toLowerCase();
              const matchingKey = Object.keys(CHIP_OPTIONS).find(key => content.includes(key));
              if (matchingKey && i === messages.length - 1 && !isLoading) {
                return (
                  <QuickReplyChips
                    options={CHIP_OPTIONS[matchingKey]}
                    onSelect={(value) => {
                      setInput(value);
                      setTimeout(() => handleSend(value), 100);
                    }}
                  />
                );
              }
              return null;
            })()}
          </div>
        ))}
        {isExtracting && (
          <div className="text-center text-zinc-400 animate-pulse py-4">
            Analysing your financial position...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="px-4 sm:px-6 py-4 pb-safe" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-3 max-w-3xl mx-auto"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Tell Ben about your situation..."
            rows={1}
            className="flex-1 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-transparent resize-none"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-default)",
              maxHeight: "100px",
            }}
            disabled={isExtracting}
            autoFocus
          />
          <button
            type="submit"
            disabled={isLoading || isExtracting || !input.trim()}
            className="disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-medium transition-colors"
            style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))' }}
          >
            {isLoading ? '...' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );
}
