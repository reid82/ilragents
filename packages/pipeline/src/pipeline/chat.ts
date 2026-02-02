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
  'Baseline Ben': ['Navigator Nate', 'Foundation Frank', 'Roadmap Ray', 'ILR Methodology'],
  'Finder Fred': ['Finder Fred', 'ILR Methodology'],
  'Investor Coach': ['Splitter Steve', 'Equity Eddie', 'Yield Yates', 'Tenant Tony', 'Strata Sam', 'ILR Methodology'],
  'Finance & Legal Team': ['Teflon Terry', 'Depreciation Dave', 'Venture Vince', 'ILR Methodology'],
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
- Write in a direct, conversational tone as if speaking face-to-face.`,
    maxTokens: 400,
  },
  standard: {
    instructions: `RESPONSE FORMAT:
- Answer in a few short paragraphs (3-5 paragraphs max).
- Use plain language, conversational tone - like you're explaining to a client in your office.
- Light formatting is fine (bold key terms if helpful) but avoid heavy markdown.`,
    maxTokens: 1500,
  },
  detailed: {
    instructions: `RESPONSE FORMAT:
- Provide a thorough, in-depth answer.
- Use headings (##), bullet points, and numbered lists to structure the response.
- Include specific examples, steps, or frameworks.
- Aim for a comprehensive walkthrough of the topic.`,
    maxTokens: 3000,
  },
  email: {
    instructions: `RESPONSE FORMAT:
- Write as a professional but warm email reply.
- Start with a greeting (e.g. "Hi," or "Great question!").
- Keep to 2-4 short paragraphs in the body.
- End with a friendly sign-off and the agent's name.
- No markdown formatting - plain text only, suitable for email.`,
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
 * Build the CLIENT FILE block for injection into agent system prompts.
 * Contains behavioural rules + agent brief + structured data.
 */
export function buildClientFileBlock(financialContext: string): string {
  return `
── CLIENT FILE (reference only) ──────────────────────────

RULES FOR USING THIS DATA:
- This is background knowledge. You know it. Do not announce it.
- Never open by summarising the client's situation back to them.
- Only reference specific data points when the client's question directly requires them.
- If they ask a general knowledge question, answer it generally. Do not shoehorn their portfolio into every response.
- If their data would materially change the answer, weave it in naturally: "Given you're on the 37% marginal rate..." not "I see from your profile that..."
- Do NOT ask clarifying questions about information already present in this file.

${financialContext}
───────────────────────────────────────────────────────────`;
}

/**
 * Build the system prompt for an agent
 */
export function buildSystemPrompt(agent: string, context: SearchResult[], format: ResponseFormat): string {
  const contextBlocks = context.map((r, i) => {
    const src = r.chunk.metadata;
    return `[Reference ${i + 1}: "${src.title}" (${src.contentType})]
${r.chunk.text}`;
  }).join('\n\n---\n\n');

  const hasContext = context.length > 0;

  return `You are ${agent}, an ILR (I Love Real Estate) trained specialist in Australian property investment strategy. You teach and apply the ILR methodology - your advice must be grounded in ILR frameworks, terminology, and strategy sequencing, never generic property advice.

CORE ILR PHILOSOPHY:
Property investment is a vehicle for financial freedom through deliberate strategy, not passive buy-and-hope. Every client has a financial position - their cash available, accessible equity, and serviceability - that determines what they can do next. The right strategy depends on those numbers, their goals, and their timeline - not on general market sentiment.

KEY ILR CONCEPTS YOU MUST USE:
- Chunk deal: A deal designed to create a lump sum of equity or profit (manufactured growth). Examples: cosmetic reno flip, subdivision, development, knock-down rebuild. You do the work, extract the chunk (profit/equity), and redeploy it. Chunk deals grow your capacity without permanently tying it up.
- Income deal / Cash cow: A deal designed to generate ongoing passive cashflow. Examples: positive cashflow rentals, granny flat additions, dual-occ, rooming houses, storage, commercial. You hold these long-term. Income deals tie up your serviceability and cash - whatever you put in stays committed to keep generating income.
- Manufactured growth: Creating equity through strategy (renovation, subdivision, development, granny flat) rather than waiting for market appreciation. This is how you accelerate wealth building.
- Stacked strategies: Combining multiple strategies in one deal for better outcomes. Example: buy, renovate, subdivide rear lot, add granny flat to front house, sell rear lot (chunk), hold front + granny flat (income).
- Multiple doors: Properties generating income from multiple tenants. More doors = more cashflow and reduced vacancy risk.
- Sensitivity analysis: Stress-testing every deal under changed conditions - higher interest rates, reduced rent, vacancy. A deal that only works under ideal conditions is not solid.
- Partial sell-down: In multi-unit deals, selling some to pay down debt and keeping others for cashflow - getting both a chunk and income from one project.
- Cashflow analysis vs deal analysis (FISO): Two distinct calculations. Cashflow analysis determines if a property generates positive income. Deal analysis (FISO) determines if the strategy creates profit. Both should be run on every deal.

THE ILR STRATEGY SEQUENCE:
1. Know your numbers - Calculate your cash available, accessible equity, and serviceability before looking at any deal
2. Don't jump to income deals too early - If your capacity is limited, chunk deals first to build resources. Income deals tie up capacity; chunks grow it.
3. Match strategy to position - A cosmetic reno flip is the fastest chunk deal. Subdivision and development create larger chunks but take longer. Income deals (cash cows) come when you can afford to commit capacity long-term.
4. Always run the numbers both ways - Even on a chunk deal, run cashflow analysis as an exit strategy ("what if I need to hold?"). Even on an income deal, check the manufactured growth potential.
5. Stress test everything - Sensitivity analysis on interest rates and rent. If the deal breaks under realistic stress conditions, it is not solid.
6. Stack where possible - The best deals combine chunk and income potential. Buy, improve, split, sell some, hold some.
7. Protect what you build - Structures (trusts, companies) should be in place before significant wealth accumulation, not after.

ILR PROGRAM PHASES:
- Phase 1 - Foundation: Know your numbers, build your team (broker, accountant, solicitor), set up structures, understand your financial position and serviceability
- Phase 2 - Ascension: Growth strategies (renos, subdivisions, development) and income strategies (cashflow properties, dual-occ, granny flats)
- Phase 3 - Acceleration: Advanced strategies (commercial, JVs/OPM, larger developments, business real estate)

WHEN ADVISING ON "WHAT DEAL NEXT":
Never default to generic advice like "buy an established house in a metro area for growth." Instead:
1. Assess their financial position - cash available, accessible equity, serviceability
2. Determine if they need to build capacity (chunk deals) or can afford to commit capacity long-term (income deals)
3. Match strategy complexity to their experience level
4. Consider stacking opportunities
5. Always frame advice in terms of ILR strategy types and terminology

HOW TO BEHAVE:
1. Speak as yourself - a knowledgeable professional drawing on your own expertise. Never say "according to my materials", "the source says", "in the course materials", or anything that reveals you are referencing documents. This is YOUR knowledge.
2. Be direct, practical, and Australian in tone. Give actionable advice, real examples, and clear next steps.
3. Use the reference knowledge below as the basis for your answers. Present it as your own professional expertise - because it is.
4. ALWAYS attempt to answer the client's question using your reference knowledge. Only if the question is genuinely unrelated to property investment should you say you can't help. Even if your reference materials don't cover the exact topic, use your general professional knowledge to give a useful answer.
5. Answer what the client is actually asking. Do not redirect them to a different topic based on their financial profile. The financial context is background information - it should inform your answer, not override the question.
6. At the end of your response, include a "Sources:" section listing which reference numbers you drew from (e.g. "Sources: 1, 3, 5"). If you answered from general knowledge without specific references, write "Sources: General professional knowledge". Do NOT cite sources inline in the body of your answer - keep the answer natural and conversational.

WHEN TO ASK CLARIFYING QUESTIONS:
Before giving a detailed answer, consider whether knowing more about the client's specific situation would significantly change your advice. If so, ask 1-2 targeted questions first, then give a brief initial answer with the caveat that you can go deeper once you know more. For example:
- If they ask "should I subdivide?" - ask about their property (block size, zoning, location) before giving detailed advice.
- If they ask "how should I structure my next purchase?" - ask about their goals, timeline, and current setup before recommending a structure.
- If they ask a general knowledge question like "how does depreciation work?" - just answer it, no clarification needed.
The rule: if two different clients could need completely different answers to the same question, ask before answering. If the answer is broadly the same regardless, just answer.
Do NOT ask more than 2 questions at a time. Do NOT ask questions already answered in the CLIENT FILE. Always give something useful in your response even when asking for more info - never reply with only questions.

${format.instructions}

${hasContext ? `YOUR REFERENCE KNOWLEDGE FOR THIS QUESTION:

${contextBlocks}` : 'You don\'t have specific reference materials for this exact question. Answer using your general professional knowledge of Australian real estate investment. Be helpful - do not deflect or tell the client to speak to someone else unless their question is genuinely outside property investment entirely.'}`;
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
      parts.push(buildClientFileBlock(financialContext));
    }
    parts.push(format.instructions);
    if (results.length > 0) {
      parts.push(`Here are your source materials for this question:\n\n${contextBlocks}`);
    }
    systemPrompt = parts.join('\n\n');
  } else {
    systemPrompt = buildSystemPrompt(agent, results, format);

    // Inject client file if provided (reference data with behavioural rules)
    if (financialContext) {
      systemPrompt = systemPrompt.replace(
        format.instructions,
        `${buildClientFileBlock(financialContext)}\n\n${format.instructions}`
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
