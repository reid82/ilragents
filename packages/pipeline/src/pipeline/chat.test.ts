import { describe, it, expect } from 'vitest';
import { resolveResponseFormat, buildSystemPrompt, AGENT_ALIASES } from './chat';
import type { SearchResult } from './rag/types';

describe('resolveResponseFormat', () => {
  it('returns standard format when no input', () => {
    const format = resolveResponseFormat();
    expect(format.maxTokens).toBe(1500);
    expect(format.instructions).toContain('RESPONSE FORMAT');
  });

  it('returns concise format', () => {
    const format = resolveResponseFormat('concise');
    expect(format.maxTokens).toBe(400);
    expect(format.instructions).toContain('2-4 sentences');
  });

  it('returns detailed format', () => {
    const format = resolveResponseFormat('detailed');
    expect(format.maxTokens).toBe(3000);
    expect(format.instructions).toContain('thorough');
  });

  it('returns email format', () => {
    const format = resolveResponseFormat('email');
    expect(format.maxTokens).toBe(1200);
    expect(format.instructions).toContain('email');
  });

  it('returns custom format for arbitrary string', () => {
    const format = resolveResponseFormat('Be brief and use bullet points.');
    expect(format.instructions).toContain('Be brief and use bullet points.');
    expect(format.maxTokens).toBe(2000);
  });
});

describe('buildSystemPrompt', () => {
  const mockContext: SearchResult[] = [
    {
      chunk: {
        id: 'test-1',
        sourceId: 'test-source',
        text: 'This is test content about property investment.',
        chunkIndex: 0,
        totalChunks: 1,
        wordCount: 7,
        contentLayer: 'raw' as const,
        metadata: {
          agent: 'Navigator Nate',
          contentType: 'vimeo' as const,
          title: 'Test Video',
        },
      },
      score: 0.85,
      rank: 1,
    },
  ];

  it('includes agent name', () => {
    const format = resolveResponseFormat();
    const prompt = buildSystemPrompt('Baseline Ben', mockContext, format);
    expect(prompt).toContain('You are Baseline Ben');
  });

  it('frames agent as specialist practitioner', () => {
    const format = resolveResponseFormat();
    const prompt = buildSystemPrompt('Baseline Ben', mockContext, format);
    expect(prompt).toContain('specialist practitioner');
    expect(prompt).not.toContain('education instructor');
  });

  it('includes reference knowledge', () => {
    const format = resolveResponseFormat();
    const prompt = buildSystemPrompt('Baseline Ben', mockContext, format);
    expect(prompt).toContain('Test Video');
    expect(prompt).toContain('property investment');
    expect(prompt).toContain('REFERENCE KNOWLEDGE');
  });

  it('includes sources section instruction for dev', () => {
    const format = resolveResponseFormat();
    const prompt = buildSystemPrompt('Baseline Ben', mockContext, format);
    expect(prompt).toContain('Sources:');
  });

  it('includes format instructions', () => {
    const format = resolveResponseFormat('concise');
    const prompt = buildSystemPrompt('Baseline Ben', mockContext, format);
    expect(prompt).toContain('2-4 sentences');
  });

  it('handles empty context', () => {
    const format = resolveResponseFormat();
    const prompt = buildSystemPrompt('Baseline Ben', [], format);
    expect(prompt).toContain('reference knowledge');
  });
});

describe('AGENT_ALIASES', () => {
  it('maps Baseline Ben to three agents', () => {
    expect(AGENT_ALIASES['Baseline Ben']).toHaveLength(3);
    expect(AGENT_ALIASES['Baseline Ben']).toContain('Navigator Nate');
    expect(AGENT_ALIASES['Baseline Ben']).toContain('Foundation Frank');
    expect(AGENT_ALIASES['Baseline Ben']).toContain('Roadmap Ray');
  });

  it('maps Investor Coach to five agents', () => {
    expect(AGENT_ALIASES['Investor Coach']).toHaveLength(5);
    expect(AGENT_ALIASES['Investor Coach']).toContain('Splitter Steve');
    expect(AGENT_ALIASES['Investor Coach']).toContain('Equity Eddie');
    expect(AGENT_ALIASES['Investor Coach']).toContain('Yield Yates');
    expect(AGENT_ALIASES['Investor Coach']).toContain('Tenant Tony');
    expect(AGENT_ALIASES['Investor Coach']).toContain('Strata Sam');
  });

  it('maps Deal Specialist to three agents', () => {
    expect(AGENT_ALIASES['Deal Specialist']).toHaveLength(3);
    expect(AGENT_ALIASES['Deal Specialist']).toContain('Teflon Terry');
    expect(AGENT_ALIASES['Deal Specialist']).toContain('Depreciation Dave');
    expect(AGENT_ALIASES['Deal Specialist']).toContain('Venture Vince');
  });

  it('does not have aliases for Finder Fred', () => {
    expect(AGENT_ALIASES['Finder Fred']).toBeUndefined();
  });
});
