import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
const mockSupabase = { from: mockFrom };

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSupabase,
}));

import { IntelligenceCache } from './cache';

describe('IntelligenceCache', () => {
  let cache: IntelligenceCache;

  beforeEach(() => {
    mockFrom.mockReset();
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'test-key');
    cache = new IntelligenceCache();
  });

  it('returns null on cache miss', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          gt: () => ({
            single: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
    });
    const result = await cache.get('suburb-profile', 'richmond', 'vic');
    expect(result).toBeNull();
  });

  it('returns cached data on cache hit', async () => {
    const cached = { medianHousePrice: 1200000 };
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          gt: () => ({
            single: () => Promise.resolve({ data: { data: cached }, error: null }),
          }),
        }),
      }),
    });
    const result = await cache.get('suburb-profile', 'richmond', 'vic');
    expect(result).toEqual(cached);
  });

  it('stores data with correct TTL', async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ upsert: upsertMock });

    await cache.set('suburb-profile', 'richmond', 'vic', { test: true });

    expect(upsertMock).toHaveBeenCalledTimes(1);
    const call = upsertMock.mock.calls[0][0];
    expect(call.cache_key).toBe('suburb-profile:richmond:vic');
    expect(call.data).toEqual({ test: true });
    // 7 day TTL for suburb-profile
    const expiresAt = new Date(call.expires_at);
    const fetchedAt = new Date(call.fetched_at);
    const diffDays = (expiresAt.getTime() - fetchedAt.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(7, 0);
  });
});
