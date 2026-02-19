import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { ApifyClient } from './apify-client';

describe('ApifyClient', () => {
  let client: ApifyClient;

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubEnv('APIFY_API_TOKEN', 'test-token');
    client = new ApifyClient();
  });

  it('runs an actor and returns dataset items', async () => {
    // Start run
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { id: 'run-1', status: 'SUCCEEDED', defaultDatasetId: 'ds-1' } }),
    });
    // Fetch dataset
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ suburb: 'Richmond', medianPrice: 1200000 }]),
    });

    const result = await client.runActor('test/actor', { suburb: 'Richmond' });
    expect(result).toEqual([{ suburb: 'Richmond', medianPrice: 1200000 }]);
  });

  it('polls when run is not immediately finished', async () => {
    // Start run - RUNNING status
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { id: 'run-1', status: 'RUNNING', defaultDatasetId: 'ds-1' } }),
    });
    // Poll - SUCCEEDED
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { id: 'run-1', status: 'SUCCEEDED', defaultDatasetId: 'ds-1' } }),
    });
    // Fetch dataset
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ data: 'test' }]),
    });

    const result = await client.runActor('test/actor', {}, { pollIntervalMs: 10 });
    expect(result).toEqual([{ data: 'test' }]);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('throws when APIFY_API_TOKEN is missing', () => {
    vi.stubEnv('APIFY_API_TOKEN', '');
    expect(() => new ApifyClient()).toThrow('APIFY_API_TOKEN');
  });

  it('returns empty array on actor failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { id: 'run-1', status: 'FAILED', defaultDatasetId: 'ds-1' } }),
    });

    const result = await client.runActor('test/actor', {});
    expect(result).toEqual([]);
  });
});
