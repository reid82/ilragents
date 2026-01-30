import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import pdf from 'pdf-parse';
import type { ContentSource, ExtractedContent } from '../types.js';

/**
 * Download PDF from URL to buffer
 */
async function downloadPdf(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ILREAgents/1.0; Content Pipeline)',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Clean up extracted PDF text
 */
function cleanPdfText(text: string): string {
  return text
    // Normalize whitespace
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Remove excessive blank lines
    .replace(/\n{3,}/g, '\n\n')
    // Fix common PDF extraction artifacts
    .replace(/([a-z])-\n([a-z])/gi, '$1$2') // Rejoin hyphenated words
    // Trim lines
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .trim();
}

/**
 * Extract text from a PDF file
 */
export async function extractPdfContent(
  source: ContentSource
): Promise<ExtractedContent> {
  let pdfBuffer: Buffer;

  // Check if URL is local file path or remote URL
  if (source.url.startsWith('http://') || source.url.startsWith('https://')) {
    pdfBuffer = await downloadPdf(source.url);
  } else {
    // Local file
    pdfBuffer = await readFile(source.url);
  }

  const pdfData = await pdf(pdfBuffer);

  const content = cleanPdfText(pdfData.text);

  return {
    source,
    title: pdfData.info?.Title || source.name,
    content,
    metadata: {
      url: source.url,
      pageCount: pdfData.numpages,
      author: pdfData.info?.Author || null,
      subject: pdfData.info?.Subject || null,
      creator: pdfData.info?.Creator || null,
      producer: pdfData.info?.Producer || null,
      creationDate: pdfData.info?.CreationDate || null,
      modDate: pdfData.info?.ModDate || null,
    },
    extractedAt: new Date().toISOString(),
  };
}

/**
 * Save extracted PDF content as markdown file
 */
export async function savePdfContent(
  content: ExtractedContent,
  outputDir: string
): Promise<string> {
  await mkdir(outputDir, { recursive: true });

  const filename = `${content.source.id}.md`;
  const filepath = path.join(outputDir, filename);

  const metadata = content.metadata as {
    url: string;
    pageCount: number;
    author?: string | null;
    subject?: string | null;
  };

  const markdown = `---
title: "${content.title.replace(/"/g, '\\"')}"
source: "${content.source.name}"
agent: "${content.source.agent}"
sourceType: "${content.source.sourceType}"
contentType: pdf
url: "${content.source.url}"
pageCount: ${metadata.pageCount}
${metadata.author ? `author: "${metadata.author}"` : ''}
${metadata.subject ? `subject: "${metadata.subject}"` : ''}
extractedAt: "${content.extractedAt}"
---

# ${content.title}

**Agent:** ${content.source.agent}
**Source Type:** ${content.source.sourceType}
**Source URL:** ${content.source.url}
**Pages:** ${metadata.pageCount}
${metadata.author ? `**Author:** ${metadata.author}  ` : ''}

## Content

${content.content}
`;

  await writeFile(filepath, markdown, 'utf-8');
  return filepath;
}
