import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { ContentSource, ContentType, SourcesData } from './types.js';

const SOURCES_PATH = path.join(process.cwd(), 'data', 'sources.json');

/**
 * Detect content type from URL
 */
function detectContentType(url: string): ContentType {
  if (url.includes('vimeo.com')) return 'vimeo';
  if (url.includes('dropbox.com')) return 'dropbox';
  if (url.endsWith('.pdf') || url.includes('.pdf') || url.includes('/pdf/')) return 'pdf';
  if (url.includes('sharepoint.com')) return 'pdf'; // SharePoint links are often PDFs
  return 'web';
}

/**
 * Extract Vimeo ID from URL
 */
function extractVimeoId(url: string): string | undefined {
  // Handle various Vimeo URL formats:
  // https://vimeo.com/123456789
  // https://vimeo.com/123456789/abcdef
  // https://vimeo.com/123456789?fl=ls&fe=ec
  // https://player.vimeo.com/video/123456789
  // https://vimeo.com/manage/videos/123456789
  const patterns = [
    /vimeo\.com\/(?:manage\/videos\/)?(\d+)/,
    /player\.vimeo\.com\/video\/(\d+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return undefined;
}

/**
 * Generate a unique ID for a source
 */
function generateId(agent: string, name: string, url: string): string {
  const vimeoId = extractVimeoId(url);

  // Create a URL-based hash for uniqueness when IDs might collide
  const urlHash = url
    .replace(/[^a-z0-9]/gi, '')
    .slice(-8);

  // For Vimeo, put the ID first to ensure uniqueness
  // Format: agent-vimeoid-shortname or agent-hash-shortname
  const uniquePart = vimeoId || urlHash;
  const shortName = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

  const agentSlug = agent
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 20);

  return `${agentSlug}-${uniquePart}-${shortName}`.slice(0, 80);
}

/**
 * Extract all URLs from a text block
 */
function extractAllUrls(text: string): string[] {
  const urls: string[] = [];

  // Match markdown links [text](url)
  const markdownMatches = text.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g);
  for (const match of markdownMatches) {
    urls.push(match[2]);
  }

  // Match bare URLs (that aren't already in markdown links)
  const bareUrlPattern = /(?<!\()https?:\/\/[^\s\)>\]]+/g;
  const bareMatches = text.matchAll(bareUrlPattern);
  for (const match of bareMatches) {
    // Only add if not already captured via markdown
    if (!urls.includes(match[0])) {
      urls.push(match[0]);
    }
  }

  return urls;
}

/**
 * Clean up source name
 */
function cleanName(name: string): string {
  return name
    .replace(/\*\*/g, '') // Remove bold markers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Replace markdown links with just text
    .replace(/https?:\/\/[^\s]+/g, '') // Remove bare URLs
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse a table with potentially multi-line cells
 * Returns array of rows, each row is an array of cell contents
 */
function parseTableWithMultilineCells(tableSection: string): { headers: string[]; rows: string[][] } {
  const lines = tableSection.split('\n');
  const headers: string[] = [];
  const rows: string[][] = [];

  let inTable = false;
  let currentRow: string[] = [];
  let headerParsed = false;
  let separatorSkipped = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Table row starts with |
    if (trimmed.startsWith('|')) {
      inTable = true;

      // Parse cells from this line
      const cells = trimmed.split('|').slice(1, -1).map(c => c.trim());

      if (!headerParsed) {
        // First row is header
        headers.push(...cells);
        headerParsed = true;
      } else if (!separatorSkipped) {
        // Second row is separator (---)
        separatorSkipped = true;
      } else {
        // Data row - if we have content from previous incomplete row, this is a new row
        if (currentRow.length > 0) {
          rows.push(currentRow);
        }
        currentRow = cells;
      }
    } else if (inTable && trimmed && currentRow.length > 0) {
      // Non-table line but we have a current row - this is continuation content
      // Append to the last cell or to relevant cells based on content
      // For simplicity, append to the last non-empty cell or create implicit content
      const urls = extractAllUrls(trimmed);
      if (urls.length > 0 || trimmed.length > 0) {
        // This line has content that should be part of the previous row
        // Typically URLs or descriptions on new lines
        // Append to location column (index 2) or last cell
        const locationIdx = 2; // Assuming Location is column index 2
        if (currentRow[locationIdx] !== undefined) {
          currentRow[locationIdx] += '\n' + trimmed;
        } else if (currentRow.length > 0) {
          currentRow[currentRow.length - 1] += '\n' + trimmed;
        }
      }
    }
  }

  // Don't forget the last row
  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  return { headers, rows };
}

/**
 * Parse the workbook markdown and extract all content sources
 */
