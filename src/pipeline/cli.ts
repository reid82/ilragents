#!/usr/bin/env node
import { program } from 'commander';
import { config } from 'dotenv';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { parseAndMergeSources, loadSources } from './parse-workbook.js';
import { calculateStatus, formatStatus, getFilteredSources, updateSourceStatus } from './status.js';
import { extractVimeoTranscript, saveTranscript } from './extractors/vimeo.js';
import { extractWebContent, saveWebContent } from './extractors/web-scraper.js';
import { extractPdfContent, savePdfContent } from './extractors/pdf.js';
import type { ContentSource, ContentType } from './types.js';
import { chat, startInteractiveChat } from './chat.js';
import {
  chunkAll,
  getChunkStats,
  loadAllChunkedSources,
  embedChunks,
  upsertChunks,
  searchChunks,
  getIngestionStats,
  testConnection,
} from './rag/index.js';

// Load environment variables
config();

const DATA_DIR = path.join(process.cwd(), 'data');

program
  .name('pipeline')
  .description('ILRE Agents Content Pipeline')
  .version('1.0.0');

/**
 * Parse command - Parse workbook and update sources.json
 */
program
  .command('parse')
  .description('Parse the Agent Workbook and update sources.json')
  .option('-w, --workbook <path>', 'Path to workbook markdown', './workbook/Agent-Workbook.md')
  .action(async (options) => {
    const workbookPath = path.resolve(options.workbook);

    if (!existsSync(workbookPath)) {
      console.error(`❌ Workbook not found: ${workbookPath}`);
      console.error('\nMake sure to place the Agent Workbook at:');
      console.error(`   ${workbookPath}`);
      console.error('\nOr specify a different path with --workbook');
      process.exit(1);
    }

    console.log(`📖 Parsing workbook: ${workbookPath}`);

    try {
      const result = await parseAndMergeSources(workbookPath);

      console.log(`\n✅ Successfully parsed workbook!`);
      console.log(`   Total sources: ${result.sources.length}`);

      // Count by type
      const byType: Record<string, number> = {};
      for (const source of result.sources) {
        byType[source.contentType] = (byType[source.contentType] || 0) + 1;
      }

      console.log('\n   By content type:');
      for (const [type, count] of Object.entries(byType)) {
        console.log(`     ${type}: ${count}`);
      }

      console.log(`\n📁 Sources saved to: data/sources.json`);
    } catch (error) {
      console.error('❌ Failed to parse workbook:', error);
      process.exit(1);
    }
  });

/**
 * Extract command - Run content extractors
 */
program
  .command('extract')
  .description('Extract content from sources')
  .option('-t, --type <type>', 'Content type to extract (vimeo, web, pdf)')
  .option('-a, --agent <name>', 'Filter by agent name')
  .option('-l, --limit <number>', 'Limit number of sources to process', parseInt)
  .option('--id <id>', 'Extract a specific source by ID')
  .action(async (options) => {
    const sourcesData = await loadSources();

    if (!sourcesData) {
      console.error('❌ No sources.json found. Run "pnpm pipeline parse" first.');
      process.exit(1);
    }

    // Get sources to process
    let sources: ContentSource[];

    if (options.id) {
      const source = sourcesData.sources.find(s => s.id === options.id);
      if (!source) {
        console.error(`❌ Source not found: ${options.id}`);
        process.exit(1);
      }
      sources = [source];
    } else {
      sources = await getFilteredSources({
        type: options.type as ContentType | undefined,
        agent: options.agent,
        status: 'pending',
        limit: options.limit,
      });
    }

    if (sources.length === 0) {
      console.log('✅ No pending sources to process with the given filters.');
      return;
    }

    console.log(`\n🔄 Processing ${sources.length} source(s)...\n`);

    const vimeoToken = process.env.VIMEO_ACCESS_TOKEN;
    const rateLimitMs = parseInt(process.env.RATE_LIMIT_MS || '1000');

    let processed = 0;
    let errors = 0;

    for (const source of sources) {
      console.log(`[${processed + 1}/${sources.length}] ${source.name}`);
      console.log(`   Type: ${source.contentType} | Agent: ${source.agent}`);

      try {
        await updateSourceStatus(source.id, 'processing');

        let outputPath: string;

        switch (source.contentType) {
          case 'vimeo':
            if (!vimeoToken) {
              throw new Error('VIMEO_ACCESS_TOKEN not set in .env');
            }
            const vimeoContent = await extractVimeoTranscript(source, vimeoToken);
            outputPath = await saveTranscript(vimeoContent, path.join(DATA_DIR, 'transcripts'));
            break;

          case 'web':
            const webContent = await extractWebContent(source, rateLimitMs);
            outputPath = await saveWebContent(webContent, path.join(DATA_DIR, 'case-studies'));
            break;

          case 'pdf':
            const pdfContent = await extractPdfContent(source);
            outputPath = await savePdfContent(pdfContent, path.join(DATA_DIR, 'pdfs'));
            break;

          case 'dropbox':
            console.log('   ⚠️  Dropbox extraction not yet implemented');
            await updateSourceStatus(source.id, 'pending');
            continue;

          default:
            throw new Error(`Unknown content type: ${source.contentType}`);
        }

        await updateSourceStatus(source.id, 'completed', {
          extractedAt: new Date().toISOString(),
          outputPath,
        });

        console.log(`   ✅ Saved to: ${outputPath}`);
        processed++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`   ❌ Error: ${errorMessage}`);

        await updateSourceStatus(source.id, 'error', {
          error: errorMessage,
        });

        errors++;
      }

      console.log('');
    }

    console.log('─────────────────────────────────────');
    console.log(`✅ Completed: ${processed} | ❌ Errors: ${errors}`);
  });

