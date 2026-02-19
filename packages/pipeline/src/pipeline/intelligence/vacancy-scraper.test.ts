import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRunActor = vi.fn();

vi.mock('./apify-client', () => ({
  ApifyClient: class {
    runActor = mockRunActor;
  },
}));

vi.mock('./cache', () => ({
  IntelligenceCache: class {
    get = vi.fn().mockResolvedValue(null);
    set = vi.fn().mockResolvedValue(undefined);
  },
}));

import { getVacancyRate } from './vacancy-scraper';

describe('getVacancyRate', () => {
  beforeEach(() => {
    mockRunActor.mockReset();
    vi.stubEnv('APIFY_API_TOKEN', 'test-token');
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'test-key');
  });

  it('returns vacancy rate from SQM scrape', async () => {
    mockRunActor.mockResolvedValue([{ vacancyRate: 1.8 }]);

    const result = await getVacancyRate('3121');
    expect(result).toBe(1.8);
  });

  it('returns null when no data found', async () => {
    mockRunActor.mockResolvedValue([]);

    const result = await getVacancyRate('9999');
    expect(result).toBeNull();
  });
});
