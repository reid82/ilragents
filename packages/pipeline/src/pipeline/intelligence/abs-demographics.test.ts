import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('./cache', () => ({
  IntelligenceCache: class {
    get = vi.fn().mockResolvedValue(null);
    set = vi.fn().mockResolvedValue(undefined);
  },
}));

import { getAbsDemographics } from './abs-demographics';

describe('getAbsDemographics', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'test-key');
  });

  it('fetches SEIFA index for a suburb', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        dataSets: [{
          observations: {
            '0:0:0': [1078],
          },
        }],
      }),
    });

    const result = await getAbsDemographics('Richmond', 'VIC', '3121');
    expect(result).not.toBeNull();
    expect(result!.seifaAdvantage).toBe(1078);
  });

  it('returns null on API error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const result = await getAbsDemographics('Nowhere', 'VIC', '9999');
    expect(result).toBeNull();
  });
});
