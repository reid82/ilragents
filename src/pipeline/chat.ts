/**
 * Agent Chat
 * Interactive conversational interface with ILRE agents using RAG
 */

import OpenAI from 'openai';
import { createInterface } from 'readline';
import { searchChunks } from './rag/index.js';
import type { SearchResult } from './rag/types.js';

/**
 * Create OpenRouter client for chat completions
 */
function getOpenRouterClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is required');
  }

  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
    defaultHeaders: {
      'HTTP-Referer': 'https://ilragents.app',
      'X-Title': 'ILRE Agents Chat',
    },
  });
}

/**
 * Build the system prompt for an agent
 */
function buildSystemPrompt(agent: string, context: SearchResult[]): string {
  const contextBlocks = context.map((r, i) => {
    const src = r.chunk.metadata;
    return `[Source ${i + 1}: "${src.title}" (${src.contentType})]
${r.chunk.text}`;
  }).join('\n\n---\n\n');

  return `You are ${agent}, a real estate investing education instructor at I Love Real Estate (ILRE).

Your role:
- Answer questions about real estate investing using your training materials
- Be conversational, helpful, and encouraging
- Reference specific concepts from your materials when relevant
- If a question is outside your knowledge base, say so honestly
- Keep answers focused and practical

Here is context from your training materials to help answer the current question:

${contextBlocks}

Use this context to inform your answers. If the context doesn't cover the topic, say what you can and note that it's beyond your current materials.`;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatOptions {
  agent: string;
  model?: string;
  contextLimit?: number;
  minScore?: number;
}

/**
 * Send a single message and get a response
 */
export async function chat(
  query: string,
  history: ChatMessage[],
  options: ChatOptions
): Promise<{ reply: string; sources: SearchResult[] }> {
  const {
    agent,
    model = process.env.CHAT_MODEL || process.env.SUMMARIZATION_MODEL || 'openai/gpt-4o-mini',
    contextLimit = 8,
    minScore = 0.25,
  } = options;

  // Search for relevant chunks from this agent
  const results = await searchChunks({
    query,
    agent,
    limit: contextLimit,
    contentLayer: 'raw',
    minScore,
  });

  // Build system prompt with context
  const systemPrompt = buildSystemPrompt(agent, results);

  // Build message array
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: query },
  ];

  const client = getOpenRouterClient();

  const response = await client.chat.completions.create({
    model,
    messages,
    temperature: 0.7,
    max_tokens: 1000,
  });

  const reply = response.choices[0]?.message?.content || 'No response generated.';

  return { reply, sources: results };
}

/**
 * Run interactive chat session
 */
export async function startInteractiveChat(options: ChatOptions): Promise<void> {
  const { agent } = options;

  console.log(`\n💬 Chat with ${agent}`);
  console.log(`   Type your questions below. Type "exit" or "quit" to end.\n`);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const history: ChatMessage[] = [];

  const prompt = () => {
    rl.question(`You: `, async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      if (['exit', 'quit', 'q'].includes(trimmed.toLowerCase())) {
        console.log(`\n${agent}: Thanks for chatting! Good luck with your investing.\n`);
        rl.close();
        return;
      }

      if (trimmed.toLowerCase() === '/sources') {
        if (history.length === 0) {
          console.log('\n   No sources yet - ask a question first.\n');
        }
        prompt();
        return;
      }

      try {
        process.stdout.write(`\n${agent}: `);
        const { reply, sources } = await chat(trimmed, history, options);
        console.log(reply);

        // Show source references
        if (sources.length > 0) {
          console.log(`\n   📚 Sources (${sources.length} materials referenced):`);
          const seen = new Set<string>();
          for (const s of sources) {
            const title = s.chunk.metadata.title;
            if (!seen.has(title)) {
              seen.add(title);
              console.log(`      - ${title} (${(s.score * 100).toFixed(0)}% match)`);
            }
          }
        }
        console.log('');

        // Keep conversation history (trim to last 10 exchanges)
        history.push({ role: 'user', content: trimmed });
        history.push({ role: 'assistant', content: reply });
        if (history.length > 20) {
          history.splice(0, 2);
        }
      } catch (error) {
        console.log(`\n   Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
      }

      prompt();
    });
  };

  prompt();

  // Wait for readline to close
  await new Promise<void>((resolve) => {
    rl.on('close', resolve);
  });
}