export async function parseWorkbook(workbookPath: string): Promise<ContentSource[]> {
  const content = await readFile(workbookPath, 'utf-8');
  const sources: ContentSource[] = [];
  const seenUrls = new Set<string>();

  // Find agent sections: ### N. Agent Name
  const agentPattern = /^### (\d+)\. ([^\n]+)/gm;
  const agentMatches = [...content.matchAll(agentPattern)];

  for (let i = 0; i < agentMatches.length; i++) {
    const agentMatch = agentMatches[i];
    const agentName = agentMatch[2].trim();
    const sectionStart = agentMatch.index!;
    const sectionEnd = agentMatches[i + 1]?.index ?? content.length;
    const agentSection = content.slice(sectionStart, sectionEnd);

    // Find Data Sources table in this section
    const dataSourcesMatch = agentSection.match(/### Data Sources\s*\n([\s\S]*?)(?=\n###|\n---|\*\*Questions|$)/);
    if (!dataSourcesMatch) continue;

    const dataSourcesSection = dataSourcesMatch[1];

    // Parse the table with multi-line support
    const { headers, rows } = parseTableWithMultilineCells(dataSourcesSection);

    if (headers.length === 0 || rows.length === 0) continue;

    // Find column indices
    const sourceTypeIdx = headers.findIndex(h => h.toLowerCase().includes('source type'));
    const nameIdx = headers.findIndex(h =>
      h.toLowerCase().includes('name') ||
      h.toLowerCase().includes('description') ||
      h.toLowerCase().includes('title')
    );
    const locationIdx = headers.findIndex(h => h.toLowerCase().includes('location'));

    // Process data rows
    for (const cells of rows) {
      if (cells.length === 0) continue;

      const sourceType = sourceTypeIdx >= 0 && cells[sourceTypeIdx]
        ? cleanName(cells[sourceTypeIdx])
        : 'Unknown';

      const rawName = nameIdx >= 0 && cells[nameIdx]
        ? cells[nameIdx]
        : '';

      const locationCell = locationIdx >= 0 && cells[locationIdx]
        ? cells[locationIdx]
        : '';

      // Extract URLs from location column (primary) and name column (fallback)
      let urls = extractAllUrls(locationCell);
      if (urls.length === 0) {
        urls = extractAllUrls(rawName);
      }

      // Also check all cells for URLs
      if (urls.length === 0) {
        for (const cell of cells) {
          urls.push(...extractAllUrls(cell));
        }
      }

      if (urls.length === 0) continue;

      // Clean up the name
      const cleanedName = cleanName(rawName) || sourceType;

      // Create a source for each URL
      for (const url of urls) {
        // Skip duplicates
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);

        const contentType = detectContentType(url);

        // Generate a descriptive name for the source
        let sourceName = cleanedName;
        if (urls.length > 1 && contentType === 'vimeo') {
          const vimeoId = extractVimeoId(url);
          if (vimeoId) {
            sourceName = `${cleanedName} (${vimeoId})`;
          }
        }

        const source: ContentSource = {
          id: generateId(agentName, sourceName, url),
          agent: agentName,
          sourceType: sourceType.replace(/\*\*/g, ''),
          name: sourceName,
          url,
          contentType,
          status: 'pending',
        };

        if (contentType === 'vimeo') {
          source.vimeoId = extractVimeoId(url);
        }

        sources.push(source);
      }
    }
  }

  return sources;
}

/**
 * Load existing sources data
 */
export async function loadSources(): Promise<SourcesData | null> {
  if (!existsSync(SOURCES_PATH)) return null;
  const content = await readFile(SOURCES_PATH, 'utf-8');
  return JSON.parse(content);
}

/**
 * Save sources data
 */
export async function saveSources(data: SourcesData): Promise<void> {
  await writeFile(SOURCES_PATH, JSON.stringify(data, null, 2));
}

/**
 * Parse workbook and merge with existing sources (preserving status)
 */
export async function parseAndMergeSources(workbookPath: string): Promise<SourcesData> {
  const newSources = await parseWorkbook(workbookPath);
  const existing = await loadSources();

  // Create a map of existing sources by ID for quick lookup
  const existingMap = new Map<string, ContentSource>();
  if (existing) {
    for (const source of existing.sources) {
      existingMap.set(source.id, source);
    }
  }

  // Merge: keep existing status/metadata, add new sources
  const merged = newSources.map(source => {
    const existingSource = existingMap.get(source.id);
    if (existingSource) {
      // Preserve status and extraction info from existing
      return {
        ...source,
        status: existingSource.status,
        error: existingSource.error,
        extractedAt: existingSource.extractedAt,
        outputPath: existingSource.outputPath,
      };
    }
    return source;
  });

  const data: SourcesData = {
    lastParsed: new Date().toISOString(),
    workbookPath,
    sources: merged,
  };

  await saveSources(data);
  return data;
}
