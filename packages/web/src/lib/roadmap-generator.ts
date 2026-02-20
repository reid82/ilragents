/**
 * Roadmap Generation Engine
 *
 * Orchestrates the full report pipeline:
 *  1. Create DB row (status: generating)
 *  2. Run targeted RAG searches per section
 *  3. Generate sections 2-4 in parallel, then 5-7 in parallel, then 8, then 1
 *  4. Extract structured data
 *  5. Assemble markdown and save to DB
 */

import OpenAI from 'openai';
import { config } from 'dotenv';
import path from 'path';
import type { ClientProfile } from './stores/financial-store';
import type { RoadmapData } from './stores/roadmap-store';
import {
  GENERATION_SECTIONS,
  EXECUTIVE_SUMMARY_SECTION,
  DATA_EXTRACTION_PROMPT,
} from './roadmap-prompt';
import type { SectionConfig } from './roadmap-prompt';

// Load env from repo root
config({ path: path.resolve(process.cwd(), '../../.env') });

const GENERATION_MODEL = 'anthropic/claude-opus-4.6';
const EXTRACTION_MODEL = 'anthropic/claude-opus-4.6';

function getOpenRouterClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is required');

  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
    defaultHeaders: {
      'HTTP-Referer': 'https://ilragents.app',
      'X-Title': 'ILRE Roadmap Generator',
    },
  });
}

async function getSupabase() {
  const { getSupabaseClient } = await import('./supabase');
  return getSupabaseClient();
}

// ── RAG Search ───────────────────────────────────────────

async function fetchRagContext(
  queries: SectionConfig['ragQueries']
): Promise<string> {
  if (queries.length === 0) return '';

  const { searchChunks } = await import('@ilre/pipeline/rag');

  const allResults = await Promise.all(
    queries.map(async (q) => {
      const results = await Promise.all(
        q.agents.map((agent) =>
          searchChunks({
            query: q.query,
            limit: Math.ceil(q.limit / q.agents.length),
            agent,
            minScore: 0.4,
          })
        )
      );
      return results.flat();
    })
  );

  // Deduplicate by chunk ID, keep highest score
  const seen = new Map<string, { text: string; title: string; score: number }>();
  for (const result of allResults.flat()) {
    const existing = seen.get(result.chunk.id);
    if (!existing || result.score > existing.score) {
      seen.set(result.chunk.id, {
        text: result.chunk.text,
        title: result.chunk.metadata.title,
        score: result.score,
      });
    }
  }

  // Sort by score descending, take top 15
  const sorted = [...seen.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);

  if (sorted.length === 0) return 'No relevant reference material found.';

  return sorted
    .map((r, i) => `[Reference ${i + 1}: "${r.title}" (${(r.score * 100).toFixed(0)}% match)]\n${r.text}`)
    .join('\n\n---\n\n');
}

// ── LLM Section Generation ──────────────────────────────

