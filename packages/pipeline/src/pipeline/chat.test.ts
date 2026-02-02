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

  it('frames agent as ILR trained specialist', () => {
    const format = resolveResponseFormat();
    const prompt = buildSystemPrompt('Baseline Ben', mockContext, format);
    expect(prompt).toContain('ILR (I Love Real Estate) trained specialist');
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

  it('handles empty context without deflecting', () => {
    const format = resolveResponseFormat();
    const prompt = buildSystemPrompt('Baseline Ben', [], format);
    expect(prompt).toContain('general professional knowledge');
    expect(prompt).not.toContain('Let the client know this isn\'t your area');
  });

  it('does not tell agent to deflect when context exists', () => {
    const format = resolveResponseFormat();
    const prompt = buildSystemPrompt('Baseline Ben', mockContext, format);
    expect(prompt).not.toContain('outside my wheelhouse');
    expect(prompt).toContain('ALWAYS attempt to answer');
  });

  it('includes clarifying question instructions', () => {
    const format = resolveResponseFormat();
    const prompt = buildSystemPrompt('Baseline Ben', mockContext, format);
    expect(prompt).toContain('WHEN TO ASK CLARIFYING QUESTIONS');
    expect(prompt).toContain('never reply with only questions');
  });
});

describe('AGENT_ALIASES', () => {
  it('maps Baseline Ben to four agents', () => {
    expect(AGENT_ALIASES['Baseline Ben']).toHaveLength(4);
    expect(AGENT_ALIASES['Baseline Ben']).toContain('Navigator Nate');
    expect(AGENT_ALIASES['Baseline Ben']).toContain('Foundation Frank');
    expect(AGENT_ALIASES['Baseline Ben']).toContain('Roadmap Ray');
    expect(AGENT_ALIASES['Baseline Ben']).toContain('ILR Methodology');
  });

  it('maps Investor Coach to six agents', () => {
    expect(AGENT_ALIASES['Investor Coach']).toHaveLength(6);
    expect(AGENT_ALIASES['Investor Coach']).toContain('Splitter Steve');
    expect(AGENT_ALIASES['Investor Coach']).toContain('Equity Eddie');
    expect(AGENT_ALIASES['Investor Coach']).toContain('Yield Yates');
    expect(AGENT_ALIASES['Investor Coach']).toContain('Tenant Tony');
    expect(AGENT_ALIASES['Investor Coach']).toContain('Strata Sam');
    expect(AGENT_ALIASES['Investor Coach']).toContain('ILR Methodology');
  });

  it('maps Finance & Legal Team to four agents', () => {
    expect(AGENT_ALIASES['Finance & Legal Team']).toHaveLength(4);
    expect(AGENT_ALIASES['Finance & Legal Team']).toContain('Teflon Terry');
    expect(AGENT_ALIASES['Finance & Legal Team']).toContain('Depreciation Dave');
    expect(AGENT_ALIASES['Finance & Legal Team']).toContain('Venture Vince');
    expect(AGENT_ALIASES['Finance & Legal Team']).toContain('ILR Methodology');
  });

  it('maps Finder Fred to two agents', () => {
    expect(AGENT_ALIASES['Finder Fred']).toHaveLength(2);
    expect(AGENT_ALIASES['Finder Fred']).toContain('Finder Fred');
    expect(AGENT_ALIASES['Finder Fred']).toContain('ILR Methodology');
  });
});
