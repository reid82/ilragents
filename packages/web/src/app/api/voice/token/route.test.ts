import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dotenv before importing route
vi.mock('dotenv', () => ({
  config: vi.fn(),
}));

describe('GET /api/voice/token', () => {
  beforeEach(() => {
    vi.resetModules();
    // Clear env vars
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_AGENT_ID;
  });

  it('returns 503 with available: false when env vars are empty', async () => {
    const { GET } = await import('./route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.available).toBe(false);
    expect(data.error).toBeDefined();
  });

  it('returns 503 when only API key is set', async () => {
    process.env.ELEVENLABS_API_KEY = 'test-key';
    const { GET } = await import('./route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.available).toBe(false);
  });

  it('returns 503 when only agent ID is set', async () => {
    process.env.ELEVENLABS_AGENT_ID = 'test-agent';
    const { GET } = await import('./route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.available).toBe(false);
  });
});
