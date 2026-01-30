import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dotenv
vi.mock('dotenv', () => ({
  config: vi.fn(),
}));

// Mock pipeline chat
vi.mock('@ilre/pipeline/chat', () => ({
  chat: vi.fn().mockResolvedValue({
    reply: 'Test reply',
    sources: [],
  }),
}));

// Mock supabase
vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  })),
}));

describe('POST /api/chat', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns 400 when query is missing', async () => {
    const { POST } = await import('./route');
    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'Baseline Ben' }),
    });

    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('required');
  });

  it('returns 400 when agent is missing', async () => {
    const { POST } = await import('./route');
    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'What is equity?' }),
    });

    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('required');
  });
});
