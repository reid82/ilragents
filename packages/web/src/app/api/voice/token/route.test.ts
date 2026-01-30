import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dotenv before importing route
vi.mock('dotenv', () => ({
  config: vi.fn(),
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

async function makeRequest(agent?: string) {
  const { NextRequest } = await import('next/server');
  const url = agent
    ? `http://localhost/api/voice/token?agent=${encodeURIComponent(agent)}`
    : 'http://localhost/api/voice/token';
  return new NextRequest(url);
}

describe('GET /api/voice/token', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_AGENT_ID;
  });

  it('returns 503 with available: false when API key is missing', async () => {
    const { GET } = await import('./route');
    const response = await GET(await makeRequest());
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.available).toBe(false);
    expect(data.error).toBeDefined();
  });

  it('returns 503 when API key is set but no agent ID configured', async () => {
    process.env.ELEVENLABS_API_KEY = 'test-key';
    const { GET } = await import('./route');
    const response = await GET(await makeRequest());
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.available).toBe(false);
  });

  it('returns 503 when no API key even with agent ID in env', async () => {
    process.env.ELEVENLABS_AGENT_ID = 'test-agent';
    const { GET } = await import('./route');
    const response = await GET(await makeRequest());
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.available).toBe(false);
  });
});
