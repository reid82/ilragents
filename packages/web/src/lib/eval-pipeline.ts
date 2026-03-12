import { getSupabaseClient } from './supabase';

export const EVAL_TOPICS = [
  'Property Strategy',
  'Tax & Structure',
  'Borrowing Capacity',
  'Equity & LVR',
  'Market Analysis',
  'Cash Flow',
  'Insurance',
  'Depreciation',
  'Risk Management',
  'General / Other',
] as const;

const EVAL_RUBRIC = `You are an expert evaluator for a property investment advisory AI. You will evaluate the quality of an AI assistant's response to a user's question.

Score each criterion from 0.0 to 1.0:

**Accuracy (0.0-1.0):**
- 1.0: All factual claims are correct, financial calculations are accurate, advice aligns with Australian property investment best practices
- 0.7-0.9: Mostly accurate with minor imprecisions that wouldn't mislead
- 0.4-0.6: Contains some inaccuracies or oversimplifications that could mislead
- 0.0-0.3: Contains significant factual errors or dangerous financial advice

**Relevance (0.0-1.0):**
- 1.0: Directly addresses the user's specific situation using their financial profile data, highly personalized
- 0.7-0.9: Addresses the question well with some personalization
- 0.4-0.6: Generic advice that doesn't leverage available profile data
- 0.0-0.3: Off-topic or ignores the user's specific circumstances

**Grounding (0.0-1.0):**
- 1.0: All claims are supported by the provided source materials, properly references ILR methodology
- 0.7-0.9: Mostly grounded with minor unsupported claims that are common knowledge
- 0.4-0.6: Mix of grounded and ungrounded claims
- 0.0-0.3: Makes significant claims with no source support (hallucination)

Also classify the topic of the user's question into exactly one of these categories:
${EVAL_TOPICS.map(t => `- ${t}`).join('\n')}

Respond with ONLY valid JSON (no markdown, no code fences):
{
  "accuracy": { "score": <number>, "reasoning": "<string>" },
  "relevance": { "score": <number>, "reasoning": "<string>" },
  "grounding": { "score": <number>, "reasoning": "<string>" },
  "topic": "<string>"
}`;

const SUGGESTION_PROMPT = `You are analysing a flagged AI response from a property investment advisor. The response was flagged because one or more quality scores fell below threshold.

Based on the eval results, classify the primary failure into exactly one category and suggest a fix:

Categories:
- knowledge_gap: The knowledge base doesn't cover this topic adequately
- hallucination: The response contains claims not supported by source materials
- prompt_weakness: The system prompt doesn't instruct the advisor to handle this scenario well
- personalization_miss: The response is generic despite available profile data

Respond with ONLY valid JSON (no markdown, no code fences):
{
  "category": "<one of the four categories>",
  "description": "<what the issue is, 1-2 sentences>",
  "suggested_fix": "<specific, actionable improvement recommendation>"
}`;

interface TriggerEvalParams {
  messageId: string;
  conversationId: string;
  userId: string;
  query: string;
  assistantText: string;
  sources: Array<{ title: string; score: number; contentType?: string; agent?: string }>;
}

