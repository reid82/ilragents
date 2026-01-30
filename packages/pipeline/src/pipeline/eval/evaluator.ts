/**
 * Evaluator
 * Sends agent responses to Sonnet for rubric-based scoring.
 */

import OpenAI from 'openai';

export interface RubricCriteria {
  mustAddress: string;
  mustNotDeflect?: boolean;
  mustNotFixateOn?: string;
  shouldAskClarifying?: boolean;
  note?: string;
}

export interface EvalScore {
  relevance: number;
  helpfulness: number;
  deflection: number;
  contextAwareness: number;
  sourceGrounding: number;
  conversational: number;
}

export interface EvalResult {
  scores: EvalScore;
  justifications: Record<keyof EvalScore, string>;
  overall: number;
  flags: string[];
}

const EVAL_MODEL = 'anthropic/claude-sonnet-4';

function getEvalClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is required');
  }

  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
    defaultHeaders: {
      'HTTP-Referer': 'https://ilragents.app',
      'X-Title': 'ILRE Agents Eval',
    },
  });
}

function buildEvalPrompt(
  question: string,
  response: string,
  profileSummary: string,
  rubric: RubricCriteria
): string {
  let rubricSection = `The response MUST address: ${rubric.mustAddress}`;
  if (rubric.mustNotDeflect) {
    rubricSection += `\nThe agent should NOT deflect or tell the user to talk to someone else.`;
  }
  if (rubric.mustNotFixateOn) {
    rubricSection += `\nThe agent should NOT fixate on or steer toward: ${rubric.mustNotFixateOn}`;
  }
  if (rubric.shouldAskClarifying) {
    rubricSection += `\nThe agent SHOULD ask 1-2 clarifying questions before giving a detailed answer, because the question is situation-specific and different clients would need different advice. The agent should still give some useful initial guidance alongside the questions.`;
  }

  return `You are evaluating an AI property investment advisor's response. Score each dimension from 1 (worst) to 5 (best).

DIMENSIONS:
- relevance: Did the response directly answer the question that was asked?
- helpfulness: Was the advice actionable, specific, and useful? Did it give the user something they can act on?
- deflection: Did the agent avoid unnecessary deflection? (5 = answered fully, 1 = told user to talk to someone else or refused to help)
- contextAwareness: Did the agent use the financial profile as helpful background without letting it dominate or redirect the answer? (5 = profile informed but didn't override, 1 = ignored the question and focused on profile goals)
- sourceGrounding: Did the response feel grounded in real knowledge rather than vague or hallucinated? (5 = specific and authoritative, 1 = generic platitudes)
- conversational: Did the agent ask relevant clarifying questions when the answer depends on the client's specific situation? (5 = asked smart questions that would improve advice AND gave useful initial guidance, 3 = just answered without asking when it should have asked, or asked questions the profile already answers, 1 = responded with only questions and no useful content)

USER PROFILE:
${profileSummary}

QUESTION ASKED:
${question}

AGENT RESPONSE:
${response}

RUBRIC CRITERIA:
${rubricSection}

Respond with ONLY valid JSON in this exact format:
{
  "scores": {
    "relevance": <1-5>,
    "helpfulness": <1-5>,
    "deflection": <1-5>,
    "contextAwareness": <1-5>,
    "sourceGrounding": <1-5>,
    "conversational": <1-5>
  },
  "justifications": {
    "relevance": "<one line>",
    "helpfulness": "<one line>",
    "deflection": "<one line>",
    "contextAwareness": "<one line>",
    "sourceGrounding": "<one line>",
    "conversational": "<one line>"
  }
}`;
}

export async function evaluateResponse(
  question: string,
  response: string,
  profileSummary: string,
  rubric: RubricCriteria
): Promise<EvalResult> {
  const client = getEvalClient();

  const evalPrompt = buildEvalPrompt(question, response, profileSummary, rubric);

  const completion = await client.chat.completions.create({
    model: EVAL_MODEL,
    messages: [{ role: 'user', content: evalPrompt }],
    temperature: 0.0,
    max_tokens: 500,
  });

  const raw = completion.choices[0]?.message?.content || '';

  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Evaluator returned non-JSON: ${raw.slice(0, 200)}`);
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const scores: EvalScore = parsed.scores;
  const justifications = parsed.justifications;

  // Calculate overall average
  const dims = Object.values(scores) as number[];
  const overall = dims.reduce((a, b) => a + b, 0) / dims.length;

  // Flag any dimension below 3
  const flags: string[] = [];
  for (const [dim, score] of Object.entries(scores)) {
    if ((score as number) < 3) {
      flags.push(`${dim}: ${score}/5 - ${justifications[dim]}`);
    }
  }

  return { scores, justifications, overall, flags };
}
