import OpenAI from 'openai';

export interface ExtractedFinancialData {
  income?: number;
  expenses?: number;
  existingProperties?: number;
  equity?: number;
  borrowingCapacity?: number;
  investmentGoal?: string;
  timeHorizon?: string;
  riskTolerance?: string;
  summary: string;
}

function getOpenRouterClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is required');

  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
    defaultHeaders: {
      'HTTP-Referer': 'https://ilragents.app',
      'X-Title': 'ILRE Agents Onboarding',
    },
  });
}

export async function extractFinancialContext(
  transcript: string
): Promise<ExtractedFinancialData> {
  const client = getOpenRouterClient();

  const response = await client.chat.completions.create({
    model: 'openai/gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a financial data extraction assistant. Given a conversation transcript between an onboarding agent and a client, extract structured financial data.

Return JSON with these fields (all optional except summary):
{
  "income": number or null (annual gross income in AUD),
  "expenses": number or null (annual expenses in AUD),
  "existingProperties": number or null (count of investment properties),
  "equity": number or null (estimated total equity in AUD),
  "borrowingCapacity": number or null (estimated borrowing capacity in AUD),
  "investmentGoal": string or null (brief description of investment goals),
  "timeHorizon": string or null (e.g. "5-10 years"),
  "riskTolerance": string or null (e.g. "moderate", "conservative", "aggressive"),
  "summary": string (a 2-4 sentence summary of the client's financial position suitable for injecting into an AI agent prompt)
}

If a field cannot be determined from the conversation, set it to null.
The summary field is REQUIRED - always provide a useful summary even from partial data.`,
      },
      {
        role: 'user',
        content: transcript,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 500,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response from extraction');

  return JSON.parse(content) as ExtractedFinancialData;
}