export async function triggerEval(params: TriggerEvalParams): Promise<void> {
  // Check kill switch
  if (process.env.EVAL_ENABLED === 'false') return;

  const { messageId, conversationId, userId, query, assistantText, sources } = params;
  const supabase = getSupabaseClient();

  // Create eval run record
  const { data: evalRun, error: runError } = await supabase
    .from('eval_runs')
    .insert({ status: 'running', messages_evaluated: 1 })
    .select('id')
    .single();

  if (runError || !evalRun) {
    console.error('Failed to create eval run:', runError);
    return;
  }

  try {
    // Fetch user's financial profile for context
    let profileContext = '';
    const { data: profile } = await supabase
      .from('financial_positions')
      .select('structured_data, summary')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (profile) {
      profileContext = profile.summary || JSON.stringify(profile.structured_data || {});
    }

    // Call LLM judge
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        'HTTP-Referer': 'https://ilragents.app',
        'X-Title': 'ILRE Eval Pipeline',
      },
    });

    const evalModel = process.env.EVAL_MODEL || 'anthropic/claude-sonnet-4';

    const sourcesText = sources.length > 0
      ? sources.map(s => `- ${s.title} (score: ${s.score.toFixed(2)}, type: ${s.contentType || 'unknown'})`).join('\n')
      : 'No sources cited.';

    const response = await client.chat.completions.create({
      model: evalModel,
      max_tokens: 1000,
      messages: [
        { role: 'system', content: EVAL_RUBRIC },
        {
          role: 'user',
          content: `USER'S QUESTION:\n${query}\n\nASSISTANT'S RESPONSE:\n${assistantText}\n\nUSER'S FINANCIAL PROFILE:\n${profileContext || 'Not available'}\n\nSOURCES CITED:\n${sourcesText}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty eval response');

    const evalResult = JSON.parse(content);

    const accuracyScore = evalResult.accuracy?.score ?? 0;
    const relevanceScore = evalResult.relevance?.score ?? 0;
    const groundingScore = evalResult.grounding?.score ?? 0;
    const overallScore = accuracyScore * 0.4 + relevanceScore * 0.3 + groundingScore * 0.3;
    const flagged = accuracyScore < 0.6 || relevanceScore < 0.6 || groundingScore < 0.6;
    const topic = evalResult.topic || 'General / Other';

    // Insert message eval
    const { data: evalRecord, error: evalError } = await supabase
      .from('message_evals')
      .insert({
        message_id: messageId,
        conversation_id: conversationId,
        eval_run_id: evalRun.id,
        accuracy_score: accuracyScore,
        accuracy_reasoning: evalResult.accuracy?.reasoning || '',
        relevance_score: relevanceScore,
        relevance_reasoning: evalResult.relevance?.reasoning || '',
        grounding_score: groundingScore,
        grounding_reasoning: evalResult.grounding?.reasoning || '',
        overall_score: overallScore,
        topic,
        flagged,
      })
      .select('id')
      .single();

    if (evalError) throw evalError;

    // Update eval run to completed
    await supabase
      .from('eval_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        avg_accuracy: accuracyScore,
        avg_relevance: relevanceScore,
        avg_grounding: groundingScore,
      })
      .eq('id', evalRun.id);

    // If flagged, generate improvement suggestion
    if (flagged && evalRecord) {
      await generateSuggestion({
        evalId: evalRecord.id,
        query,
        assistantText,
        sources: sourcesText,
        profile: profileContext,
        evalResult,
      }).catch(console.error);
    }
  } catch (error) {
    console.error('Eval pipeline error:', error);
    await supabase
      .from('eval_runs')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('id', evalRun.id);
  }
}

async function generateSuggestion(params: {
  evalId: string;
  query: string;
  assistantText: string;
  sources: string;
  profile: string;
  evalResult: Record<string, unknown>;
}): Promise<void> {
  const { evalId, query, assistantText, sources, profile, evalResult } = params;

  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultHeaders: {
      'HTTP-Referer': 'https://ilragents.app',
      'X-Title': 'ILRE Eval Pipeline',
    },
  });

  const evalModel = process.env.EVAL_MODEL || 'anthropic/claude-sonnet-4';

  const response = await client.chat.completions.create({
    model: evalModel,
    max_tokens: 500,
    messages: [
      { role: 'system', content: SUGGESTION_PROMPT },
      {
        role: 'user',
        content: `EVAL SCORES:\n${JSON.stringify(evalResult, null, 2)}\n\nUSER'S QUESTION:\n${query}\n\nASSISTANT'S RESPONSE:\n${assistantText}\n\nSOURCES:\n${sources}\n\nUSER PROFILE:\n${profile || 'Not available'}`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return;

  const suggestion = JSON.parse(content);

  const supabase = getSupabaseClient();
  await supabase.from('improvement_suggestions').insert({
    eval_id: evalId,
    category: suggestion.category,
    description: suggestion.description,
    suggested_fix: suggestion.suggested_fix,
    status: 'pending',
  });
}
