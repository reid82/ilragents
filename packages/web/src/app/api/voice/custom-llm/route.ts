import { NextRequest } from 'next/server';
import { config } from 'dotenv';
import path from 'path';
import { AGENTS } from '@/lib/agents';

config({ path: path.resolve(process.cwd(), '../../.env') });

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { messages = [] } = body;

  // Extract agent name and financial context from system message
  const systemMsg = messages.find(
    (m: { role: string }) => m.role === 'system'
  );
  const agentName =
    systemMsg?.content?.match(/You are ([^,]+),/)?.[1] || 'Baseline Ben';

  // Extract financial context if present (injected by VoiceChat overrides)
  const financialMatch = systemMsg?.content?.match(
    /---FINANCIAL_CONTEXT---\n([\s\S]*?)\n---END_FINANCIAL_CONTEXT---/
  );
  const financialContext = financialMatch?.[1] || undefined;

  // Look up agent-specific context limit
  const agentDef = AGENTS.find((a) => a.name === agentName);
  const contextLimit = agentDef?.contextLimit;

  // Build history from non-system messages
  const userMessages = messages.filter(
    (m: { role: string }) => m.role !== 'system'
  );
  const lastUserMsg = userMessages[userMessages.length - 1];
  const history = userMessages.slice(0, -1);

  if (!lastUserMsg) {
    return new Response(JSON.stringify({ error: 'No user message' }), {
      status: 400,
    });
  }

  try {
    // Look up persona override from Supabase (non-fatal)
    let systemPromptOverride: string | undefined;
    try {
      const { getSupabaseClient } = await import('@/lib/supabase');
      const supabase = getSupabaseClient();
      const { data } = await supabase
        .from('agent_personas')
        .select('system_prompt_override')
        .eq('agent_name', agentName)
        .single();
      if (data?.system_prompt_override) {
        systemPromptOverride = data.system_prompt_override;
      }
    } catch {
      // Non-fatal: proceed without persona override
    }

    const { chatStream } = await import('@ilre/pipeline/chat');

    const { stream: textStream } = await chatStream(
      lastUserMsg.content,
      history,
      {
        agent: agentName,
        contextLimit,
        responseFormat: 'concise',
        financialContext,
        systemPromptOverride,
        model:
          process.env.VOICE_CHAT_MODEL ||
          'anthropic/claude-3-5-haiku-20241022',
      }
    );

    // Return OpenAI-compatible streaming response for ElevenLabs
    const encoder = new TextEncoder();
    const sseStream = new ReadableStream({
      async start(controller) {
        const reader = textStream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = {
            id: 'chatcmpl-voice',
            object: 'chat.completion.chunk',
            choices: [
              {
                delta: { content: value },
                index: 0,
                finish_reason: null,
              },
            ],
          };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
          );
        }
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              id: 'chatcmpl-voice',
              object: 'chat.completion.chunk',
              choices: [{ delta: {}, index: 0, finish_reason: 'stop' }],
            })}\n\n`
          )
        );
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    return new Response(sseStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Voice LLM error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Voice LLM failed',
      }),
      { status: 500 }
    );
  }
}
