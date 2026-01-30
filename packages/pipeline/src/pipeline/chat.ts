/**
 * Agent Chat
 * Interactive conversational interface with ILRE agents using RAG
 */

import OpenAI from 'openai';
import { createInterface } from 'readline';
import { searchChunks } from './rag/index';
import type { SearchResult } from './rag/types';

/**
 * Agent aliases - maps composite agents to their underlying RAG source agents.
 * Baseline Ben absorbs Navigator Nate, Foundation Frank, and Roadmap Ray.
 */
export const AGENT_ALIASES: Record<string, string[]> = {
  'Baseline Ben': ['Navigator Nate', 'Foundation Frank', 'Roadmap Ray'],
};

/**
 * Resolve an agent name to the list of RAG agents to search.
 * Returns the alias list if one exists, otherwise returns the agent name as a single-item array.
 */
function resolveAgentSources(agent: string): string[] {
  return AGENT_ALIASES[agent] || [agent];
}

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
 * Response format presets
 * Controls output length, style, and formatting instructions injected into the system prompt.
 */
export type ResponseFormatPreset = 'concise' | 'standard' | 'detailed' | 'email';

export interface ResponseFormat {
  instructions: string;
  maxTokens: number;
}

const RESPONSE_FORMAT_PRESETS: Record<ResponseFormatPreset, ResponseFormat> = {
  concise: {
    instructions: `RESPONSE FORMAT:
- Keep your answer to 2-4 sentences maximum.
- No markdown formatting, no bullet points, no headings.
- Write in a direct, conversational tone.
- Still cite sources inline using (Source N) but keep it brief.`,
    maxTokens: 400,
  },
  standard: {
    instructions: `RESPONSE FORMAT:
- Answer in a few short paragraphs (3-5 paragraphs max).
- Use plain language, conversational tone.
- Light formatting is fine (bold key terms if helpful) but avoid heavy markdown.
- Cite sources inline using (Source N).`,
    maxTokens: 1500,
  },
  detailed: {
    instructions: `RESPONSE FORMAT:
- Provide a thorough, in-depth answer.
- Use headings (##), bullet points, and numbered lists to structure the response.
- Include specific examples, steps, or frameworks from the materials.
- Cite sources inline using (Source N) for every key claim.
- Aim for a comprehensive walkthrough of the topic.`,
    maxTokens: 3000,
  },
  email: {
    instructions: `RESPONSE FORMAT:
- Write as a professional but warm email reply.
- Start with a greeting (e.g. "Hi [name]," or "Great question!").
- Keep to 2-4 short paragraphs in the body.
- End with a friendly sign-off and the agent's name.
- No markdown formatting - plain text only, suitable for email.
- Do NOT include (Source N) citations in the email body. The sources are tracked separately.`,
    maxTokens: 1200,
  },
};

/**
 * Resolve a response format from a preset name or custom instruction string
 */
export function resolveResponseFormat(format?: string): ResponseFormat {
  if (!format) return RESPONSE_FORMAT_PRESETS.standard;
  if (format in RESPONSE_FORMAT_PRESETS) {
    return RESPONSE_FORMAT_PRESETS[format as ResponseFormatPreset];
  }
  // Custom instruction string
  return {
    instructions: `RESPONSE FORMAT:\n${format}`,
    maxTokens: 2000,
  };
}

/**
 * Build the system prompt for an agent
 */
export function buildSystemPrompt(agent: string, context: SearchResult[], format: ResponseFormat): string {
  const contextBlocks = context.map((r, i) => {
    const src = r.chunk.metadata;
    return `[Source ${i + 1}: "${src.title}" (${src.contentType})]
${r.chunk.text}`;
  }).join('\n\n---\n\n');

  const hasContext = context.length > 0;

  return `You are ${agent}, a real estate investing education instructor at I Love Real Estate (ILRE).

CRITICAL RULES - you must follow these without exception:
1. ONLY use information from the source materials provided below. Do NOT draw on general knowledge, outside information, or anything not explicitly stated in the materials.
2. When answering, directly reference and quote the source materials. Use phrases like "In [Source Title], we cover..." or "As explained in [Source Title]..." to ground every claim.
3. For each key point you make, cite which source it comes from using the format (Source N) at the end of the relevant sentence or paragraph.
4. If the provided materials do not contain information to answer the question, say: "That's not something I cover in my materials. Let me know if you have questions about [list 2-3 topics your sources DO cover]."
5. NEVER fabricate, infer beyond what's stated, or fill gaps with general real estate knowledge. If the materials only partially address a topic, share what they cover and be clear about where your materials stop.
6. Keep answers practical and grounded in the specific frameworks, steps, and examples from the materials.

${format.instructions}

${hasContext ? `Here are your source materials for this question:

${contextBlocks}` : 'No relevant source materials were found for this question. Tell the user this topic is not covered in your current materials and suggest they ask about topics you do cover.'}`;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  agent: string;
  model?: string;
  contextLimit?: number;
  minScore?: number;
  responseFormat?: string;
  financialContext?: string;
  systemPromptOverride?: string;
}

