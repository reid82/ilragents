import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { ContentSource, ContentType, SourcesData, StatusData } from './types.js';

const STATUS_PATH = path.join(process.cwd(), 'data', 'status.json');

/**
 * Load sources data
 */
async function loadSources(): Promise<SourcesData | null> {
  const sourcesPath = path.join(process.cwd(), 'data', 'sources.json');
  if (!existsSync(sourcesPath)) return null;
  const content = await readFile(sourcesPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Calculate status summary from sources
 */
export async function calculateStatus(): Promise<StatusData | null> {
  const sourcesData = await loadSources();
  if (!sourcesData) return null;

  const sources = sourcesData.sources;

  // Summary counts
  const summary = {
    total: sources.length,
    pending: sources.filter(s => s.status === 'pending').length,
    processing: sources.filter(s => s.status === 'processing').length,
    completed: sources.filter(s => s.status === 'completed').length,
    error: sources.filter(s => s.status === 'error').length,
  };

  // By agent
  const byAgent: Record<string, { total: number; completed: number }> = {};
  for (const source of sources) {
    if (!byAgent[source.agent]) {
      byAgent[source.agent] = { total: 0, completed: 0 };
    }
    byAgent[source.agent].total++;
    if (source.status === 'completed') {
      byAgent[source.agent].completed++;
    }
  }

  // By content type
  const byContentType: Record<ContentType, { total: number; completed: number }> = {
    vimeo: { total: 0, completed: 0 },
    web: { total: 0, completed: 0 },
    pdf: { total: 0, completed: 0 },
    dropbox: { total: 0, completed: 0 },
  };
  for (const source of sources) {
    byContentType[source.contentType].total++;
    if (source.status === 'completed') {
      byContentType[source.contentType].completed++;
    }
  }

  const status: StatusData = {
    lastUpdated: new Date().toISOString(),
    summary,
    byAgent,
    byContentType,
  };

  await writeFile(STATUS_PATH, JSON.stringify(status, null, 2));
  return status;
}

/**
 * Update a source's status
 */
export async function updateSourceStatus(
  sourceId: string,
  status: ContentSource['status'],
  updates: Partial<ContentSource> = {}
): Promise<void> {
  const sourcesPath = path.join(process.cwd(), 'data', 'sources.json');
  const sourcesData = await loadSources();

  if (!sourcesData) {
    throw new Error('No sources.json found. Run "pnpm pipeline parse" first.');
  }

  const source = sourcesData.sources.find(s => s.id === sourceId);
  if (!source) {
    throw new Error(`Source not found: ${sourceId}`);
  }

  Object.assign(source, { status, ...updates });
  await writeFile(sourcesPath, JSON.stringify(sourcesData, null, 2));
}

/**
 * Format status for CLI display
 */
export function formatStatus(status: StatusData): string {
  const lines: string[] = [];

  lines.push('═══════════════════════════════════════════');
  lines.push('        ILRE Content Pipeline Status        ');
  lines.push('═══════════════════════════════════════════');
  lines.push('');

  // Summary
  const { summary } = status;
  const progress = summary.total > 0
    ? Math.round((summary.completed / summary.total) * 100)
    : 0;

  lines.push(`📊 Overall Progress: ${summary.completed}/${summary.total} (${progress}%)`);
  lines.push('');
  lines.push(`   ⏳ Pending:    ${summary.pending}`);
  lines.push(`   🔄 Processing: ${summary.processing}`);
  lines.push(`   ✅ Completed:  ${summary.completed}`);
  lines.push(`   ❌ Error:      ${summary.error}`);
  lines.push('');

  // By content type
  lines.push('───────────────────────────────────────────');
  lines.push('By Content Type:');
  for (const [type, data] of Object.entries(status.byContentType)) {
    if (data.total > 0) {
      const pct = Math.round((data.completed / data.total) * 100);
      lines.push(`   ${type.padEnd(8)} ${data.completed}/${data.total} (${pct}%)`);
    }
  }
  lines.push('');

  // By agent
  lines.push('───────────────────────────────────────────');
  lines.push('By Agent:');
  for (const [agent, data] of Object.entries(status.byAgent)) {
    const pct = Math.round((data.completed / data.total) * 100);
    lines.push(`   ${agent.slice(0, 20).padEnd(20)} ${data.completed}/${data.total} (${pct}%)`);
  }
  lines.push('');

  lines.push('───────────────────────────────────────────');
  lines.push(`Last updated: ${new Date(status.lastUpdated).toLocaleString()}`);

  return lines.join('\n');
}

/**
 * Get sources filtered by criteria
 */
export async function getFilteredSources(options: {
  type?: ContentType;
  agent?: string;
  status?: ContentSource['status'];
  limit?: number;
}): Promise<ContentSource[]> {
  const sourcesData = await loadSources();
  if (!sourcesData) return [];

  let sources = sourcesData.sources;

  if (options.type) {
    sources = sources.filter(s => s.contentType === options.type);
  }

  if (options.agent) {
    sources = sources.filter(s =>
      s.agent.toLowerCase().includes(options.agent!.toLowerCase())
    );
  }

  if (options.status) {
    sources = sources.filter(s => s.status === options.status);
  }

  if (options.limit) {
    sources = sources.slice(0, options.limit);
  }

  return sources;
}
