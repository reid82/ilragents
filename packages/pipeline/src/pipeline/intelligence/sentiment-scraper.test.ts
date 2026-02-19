import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRunActor = vi.fn();
const mockCacheGet = vi.fn().mockResolvedValue(null);
const mockCacheSet = vi.fn().mockResolvedValue(undefined);

vi.mock('./apify-client', () => ({
  ApifyClient: class {
    runActor = mockRunActor;
  },
}));

vi.mock('./cache', () => ({
  IntelligenceCache: class {
    get = mockCacheGet;
    set = mockCacheSet;
  },
}));

import { getNeighbourhoodSentiment } from './sentiment-scraper';

describe('getNeighbourhoodSentiment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    vi.stubEnv('APIFY_API_TOKEN', 'test-token');
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'test-key');
  });

  it('returns sentiment data from Homely scrape', async () => {
    mockRunActor.mockResolvedValue([{
      overallRating: 4.2,
      reviewCount: 128,
      positives: ['Family friendly', 'Great cafes', 'Leafy streets'],
      negatives: ['Traffic', 'Parking'],
    }]);

    const result = await getNeighbourhoodSentiment('Richmond', 'VIC');

    expect(result).not.toBeNull();
    expect(result!.overallRating).toBe(4.2);
    expect(result!.reviewCount).toBe(128);
    expect(result!.topPositives).toContain('Family friendly');
    expect(result!.source).toBe('homely');
  });

  it('returns null when no data found', async () => {
    mockRunActor.mockResolvedValue([]);

    const result = await getNeighbourhoodSentiment('NowhereVille', 'VIC');

    expect(result).toBeNull();
  });
});
