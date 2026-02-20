import { NextRequest } from 'next/server';
import { config } from 'dotenv';
import path from 'path';
import type { ClientProfile } from '@/lib/stores/financial-store';

config({ path: path.resolve(process.cwd(), '../../.env') });

// Allow up to 10 minutes for the full generation pipeline
export const maxDuration = 600;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { profile, sessionId, userId } = body as {
      profile: ClientProfile;
      sessionId: string;
      userId?: string;
    };

    if (!profile || !sessionId) {
      return new Response(
        JSON.stringify({ error: 'profile and sessionId are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check for existing generating/completed roadmap for this session
    const { getSupabaseClient } = await import('@/lib/supabase');
    const supabase = getSupabaseClient();
    const { data: existing } = await supabase
      .from('roadmaps')
      .select('id, status')
      .eq('session_id', sessionId)
      .in('status', ['generating', 'completed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existing) {
      if (existing.status === 'completed') {
        return new Response(
          JSON.stringify({ roadmapId: existing.id, status: 'completed', message: 'Roadmap already exists' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (existing.status === 'generating') {
        return new Response(
          JSON.stringify({ roadmapId: existing.id, status: 'generating', message: 'Roadmap already generating' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // SSE stream for real-time progress
    // The client may navigate away while generation continues in the background.
    // Guard all enqueue calls so a closed controller doesn't crash the generator.
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        const sendEvent = (data: Record<string, unknown>) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            closed = true;
          }
        };

        try {
          const { generateRoadmap } = await import('@/lib/roadmap-generator');

          sendEvent({ type: 'started', message: 'Generating your roadmap...' });

          const result = await generateRoadmap(
            profile,
            sessionId,
            userId,
            (sectionsCompleted, sectionLabel) => {
              sendEvent({
                type: 'progress',
                sectionsCompleted,
                totalSections: 8,
                currentSection: sectionLabel,
              });
            }
          );

          sendEvent({
            type: 'completed',
            roadmapId: result.roadmapId,
            reportData: result.data,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Generation failed';
          console.error('Roadmap generation error:', error);
          sendEvent({ type: 'error', message });
        } finally {
          if (!closed) {
            try { controller.close(); } catch { /* already closed */ }
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Roadmap generate route error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