/**
 * Status command - Show extraction progress
 */
program
  .command('status')
  .description('Show extraction progress')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const status = await calculateStatus();

    if (!status) {
      console.error('❌ No sources.json found. Run "pnpm pipeline parse" first.');
      process.exit(1);
    }

    if (options.json) {
      console.log(JSON.stringify(status, null, 2));
    } else {
      console.log(formatStatus(status));
    }
  });

/**
 * List command - List sources
 */
program
  .command('list')
  .description('List content sources')
  .option('-t, --type <type>', 'Filter by content type')
  .option('-a, --agent <name>', 'Filter by agent name')
  .option('-s, --status <status>', 'Filter by status (pending, completed, error)')
  .option('-l, --limit <number>', 'Limit results', parseInt)
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const sources = await getFilteredSources({
      type: options.type as ContentType | undefined,
      agent: options.agent,
      status: options.status,
      limit: options.limit,
    });

    if (sources.length === 0) {
      console.log('No sources found matching criteria.');
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(sources, null, 2));
    } else {
      console.log(`\nFound ${sources.length} source(s):\n`);
      for (const source of sources) {
        const statusIcon = {
          pending: '⏳',
          processing: '🔄',
          completed: '✅',
          error: '❌',
        }[source.status];

        console.log(`${statusIcon} ${source.name}`);
        console.log(`   ID: ${source.id}`);
        console.log(`   Agent: ${source.agent} | Type: ${source.contentType}`);
        console.log(`   URL: ${source.url}`);
        if (source.error) {
          console.log(`   Error: ${source.error}`);
        }
        console.log('');
      }
    }
  });

/**
 * Reset command - Reset source status
 */
program
  .command('reset')
  .description('Reset source status to pending')
  .option('--id <id>', 'Reset a specific source by ID')
  .option('--errors', 'Reset all errored sources')
  .option('--all', 'Reset all sources')
  .action(async (options) => {
    const sourcesData = await loadSources();

    if (!sourcesData) {
      console.error('❌ No sources.json found. Run "pnpm pipeline parse" first.');
      process.exit(1);
    }

    let count = 0;

    if (options.id) {
      await updateSourceStatus(options.id, 'pending', {
        error: undefined,
        extractedAt: undefined,
        outputPath: undefined,
      });
      count = 1;
    } else if (options.errors) {
      for (const source of sourcesData.sources) {
        if (source.status === 'error') {
          await updateSourceStatus(source.id, 'pending', {
            error: undefined,
          });
          count++;
        }
      }
    } else if (options.all) {
      for (const source of sourcesData.sources) {
        await updateSourceStatus(source.id, 'pending', {
          error: undefined,
          extractedAt: undefined,
          outputPath: undefined,
        });
        count++;
      }
    } else {
      console.error('Please specify --id, --errors, or --all');
      process.exit(1);
    }

    console.log(`✅ Reset ${count} source(s) to pending`);
  });

/**
 * Chunk command - Split extracted content into chunks
 */
