import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import type { ContentSource, ExtractedContent } from '../types.js';

const VIMEO_API_BASE = 'https://api.vimeo.com';

interface VimeoVideo {
  name: string;
  description: string | null;
  duration: number;
  created_time: string;
  link: string;
}

interface VimeoTextTrack {
  uri: string;
  name: string;
  language: string;
  type: string;
  link?: string;
}

interface VimeoTextTracksResponse {
  data: VimeoTextTrack[];
}

/**
 * Make authenticated request to Vimeo API
 */
async function vimeoRequest<T>(
  endpoint: string,
  accessToken: string
): Promise<T> {
  const response = await fetch(`${VIMEO_API_BASE}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Vimeo API error (${response.status}): ${error}`);
  }

  return response.json();
}

/**
 * Fetch video metadata from Vimeo
 */
async function getVideoMetadata(
  videoId: string,
  accessToken: string
): Promise<VimeoVideo> {
  return vimeoRequest<VimeoVideo>(`/videos/${videoId}`, accessToken);
}

/**
 * Fetch text tracks (captions/transcripts) for a video
 */
async function getTextTracks(
  videoId: string,
  accessToken: string
): Promise<VimeoTextTrack[]> {
  const response = await vimeoRequest<VimeoTextTracksResponse>(
    `/videos/${videoId}/texttracks`,
    accessToken
  );
  return response.data || [];
}

/**
 * Download and parse VTT caption file
 */
async function downloadCaption(trackUri: string, accessToken: string): Promise<string> {
  // Get the track details which includes the download link
  const track = await vimeoRequest<VimeoTextTrack>(trackUri, accessToken);

  if (!track.link) {
    throw new Error('No download link available for caption track');
  }

  // Download the VTT file
  const response = await fetch(track.link);
  if (!response.ok) {
    throw new Error(`Failed to download caption: ${response.status}`);
  }

  return response.text();
}

/**
 * Parse VTT format into plain text transcript
 */
function parseVTT(vttContent: string): string {
  const lines = vttContent.split('\n');
  const textLines: string[] = [];
  let inCue = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip WEBVTT header and metadata
    if (trimmed.startsWith('WEBVTT') || trimmed.startsWith('NOTE')) {
      continue;
    }

    // Skip timestamp lines
    if (trimmed.includes('-->')) {
      inCue = true;
      continue;
    }

    // Skip cue identifiers (numeric lines before timestamps)
    if (/^\d+$/.test(trimmed)) {
      continue;
    }

    // Collect actual caption text
    if (inCue && trimmed) {
      // Remove VTT tags like <c> </c>
      const cleanText = trimmed.replace(/<[^>]+>/g, '');
      textLines.push(cleanText);
    }

    // Empty line ends a cue
    if (!trimmed) {
      inCue = false;
    }
  }

  // Join and clean up the text
  return textLines
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Format duration in seconds to human readable
 */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

/**
 * Extract transcript from a Vimeo video
 */
export async function extractVimeoTranscript(
  source: ContentSource,
  accessToken: string
): Promise<ExtractedContent> {
  if (!source.vimeoId) {
    throw new Error(`No Vimeo ID found for source: ${source.name}`);
  }

  // Fetch video metadata
  const video = await getVideoMetadata(source.vimeoId, accessToken);

  // Fetch available text tracks
  const tracks = await getTextTracks(source.vimeoId, accessToken);

  let transcript = '';

  if (tracks.length > 0) {
    // Prefer English captions, fall back to first available
    const englishTrack = tracks.find(
      t => t.language === 'en' || t.language === 'en-US'
    );
    const track = englishTrack || tracks[0];

    const vttContent = await downloadCaption(track.uri, accessToken);
    transcript = parseVTT(vttContent);
  } else {
    transcript = '[No captions available for this video]';
  }

  return {
    source,
    title: video.name,
    content: transcript,
    metadata: {
      vimeoId: source.vimeoId,
      duration: video.duration,
      durationFormatted: formatDuration(video.duration),
      description: video.description,
      createdAt: video.created_time,
      vimeoUrl: video.link,
      hasCaptions: tracks.length > 0,
      captionLanguages: tracks.map(t => t.language),
    },
    extractedAt: new Date().toISOString(),
  };
}

/**
 * Save extracted content as markdown file
 */
export async function saveTranscript(
  content: ExtractedContent,
  outputDir: string
): Promise<string> {
  await mkdir(outputDir, { recursive: true });

  const filename = `${content.source.id}.md`;
  const filepath = path.join(outputDir, filename);

  const metadata = content.metadata as {
    duration: number;
    durationFormatted: string;
    description: string | null;
    vimeoUrl: string;
    hasCaptions: boolean;
  };

  const markdown = `---
title: "${content.title.replace(/"/g, '\\"')}"
source: "${content.source.name}"
agent: "${content.source.agent}"
sourceType: "${content.source.sourceType}"
contentType: vimeo
vimeoId: "${content.source.vimeoId}"
vimeoUrl: "${metadata.vimeoUrl}"
duration: ${metadata.duration}
durationFormatted: "${metadata.durationFormatted}"
hasCaptions: ${metadata.hasCaptions}
extractedAt: "${content.extractedAt}"
---

# ${content.title}

**Agent:** ${content.source.agent}
**Source Type:** ${content.source.sourceType}
**Duration:** ${metadata.durationFormatted}
**Vimeo URL:** ${metadata.vimeoUrl}

${metadata.description ? `## Description\n\n${metadata.description}\n\n` : ''}## Transcript

${content.content}
`;

  await writeFile(filepath, markdown, 'utf-8');
  return filepath;
}
