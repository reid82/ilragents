#!/usr/bin/env tsx
/**
 * classify-topics.ts
 *
 * Classifies all raw chunks into high-level topics using GPT-4o-mini via OpenRouter.
 * Updates the `topics` text[] column in the chunks table.
 *
 * Usage:
 *   cd packages/pipeline
 *   npx tsx scripts/classify-topics.ts
 *   npx tsx scripts/classify-topics.ts --force   # re-classify even if topics exist
 *   npx tsx scripts/classify-topics.ts --dry-run  # preview without writing
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const openrouterKey = process.env.OPENROUTER_API_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required in .env');
  process.exit(1);
}
if (!openrouterKey) {
  console.error('OPENROUTER_API_KEY is required in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: openrouterKey,
  defaultHeaders: {
    'HTTP-Referer': 'https://ilragents.app',
    'X-Title': 'ILRE Agents RAG Pipeline',
  },
});

// --- Config ---
const MODEL = process.env.SUMMARIZATION_MODEL || 'openai/gpt-4o-mini';
const BATCH_SIZE = 10; // concurrent LLM calls
const PAGE_SIZE = 500; // DB fetch page size

const force = process.argv.includes('--force');
const dryRun = process.argv.includes('--dry-run');

// --- System prompt ---
const SYSTEM_PROMPT = `You are a topic classifier for real estate investing educational content from the ILR (Investor Led Renovation) methodology.

Classify the given text chunk into 1-3 HIGH-LEVEL topics from this list:

- Cash Cows (buy-and-hold rental strategy, passive income properties)
- No Money Down (creative finance, vendor finance, JV partnerships, OPM)
- Chunk Deals (subdivision, development, splitting land/titles)
- Depreciation (tax depreciation, quantity surveying, tax benefits)
- Renovation (cosmetic reno, structural reno, adding value through improvements)
- Due Diligence (research, feasibility, property analysis, number crunching)
- Deal Finding (sourcing deals, off-market, agents, marketing for deals)
- Finance & Lending (mortgages, serviceability, brokers, lending criteria)
- Strata & Body Corp (strata titles, body corporate, owners corporation)
- Negotiation (making offers, negotiation tactics, vendor psychology)
- Mindset & Strategy (goal setting, wealth mindset, portfolio strategy, planning)
- Legal & Compliance (contracts, solicitors, council regulations, planning permits)
- Tenant Management (property management, tenants, leasing, rental yield)
- Market Analysis (market cycles, suburb research, demographics, growth drivers)
- Case Studies (student wins, real examples, deal breakdowns, success stories)
- Tax & Structure (trusts, companies, tax planning, entity structures)

If the content doesn't clearly fit any category, use "General" as the topic.

Respond in JSON: { "topics": ["Topic1", "Topic2"] }
Only use topic names EXACTLY as listed above (or "General").`;

// --- Main ---
async function main() {
  console.log(`Classifying topics using ${MODEL}...`);
  if (dryRun) console.log('  (dry run — no DB writes)');
  if (force) console.log('  (force mode — re-classifying all chunks)');

  // Count chunks to classify
  let countQuery = supabase
    .from('chunks')
    .select('*', { count: 'exact', head: true })
    .eq('content_layer', 'raw')
    .not('text', 'is', null);

  if (!force) {
    // Only classify chunks that don't have topics yet
    countQuery = countQuery.or('topics.is.null,topics.eq.{}');
  }

  const { count } = await countQuery;
  console.log(`Found ${count} chunks to classify.`);

  if (!count || count === 0) {
    console.log('Nothing to do.');
    return;
  }

  let offset = 0;
  let classified = 0;
  let errors = 0;
  const t0 = Date.now();

  while (offset < count) {
    // Fetch a page of chunks
    let query = supabase
      .from('chunks')
      .select('id, text, title, agent, content_type')
      .eq('content_layer', 'raw')
      .not('text', 'is', null)
      .range(offset, offset + PAGE_SIZE - 1);

    if (!force) {
      query = query.or('topics.is.null,topics.eq.{}');
    }

    const { data: chunks, error } = await query;
    if (error) throw error;
    if (!chunks || chunks.length === 0) break;

    // Process in batches of BATCH_SIZE concurrent calls
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(async (chunk) => {
          const text = (chunk.text || '').substring(0, 1500); // limit token usage
          const context = `Source: "${chunk.title || 'Unknown'}" (${chunk.content_type || 'unknown'})`;

          const response = await openai.chat.completions.create({
            model: MODEL,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: `${context}\n\n${text}` },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.1,
            max_tokens: 100,
          });

          const content = response.choices[0]?.message?.content;
          if (!content) throw new Error('Empty LLM response');

          const parsed = JSON.parse(content);
          const topics: string[] = parsed.topics || ['General'];

          return { id: chunk.id, topics };
        })
      );

      // Write successful results to DB
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { id, topics } = result.value;

          if (dryRun) {
            console.log(`  ${id}: ${topics.join(', ')}`);
          } else {
            const { error: updateError } = await supabase
              .from('chunks')
              .update({ topics })
              .eq('id', id);

            if (updateError) {
              console.error(`  Error updating ${id}:`, updateError.message);
              errors++;
            }
          }
          classified++;
        } else {
          console.error(`  LLM error:`, result.reason?.message || result.reason);
          errors++;
        }
      }

      process.stdout.write(`\r  ${classified}/${count} classified (${errors} errors)`);
    }

    offset += chunks.length;
  }

  console.log();
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`Done! Classified ${classified} chunks in ${elapsed}s (${errors} errors).`);

  // Show topic distribution
  if (!dryRun) {
    const { data: all } = await supabase
      .from('chunks')
      .select('topics')
      .eq('content_layer', 'raw')
      .not('topics', 'is', null);

    if (all) {
      const topicCounts: Record<string, number> = {};
      for (const row of all) {
        for (const t of (row.topics || [])) {
          topicCounts[t] = (topicCounts[t] || 0) + 1;
        }
      }
      const sorted = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]);
      console.log('\nTopic distribution:');
      for (const [topic, cnt] of sorted) {
        console.log(`  ${cnt.toString().padStart(4)} ${topic}`);
      }
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
