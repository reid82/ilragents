'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { useSessionStore } from '@/lib/stores/session-store';
import { useClientProfileStore } from '@/lib/stores/financial-store';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const setOnboarded = useSessionStore((s) => s.setOnboarded);
  const setSessionId = useSessionStore((s) => s.setSessionId);
  const setProfile = useClientProfileStore((s) => s.setProfile);
  const setRawTranscript = useClientProfileStore((s) => s.setRawTranscript);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleOnboardingComplete = useCallback(
    async (fullHistory: Message[]) => {
      setIsExtracting(true);
      try {
        const transcript = fullHistory
          .map((m) => `${m.role === 'user' ? 'Client' : 'Ben'}: ${m.content}`)
          .join('\n\n');

        const sessionId = crypto.randomUUID();

        const res = await fetch('/api/onboarding/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript, sessionId }),
        });

        if (res.ok) {
          const financialData = await res.json();
          setProfile(financialData);
          setRawTranscript(transcript);
          setSessionId(sessionId);
        }

        setOnboarded(true);
        router.push('/');
      } catch (error) {
        console.error('Failed to extract financial context:', error);
        // Still mark as onboarded even if extraction fails
        setOnboarded(true);
        router.push('/');
      } finally {
        setIsExtracting(false);
      }
    },
    [router, setOnboarded, setProfile, setRawTranscript, setSessionId]
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
            responseFormat: 'concise',
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
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: 'assistant',
                    content: assistantText,
                  };
                  return updated;
                });
              }
            } catch {
              // skip malformed JSON
            }
          }
        }

        // Check for onboarding completion signal
        if (assistantText.includes('ONBOARDING_COMPLETE')) {
          const fullHistory = [
            ...updatedMessages,
            { role: 'assistant' as const, content: assistantText },
          ];
          await handleOnboardingComplete(fullHistory);
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
      }
    },
    [isLoading, handleOnboardingComplete]
  );

  // Auto-start onboarding
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    sendMessage('', [], true);
  }, [sendMessage]);

  function handleSend() {
    if (!input.trim() || isLoading) return;
    const msg = input.trim();
    setInput('');
    sendMessage(msg, messages);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <header className="border-b border-zinc-800 px-4 sm:px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-xl font-bold">Welcome to ILRE Agents</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Let Baseline Ben learn about your financial position to personalise
            your experience.
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-6 max-w-3xl mx-auto w-full">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[90%] sm:max-w-[75%] rounded-2xl px-5 py-3 ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-800/80 text-zinc-100'
              }`}
            >
              {msg.role === 'assistant' ? (
                <div className="prose prose-sm prose-invert max-w-none">
                  {msg.content ? (
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
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
          </div>
        ))}
        {isExtracting && (
          <div className="text-center text-zinc-400 animate-pulse py-4">
            Analysing your financial position...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-zinc-800 px-4 sm:px-6 py-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-3 max-w-3xl mx-auto"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tell Ben about your situation..."
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading || isExtracting}
          />
          <button
            type="submit"
            disabled={isLoading || isExtracting || !input.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-medium transition-colors"
          >
            {isLoading ? '...' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );
}