async function generateSection(
  section: SectionConfig,
  profile: ClientProfile,
  priorSections?: string
): Promise<string> {
  const start = Date.now();
  console.log(`[Roadmap] Starting section ${section.id}: ${section.title} - fetching RAG context...`);

  const ragContext = await fetchRagContext(section.ragQueries);
  console.log(`[Roadmap] Section ${section.id}: RAG context fetched (${((Date.now() - start) / 1000).toFixed(1)}s), calling LLM...`);

  const prompt = section.buildPrompt(profile, ragContext, priorSections);

  const client = getOpenRouterClient();
  const response = await client.chat.completions.create({
    model: GENERATION_MODEL,
    messages: [
      { role: 'user', content: prompt },
    ],
    temperature: 0.3,
    max_tokens: 3000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error(`Empty response for section ${section.id}: ${section.title}`);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[Roadmap] Section ${section.id}: ${section.title} completed (${elapsed}s, ${content.length} chars)`);

  return content.trim();
}

// ── Data Extraction ──────────────────────────────────────

async function extractStructuredData(
  fullReport: string,
  profile: ClientProfile
): Promise<RoadmapData> {
  const client = getOpenRouterClient();
  const response = await client.chat.completions.create({
    model: EXTRACTION_MODEL,
    messages: [
      { role: 'system', content: DATA_EXTRACTION_PROMPT },
      {
        role: 'user',
        content: `CLIENT PROFILE:\n${JSON.stringify(profile, null, 2)}\n\nFULL REPORT:\n${fullReport}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response from data extraction');

  const jsonStr = content.replace(/^```json?\s*\n?/, '').replace(/\n?```\s*$/, '');
  const data = JSON.parse(jsonStr) as RoadmapData;
  data.generatedAt = new Date().toISOString();
  return data;
}

// ── Progress Callback Type ───────────────────────────────

export type ProgressCallback = (sectionsCompleted: number, sectionLabel: string) => void;

// ── Main Generation Pipeline ─────────────────────────────

export async function generateRoadmap(
  profile: ClientProfile,
  sessionId: string,
  userId?: string,
  onProgress?: ProgressCallback
): Promise<{ roadmapId: string; markdown: string; data: RoadmapData }> {
  const supabase = await getSupabase();

  // 1. Create DB row
  const { data: row, error: insertError } = await supabase
    .from('roadmaps')
    .insert({
      session_id: sessionId,
      user_id: userId || null,
      status: 'generating',
      profile_snapshot: profile,
    })
    .select('id')
    .single();

  if (insertError || !row) {
    throw new Error(`Failed to create roadmap row: ${insertError?.message}`);
  }

  const roadmapId = row.id as string;
  const pipelineStart = Date.now();
  console.log(`[Roadmap] Generation started - roadmapId: ${roadmapId}, sessionId: ${sessionId}`);

  try {
    const sections: Record<number, string> = {};
    let completed = 0;

    const updateProgress = async (_sectionId: number, label: string) => {
      completed++;
      try { onProgress?.(completed, label); } catch { /* SSE may be closed */ }
      await supabase
        .from('roadmaps')
        .update({ sections_completed: completed, updated_at: new Date().toISOString() })
        .eq('id', roadmapId);
    };

    // Build prior sections text for sections that need context
    const priorText = () =>
      Object.entries(sections)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([, text]) => text)
        .join('\n\n---\n\n');

    // 2. Generate sections 2, 3, 4 in parallel (no dependencies)
    console.log('[Roadmap] Batch 1: Generating sections 2, 3, 4 in parallel...');
    await Promise.all(
      GENERATION_SECTIONS.slice(0, 3).map(async (section) => {
        const content = await generateSection(section, profile);
        sections[section.id] = content;
        await updateProgress(section.id, section.title);
      })
    );
    console.log(`[Roadmap] Batch 1 complete (${((Date.now() - pipelineStart) / 1000).toFixed(1)}s elapsed)`);

    // 3. Generate sections 5, 6, 7 in parallel (snapshot context before parallel calls)
    console.log('[Roadmap] Batch 2: Generating sections 5, 6, 7 in parallel...');
    const contextForBatch2 = priorText();
    await Promise.all(
      GENERATION_SECTIONS.slice(3, 6).map(async (section) => {
        const content = await generateSection(section, profile, contextForBatch2);
        sections[section.id] = content;
        await updateProgress(section.id, section.title);
      })
    );
    console.log(`[Roadmap] Batch 2 complete (${((Date.now() - pipelineStart) / 1000).toFixed(1)}s elapsed)`);

    // 4. Generate section 8 (needs all prior context)
    console.log('[Roadmap] Generating section 8 (Challenges & Next Steps)...');
    const section8Config = GENERATION_SECTIONS.find(s => s.id === 8) ?? GENERATION_SECTIONS[6];
    sections[8] = await generateSection(section8Config, profile, priorText());
    await updateProgress(8, section8Config.title);

    // 5. Generate section 1 (Executive Summary) last, with all sections
    console.log('[Roadmap] Generating section 1 (Executive Summary)...');
    sections[1] = await generateSection(
      EXECUTIVE_SUMMARY_SECTION,
      profile,
      priorText()
    );
    await updateProgress(1, EXECUTIVE_SUMMARY_SECTION.title);
    console.log(`[Roadmap] All sections complete (${((Date.now() - pipelineStart) / 1000).toFixed(1)}s elapsed)`);

    // 6. Assemble full markdown
    const markdown = assembleReport(sections, profile);
    console.log(`[Roadmap] Report assembled: ${markdown.length} chars`);

    // 7. Extract structured data
    console.log('[Roadmap] Extracting structured data...');
    const reportData = await extractStructuredData(markdown, profile);
    console.log(`[Roadmap] Data extraction complete. Score: ${reportData.investorScore}, Strategy: ${reportData.strategyType}`);

    // 8. Save to DB
    await supabase
      .from('roadmaps')
      .update({
        status: 'completed',
        report_markdown: markdown,
        report_data: reportData,
        sections_completed: 8,
        updated_at: new Date().toISOString(),
      })
      .eq('id', roadmapId);

    const totalTime = ((Date.now() - pipelineStart) / 1000).toFixed(1);
    console.log(`[Roadmap] Generation COMPLETE - ${totalTime}s total, roadmapId: ${roadmapId}`);

    return { roadmapId, markdown, data: reportData };
  } catch (error) {
    // Mark as failed
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Roadmap] Generation FAILED after ${((Date.now() - pipelineStart) / 1000).toFixed(1)}s:`, errorMsg);
    await supabase
      .from('roadmaps')
      .update({
        status: 'failed',
        error_message: errorMsg,
        updated_at: new Date().toISOString(),
      })
      .eq('id', roadmapId);

    throw error;
  }
}

// ── Report Assembly ──────────────────────────────────────

function assembleReport(sections: Record<number, string>, profile: ClientProfile): string {
  const date = new Date().toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const sectionOrder = [1, 2, 3, 4, 5, 6, 7, 8];
  const sectionTitles: Record<number, string> = {
    1: 'Executive Summary',
    2: 'Your Financial Position',
    3: 'Portfolio Assessment',
    4: 'Strategy Recommendation',
    5: '5-Year Investment Roadmap',
    6: 'Deal Criteria & Search Parameters',
    7: 'Structure & Protection',
    8: 'Challenges & Next Steps',
  };

  const header = `# Property Investment Roadmap

**Prepared for:** ${profile.personal.firstName}
**Date:** ${date}
**Prepared by:** I Love Real Estate AI Advisory Team

---

`;

  const body = sectionOrder
    .map((id) => {
      const title = sectionTitles[id];
      const content = sections[id] || '';
      return `## ${id}. ${title}\n\n${content}`;
    })
    .join('\n\n---\n\n');

  const disclaimer = `\n\n---\n\n*This roadmap is generated based on information provided during your onboarding assessment and is intended as general guidance only. It does not constitute personal financial advice. Property investment involves risk, and past performance is not indicative of future results. We recommend consulting with qualified professionals (mortgage broker, accountant, solicitor) before making investment decisions. Generated by I Love Real Estate AI Advisory Platform.*`;

  return header + body + disclaimer;
}
