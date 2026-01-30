export type ContentType = 'vimeo' | 'web' | 'pdf' | 'dropbox';
export type SourceStatus = 'pending' | 'processing' | 'completed' | 'error';

export interface ContentSource {
  id: string;
  agent: string;
  sourceType: string;
  name: string;
  url: string;
  contentType: ContentType;
  vimeoId?: string;
  status: SourceStatus;
  error?: string;
  extractedAt?: string;
  outputPath?: string;
}

export interface SourcesData {
  lastParsed: string;
  workbookPath: string;
  sources: ContentSource[];
}

export interface StatusData {
  lastUpdated: string;
  summary: {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    error: number;
  };
  byAgent: Record<string, {
    total: number;
    completed: number;
  }>;
  byContentType: Record<ContentType, {
    total: number;
    completed: number;
  }>;
}

export interface ExtractedContent {
  source: ContentSource;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  extractedAt: string;
}
