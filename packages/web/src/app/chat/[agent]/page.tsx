"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import { getAgentById } from "@/lib/agents";
import { useFinancialStore } from "@/lib/stores/financial-store";
import { use } from "react";

const VoiceChat = dynamic(() => import("@/components/VoiceChat"), {
  ssr: false,
});

interface Source {
  title: string;
  score: number;
  contentType: string;
  agent: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

type ResponseFormat = "concise" | "standard" | "detailed";

export default function ChatPage({
  params,
}: {
  params: Promise<{ agent: string }>;
}) {
  const { agent: agentSlug } = use(params);
  const agent = getAgentById(agentSlug);

  const financialPosition = useFinancialStore((s) => s.position);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [format, setFormat] = useState<ResponseFormat>("standard");
  const [showVoice, setShowVoice] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!agent) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Agent not found</h1>
          <Link href="/" className="text-blue-400 hover:underline">
            Back to Round Table
          </Link>
        </div>
      </div>
    );
  }

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="animate-pulse text-zinc-500">Loading...</div>
      </div>
    );
  }

  async function handleSend() {
    if (!input.trim() || isLoading || !agent) return;

    const userMessage = input.trim();
    setInput("");

    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    // Add placeholder for assistant message
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", sources: [] },
    ]);

    try {
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: userMessage,
          agent: agent.name,
          history,
          responseFormat: format,
          financialContext: financialPosition?.summary || undefined,
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

        // Parse SSE events from buffer
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
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: assistantText,
                  sources,
                };
                return updated;
              });
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      // Final update with sources
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: assistantText,
          sources,
        };
        return updated;
      });
    } catch (error) {
      const isNetworkError =
        error instanceof TypeError && error.message === "Failed to fetch";
      const errorMessage = isNetworkError
        ? "Network error - please check your connection and try again."
        : error instanceof Error
          ? error.message
          : "Something went wrong";

      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: `Error: ${errorMessage}`,
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-800 px-4 sm:px-6 py-4 flex flex-wrap items-center gap-3 sm:gap-4">
        <Link
          href="/"
          className="text-zinc-400 hover:text-white transition-colors"
        >
          &larr; Back
        </Link>
        <div className="flex items-center gap-3 flex-1">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
            style={{ backgroundColor: agent.color }}
          >
            {agent.name
              .split(" ")
              .map((w) => w[0])
              .join("")}
          </div>
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
            className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="concise">Concise</option>
            <option value="standard">Standard</option>
            <option value="detailed">Detailed</option>
          </select>
          <button
            onClick={() => setShowVoice(true)}
            className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-white hover:bg-zinc-700 transition-colors"
          >
            Voice
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {messages.length === 0 && (
          <div className="text-center text-zinc-500 mt-20">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl mx-auto mb-4"
              style={{ backgroundColor: agent.color }}
            >
              {agent.name
                .split(" ")
                .map((w) => w[0])
                .join("")}
            </div>
            <p className="text-lg font-medium mb-2">
              Ask {agent.name} anything
            </p>
            <p className="text-sm max-w-md mx-auto">{agent.description}</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[90%] sm:max-w-[75%] rounded-2xl px-5 py-3 ${
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-800/80 text-zinc-100"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-sm prose-invert max-w-none prose-p:my-2 prose-headings:my-3 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5">
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

              {/* Sources */}
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
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-zinc-800 px-6 py-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-3 max-w-4xl mx-auto"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask ${agent.name}...`}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-medium transition-colors"
          >
            {isLoading ? "..." : "Send"}
          </button>
        </form>
      </div>

      {/* Voice Chat Modal */}
      {showVoice && (
        <VoiceChat
          agentSlug={agent.id}
          agentName={agent.name}
          agentDomain={agent.domain}
          agentColor={agent.color}
          financialContext={financialPosition?.summary || undefined}
          onClose={() => setShowVoice(false)}
        />
      )}
    </div>
  );
}
