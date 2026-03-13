import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAdminError } from '@/lib/admin-auth';
import { getSupabaseClient } from '@/lib/supabase';
import OpenAI from 'openai';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function chunkText(text: string, targetWords = 600, overlapWords = 100): string[] {
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
  const chunks: string[] = [];
  let current: string[] = [];
  let currentWords = 0;

  for (const para of paragraphs) {
    const words = para.split(/\s+/).length;
    if (currentWords + words > targetWords * 1.5 && current.length > 0) {
      chunks.push(current.join('\n\n'));
      // Keep overlap
      const overlapText = current.join('\n\n').split(/\s+/);
      const overlapStart = Math.max(0, overlapText.length - overlapWords);
      current = [overlapText.slice(overlapStart).join(' ')];
      currentWords = overlapWords;
    }
    current.push(para);
    currentWords += words;
  }
  if (current.length > 0) chunks.push(current.join('\n\n'));
  return chunks;
}

async function fetchUrlContent(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ILRE-RAG-Ingest/1.0' },
  });
  if (!res.ok) throw new Error(`Failed to fetch URL: ${res.status} ${res.statusText}`);

  const html = await res.text();

  // Use cheerio for HTML extraction
  const cheerio = await import('cheerio');
  const $ = cheerio.load(html);

  // Remove script, style, nav, footer, header elements
  $('script, style, nav, footer, header, aside, iframe, noscript').remove();

  // Try to extract main content area first
  const mainContent = $('main, article, [role="main"], .content, .post-content, .entry-content').first();
  const text = mainContent.length > 0 ? mainContent.text() : $('body').text();

  // Clean up whitespace
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAdminError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const { mode, text, url, agent, content_type, title } = body as {
      mode: 'text' | 'url';
      text?: string;
      url?: string;
      agent: string;
      content_type: string;
      title: string;
    };

    if (!mode || !agent || !content_type || !title) {
      return NextResponse.json(
        { error: 'Missing required fields: mode, agent, content_type, title' },
        { status: 400 }
      );
    }

    // Get raw content based on mode
    let rawText: string;
    if (mode === 'text') {
      if (!text) {
        return NextResponse.json({ error: 'Text content is required for mode=text' }, { status: 400 });
      }
      rawText = text;
    } else if (mode === 'url') {
      if (!url) {
        return NextResponse.json({ error: 'URL is required for mode=url' }, { status: 400 });
      }
      rawText = await fetchUrlContent(url);
    } else {
      return NextResponse.json({ error: 'Invalid mode. Use "text" or "url"' }, { status: 400 });
    }

    if (!rawText.trim()) {
      return NextResponse.json({ error: 'No content to ingest' }, { status: 400 });
    }

    // Chunk the text
    const textChunks = chunkText(rawText);
    const sourceId = slugify(title);

    // Generate embeddings for all chunks
    const openai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        'HTTP-Referer': 'https://ilragents.app',
        'X-Title': 'ILRE Agents RAG Pipeline',
      },
    });

    const embeddingResponse = await openai.embeddings.create({
      model: 'openai/text-embedding-3-small',
      input: textChunks,
    });

    // Build chunk rows for upsert
    const now = new Date().toISOString();
    const rows = textChunks.map((chunkText, i) => ({
      id: `${sourceId}--raw--${i}`,
      source_id: sourceId,
      text: chunkText,
      chunk_index: i,
      total_chunks: textChunks.length,
      word_count: chunkText.split(/\s+/).length,
      content_layer: 'raw',
      agent,
      content_type,
      source_type: mode === 'url' ? 'web' : 'manual',
      title,
      url: url || null,
      vimeo_id: null,
      topics: [],
      extracted_at: now,
      chunked_at: now,
      embedding: embeddingResponse.data[i].embedding,
    }));

    // Upsert to Supabase
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('chunks')
      .upsert(rows, { onConflict: 'id' });

    if (error) throw error;

    return NextResponse.json({ source_id: sourceId, chunks_created: rows.length });
  } catch (error) {
    console.error('Admin knowledge ingest error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to ingest content' },
      { status: 500 }
    );
  }
}