/**
 * Prepare chat context: RAG search + system prompt + message assembly
 */
async function prepareChatContext(
  query: string,
  history: ChatMessage[],
  options: ChatOptions
): Promise<{
  messages: ChatMessage[];
  sources: SearchResult[];
  model: string;
  format: ResponseFormat;
}> {
  const {
    agent,
    model = process.env.CHAT_MODEL || 'anthropic/claude-opus-4.5',
    contextLimit = 15,
    minScore = 0.45,
    responseFormat: formatInput,
    financialContext,
    systemPromptOverride,
  } = options;

  const format = resolveResponseFormat(formatInput);

  // Search for relevant chunks - expand aliases for composite agents
  const ragAgents = resolveAgentSources(agent);
  let results: SearchResult[];

  if (ragAgents.length === 1) {
    results = await searchChunks({
      query,
      agent: ragAgents[0],
      limit: contextLimit,
      contentLayer: 'raw',
      minScore,
    });
  } else {
    // Multi-agent search: query each agent and merge results by score
    const perAgent = Math.ceil(contextLimit / ragAgents.length);
    const allResults = await Promise.all(
      ragAgents.map(a => searchChunks({
        query,
        agent: a,
        limit: perAgent,
        contentLayer: 'raw',
        minScore,
      }))
    );
    results = allResults
      .flat()
      .sort((a, b) => b.score - a.score)
      .slice(0, contextLimit);
    results.forEach((r, i) => { r.rank = i + 1; });
  }

  // Build system prompt with context
  let systemPrompt: string;
  if (systemPromptOverride) {
    // Use custom override as base, append RAG materials and format instructions
    const contextBlocks = results.map((r, i) => {
      const src = r.chunk.metadata;
      return `[Source ${i + 1}: "${src.title}" (${src.contentType})]\n${r.chunk.text}`;
    }).join('\n\n---\n\n');

    const parts = [systemPromptOverride];
    if (financialContext) {
      parts.push(`CLIENT FINANCIAL POSITION:\n${financialContext}`);
    }
    parts.push(format.instructions);
    if (results.length > 0) {
      parts.push(`Here are your source materials for this question:\n\n${contextBlocks}`);
    }
    systemPrompt = parts.join('\n\n');
  } else {
    systemPrompt = buildSystemPrompt(agent, results, format);

    // Inject financial context if provided
    if (financialContext) {
      systemPrompt = systemPrompt.replace(
        format.instructions,
        `CLIENT FINANCIAL POSITION:\n${financialContext}\n\n${format.instructions}`
      );
    }
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: query },
  ];

  return { messages, sources: results, model, format };
}

/**
 * Send a single message and get a response
 */
export async function chat(
  query: string,
  history: ChatMessage[],
  options: ChatOptions
): Promise<{ reply: string; sources: SearchResult[] }> {
  const { messages, sources, model, format } = await prepareChatContext(query, history, options);

  const client = getOpenRouterClient();
  const response = await client.chat.completions.create({
    model,
    messages,
    temperature: 0.2,
    max_tokens: format.maxTokens,
  });

  const reply = response.choices[0]?.message?.content || 'No response generated.';
  return { reply, sources };
}

/**
 * Send a message and get a streaming response
 * Returns the sources immediately and a ReadableStream of text chunks
 */
export async function chatStream(
  query: string,
  history: ChatMessage[],
  options: ChatOptions
): Promise<{ stream: ReadableStream<string>; sources: SearchResult[] }> {
  const { messages, sources, model, format } = await prepareChatContext(query, history, options);

  const client = getOpenRouterClient();
  const response = await client.chat.completions.create({
    model,
    messages,
    temperature: 0.2,
    max_tokens: format.maxTokens,
    stream: true,
  });

  const stream = new ReadableStream<string>({
    async start(controller) {
      for await (const chunk of response) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) {
          controller.enqueue(text);
        }
      }
      controller.close();
    },
  });

  return { stream, sources };
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