program
  .command('chunk')
  .description('Split extracted content into chunks for embedding')
  .option('--id <id>', 'Chunk a specific source by ID')
  .option('-f, --force', 'Force re-chunking even if already done')
  .action(async (options) => {
    // Ensure chunks directory exists
    const chunksDir = path.join(DATA_DIR, 'chunks');
    if (!existsSync(chunksDir)) {
      mkdirSync(chunksDir, { recursive: true });
    }

    console.log('\n📦 Chunking extracted content...\n');

    try {
      const result = await chunkAll({
        sourceId: options.id,
        force: options.force,
      });

      console.log('\n─────────────────────────────────────');
      console.log(`✅ Processed: ${result.processed}`);
      console.log(`⏭️  Skipped: ${result.skipped}`);
      console.log(`📊 Total chunks created: ${result.totalChunks}`);

      // Show stats
      const stats = await getChunkStats();
      console.log('\n📈 Chunk Statistics:');
      console.log(`   Total sources: ${stats.totalSources}`);
      console.log(`   Total chunks: ${stats.totalChunks}`);
      console.log(`   Avg chunks/source: ${stats.avgChunksPerSource}`);
    } catch (error) {
      console.error('❌ Chunking failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Ingest command - Generate embeddings and upload to Supabase
 */
program
  .command('ingest')
  .description('Generate embeddings and ingest chunks into Supabase')
  .option('--id <id>', 'Ingest a specific source by ID')
  .option('-l, --limit <number>', 'Limit number of sources to process', parseInt)
  .option('--dry-run', 'Show what would be ingested without actually doing it')
  .action(async (options) => {
    console.log('\n🚀 Starting ingestion pipeline...\n');

    // Test Supabase connection
    if (!options.dryRun) {
      console.log('Testing Supabase connection...');
      const connected = await testConnection();
      if (!connected) {
        console.error('❌ Could not connect to Supabase. Check SUPABASE_URL and SUPABASE_SERVICE_KEY.');
        process.exit(1);
      }
      console.log('✅ Connected to Supabase\n');
    }

    // Load chunked sources
    let sources = await loadAllChunkedSources();

    if (sources.length === 0) {
      console.error('❌ No chunked sources found. Run "pnpm pipeline chunk" first.');
      process.exit(1);
    }

    // Filter by ID if specified
    if (options.id) {
      sources = sources.filter(s => s.sourceId === options.id);
      if (sources.length === 0) {
        console.error(`❌ Chunked source not found: ${options.id}`);
        process.exit(1);
      }
    }

    // Apply limit
    if (options.limit && options.limit < sources.length) {
      sources = sources.slice(0, options.limit);
    }

    // Collect all chunks
    const allChunks = sources.flatMap(s => [
      ...s.chunks,
      ...(s.summaries || []),
    ]);

    console.log(`📊 Found ${sources.length} source(s) with ${allChunks.length} chunks\n`);

    if (options.dryRun) {
      console.log('🔍 Dry run - would ingest:');
      for (const source of sources) {
        const chunkCount = source.chunks.length + (source.summaries?.length || 0);
        console.log(`   ${source.sourceId}: ${chunkCount} chunks`);
      }
      return;
    }

    // Generate embeddings
    console.log('🧮 Generating embeddings...');
    const chunksWithEmbeddings = await embedChunks(allChunks, {
      onProgress: (completed, total) => {
        process.stdout.write(`\r   Progress: ${completed}/${total} chunks`);
      },
    });
    console.log('\n✅ Embeddings generated\n');

    // Upsert to Supabase
    console.log('📤 Uploading to Supabase...');
    const { inserted, errors } = await upsertChunks(chunksWithEmbeddings, {
      onProgress: (completed, total) => {
        process.stdout.write(`\r   Progress: ${completed}/${total} chunks`);
      },
    });

    console.log('\n\n─────────────────────────────────────');
    console.log(`✅ Inserted: ${inserted} chunks`);

    if (errors.length > 0) {
      console.log(`❌ Errors: ${errors.length}`);
      for (const err of errors.slice(0, 5)) {
        console.log(`   ${err}`);
      }
      if (errors.length > 5) {
        console.log(`   ... and ${errors.length - 5} more`);
      }
    }

    // Show stats
    const stats = await getIngestionStats();
    console.log('\n📈 Database Statistics:');
    console.log(`   Total chunks in DB: ${stats.totalChunks}`);
    console.log(`   Raw chunks: ${stats.rawChunks}`);
    console.log(`   Summary chunks: ${stats.summaryChunks}`);
  });

/**
 * Search command - Test semantic search
 */
program
  .command('search <query>')
  .description('Search the knowledge base using semantic search')
  .option('-n, --limit <number>', 'Number of results', parseInt, 5)
  .option('-a, --agent <name>', 'Filter by agent name')
  .option('-t, --type <type>', 'Filter by content type (vimeo, web, pdf)')
  .option('-l, --layer <layer>', 'Filter by content layer (raw, summary)')
  .option('--min-score <score>', 'Minimum similarity score', parseFloat, 0.3)
  .option('--json', 'Output as JSON')
  .action(async (query, options) => {
    console.log(`\n🔍 Searching for: "${query}"\n`);

    try {
      const results = await searchChunks({
        query,
        limit: options.limit,
        agent: options.agent,
        contentType: options.type,
        contentLayer: options.layer,
        minScore: options.minScore,
      });

      if (results.length === 0) {
        console.log('No results found.');
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      console.log(`Found ${results.length} result(s):\n`);

      for (const result of results) {
        const { chunk, score, rank } = result;
        console.log(`─────────────────────────────────────`);
        console.log(`#${rank} | Score: ${(score * 100).toFixed(1)}%`);
        console.log(`Title: ${chunk.metadata.title}`);
        console.log(`Agent: ${chunk.metadata.agent} | Type: ${chunk.metadata.contentType}`);
        console.log(`Chunk: ${chunk.chunkIndex + 1}/${chunk.totalChunks} | Words: ${chunk.wordCount}`);
        if (chunk.metadata.topics?.length) {
          console.log(`Topics: ${chunk.metadata.topics.join(', ')}`);
        }
        console.log(`\n${chunk.text.substring(0, 300)}${chunk.text.length > 300 ? '...' : ''}\n`);
      }
    } catch (error) {
      console.error('❌ Search failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * DB Stats command - Show database statistics
 */
program
  .command('db-stats')
  .description('Show database statistics')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    console.log('\n📊 Database Statistics\n');

    try {
      const connected = await testConnection();
      if (!connected) {
        console.error('❌ Could not connect to Supabase.');
        process.exit(1);
      }

      const stats = await getIngestionStats();

      if (options.json) {
        console.log(JSON.stringify(stats, null, 2));
        return;
      }

      console.log(`Total chunks: ${stats.totalChunks}`);
      console.log(`  Raw: ${stats.rawChunks}`);
      console.log(`  Summary: ${stats.summaryChunks}`);

      console.log('\nBy Agent:');
      for (const [agent, count] of Object.entries(stats.byAgent).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${agent}: ${count}`);
      }

      console.log('\nBy Content Type:');
      for (const [type, count] of Object.entries(stats.byContentType).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${type}: ${count}`);
      }
    } catch (error) {
      console.error('❌ Failed to get stats:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Chat command - Interactive chat with an agent
 */
program
  .command('chat')
  .description('Chat with an ILRE agent')
  .requiredOption('-a, --agent <name>', 'Agent name (e.g. "Navigator Nate")')
  .option('-m, --model <model>', 'Chat model to use')
  .option('-q, --query <query>', 'Single question (non-interactive mode)')
  .option('-n, --context <number>', 'Number of context chunks to retrieve', parseInt)
  .option('--min-score <score>', 'Minimum similarity score', parseFloat)
  .option('-f, --format <format>', 'Response format: concise, standard, detailed, email, or custom instructions')
  .action(async (options) => {
    const chatOptions = {
      agent: options.agent,
      model: options.model,
      contextLimit: options.context,
      minScore: options.minScore,
      responseFormat: options.format,
    };

    if (options.query) {
      // Single question mode
      console.log(`\n🔍 Asking ${options.agent}: "${options.query}"\n`);

      try {
        const { reply, sources } = await chat(options.query, [], chatOptions);
        console.log(`${options.agent}: ${reply}`);

        if (sources.length > 0) {
          console.log(`\n   📚 Sources:`);
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
      } catch (error) {
        console.error('❌ Chat failed:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    } else {
      // Interactive mode
      await startInteractiveChat(chatOptions);
    }
  });

program.parse();
