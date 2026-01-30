import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';
import type { ContentSource, ExtractedContent } from '../types.js';

/**
 * Fetch HTML content from URL
 */
async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ILREAgents/1.0; Content Pipeline)',
      Accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
  }

  return response.text();
}

/**
 * Clean up extracted text
 */
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
}

/**
 * Extract main content from HTML
 */
function extractContent(html: string, url: string): { title: string; content: string; metadata: Record<string, unknown> } {
  const $ = cheerio.load(html);

  // Remove unwanted elements
  $('script, style, nav, header, footer, aside, .sidebar, .navigation, .comments, .advertisement, .ad').remove();

  // Try to find the title
  const title = $('h1').first().text().trim() ||
    $('meta[property="og:title"]').attr('content') ||
    $('title').text().trim() ||
    'Untitled';

  // Try to find main content area
  const mainSelectors = [
    'article',
    'main',
    '.content',
    '.post-content',
    '.article-content',
    '.entry-content',
    '#content',
    '.main-content',
  ];

  let contentSelector = 'body';

  for (const selector of mainSelectors) {
    if ($(selector).length > 0) {
      contentSelector = selector;
      break;
    }
  }

  // Extract structured content
  const sections: string[] = [];

  $(contentSelector).find('h1, h2, h3, h4, h5, h6, p, ul, ol, blockquote').each((_, el) => {
    const $el = $(el);
    const tagName = el.tagName.toLowerCase();
    const text = cleanText($el.text());

    if (!text) return;

    switch (tagName) {
      case 'h1':
        sections.push(`# ${text}`);
        break;
      case 'h2':
        sections.push(`## ${text}`);
        break;
      case 'h3':
        sections.push(`### ${text}`);
        break;
      case 'h4':
      case 'h5':
      case 'h6':
        sections.push(`#### ${text}`);
        break;
      case 'ul':
      case 'ol':
        $el.find('li').each((_, li) => {
          const liText = cleanText($(li).text());
          if (liText) {
            sections.push(`- ${liText}`);
          }
        });
        break;
      case 'blockquote':
        sections.push(`> ${text}`);
        break;
      default:
        sections.push(text);
    }
  });

  // Extract metadata
  const metadata: Record<string, unknown> = {
    url,
    ogDescription: $('meta[property="og:description"]').attr('content') || null,
    ogImage: $('meta[property="og:image"]').attr('content') || null,
    author: $('meta[name="author"]').attr('content') ||
            $('.author').first().text().trim() || null,
    publishedDate: $('meta[property="article:published_time"]').attr('content') ||
                   $('time').attr('datetime') || null,
  };

  return {
    title,
    content: sections.join('\n\n'),
    metadata,
  };
}

/**
 * Extract content from a web page
 */
export async function extractWebContent(
  source: ContentSource,
  rateLimitMs = 1000
): Promise<ExtractedContent> {
  // Rate limiting delay
  await new Promise(resolve => setTimeout(resolve, rateLimitMs));

  const html = await fetchHtml(source.url);
  const { title, content, metadata } = extractContent(html, source.url);

  return {
    source,
    title,
    content,
    metadata,
    extractedAt: new Date().toISOString(),
  };
}

/**
 * Save extracted web content as markdown file
 */
export async function saveWebContent(
  content: ExtractedContent,
  outputDir: string
): Promise<string> {
  await mkdir(outputDir, { recursive: true });

  const filename = `${content.source.id}.md`;
  const filepath = path.join(outputDir, filename);

  const metadata = content.metadata as {
    url: string;
    author?: string | null;
    publishedDate?: string | null;
    ogDescription?: string | null;
  };

  const markdown = `---
title: "${content.title.replace(/"/g, '\\"')}"
source: "${content.source.name}"
agent: "${content.source.agent}"
sourceType: "${content.source.sourceType}"
contentType: web
url: "${content.source.url}"
${metadata.author ? `author: "${metadata.author}"` : ''}
${metadata.publishedDate ? `publishedDate: "${metadata.publishedDate}"` : ''}
extractedAt: "${content.extractedAt}"
---

# ${content.title}

**Agent:** ${content.source.agent}
**Source Type:** ${content.source.sourceType}
**URL:** ${content.source.url}
${metadata.author ? `**Author:** ${metadata.author}  ` : ''}
${metadata.publishedDate ? `**Published:** ${metadata.publishedDate}  ` : ''}

${metadata.ogDescription ? `> ${metadata.ogDescription}\n\n` : ''}## Content

${content.content}
`;

  await writeFile(filepath, markdown, 'utf-8');
  return filepath;
}
