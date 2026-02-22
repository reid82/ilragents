import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ParsedAddress } from '../extractors/listing-types';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { findListingUrlViaSerper } from './serper-lookup';

const testAddress: ParsedAddress = {
  streetNumber: '44',
  streetName: 'Red Rocks',
  streetType: 'Rd',
  suburb: 'Cowes',
  state: 'VIC',
  postcode: '3922',
};

function serpApiResponse(organic_results: Array<{ title: string; link: string; snippet?: string }>) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ organic_results, search_metadata: { status: 'Success' } }),
  };
}

describe('findListingUrlViaSerper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SERPER_API_KEY', 'test-serpapi-key');
  });

  it('returns null when SERPER_API_KEY is not set', async () => {
    vi.stubEnv('SERPER_API_KEY', '');
    const result = await findListingUrlViaSerper(testAddress);
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('finds a Domain listing URL', async () => {
    mockFetch.mockResolvedValueOnce(serpApiResponse([
      {
        title: '44 Red Rocks Road, Cowes VIC 3922 - Domain',
        link: 'https://www.domain.com.au/44-red-rocks-road-cowes-vic-3922-2019540812',
      },
    ]));

    const result = await findListingUrlViaSerper(testAddress);

    expect(result).not.toBeNull();
    expect(result!.source).toBe('domain');
    expect(result!.url).toBe('https://www.domain.com.au/44-red-rocks-road-cowes-vic-3922-2019540812');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to REA when Domain has no listing', async () => {
    mockFetch.mockResolvedValueOnce(serpApiResponse([
      { title: 'Cowes property prices', link: 'https://www.domain.com.au/suburb-profile/cowes-vic-3922' },
    ]));
    mockFetch.mockResolvedValueOnce(serpApiResponse([
      {
        title: '44 Red Rocks Road, Cowes - realestate.com.au',
        link: 'https://www.realestate.com.au/property-house-vic-cowes-143160680',
      },
    ]));

    const result = await findListingUrlViaSerper(testAddress);

    expect(result).not.toBeNull();
    expect(result!.source).toBe('rea');
    expect(result!.url).toBe('https://www.realestate.com.au/property-house-vic-cowes-143160680');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns null when neither site has a listing', async () => {
    mockFetch.mockResolvedValue(serpApiResponse([]));

    const result = await findListingUrlViaSerper(testAddress);

    expect(result).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('skips non-listing Domain URLs (search pages, suburb profiles)', async () => {
    mockFetch.mockResolvedValueOnce(serpApiResponse([
      { title: 'Search results', link: 'https://www.domain.com.au/sale/cowes-vic-3922/' },
      { title: 'Suburb profile', link: 'https://www.domain.com.au/suburb-profile/cowes-vic-3922' },
      { title: 'News article', link: 'https://www.domain.com.au/news/some-article' },
    ]));
    mockFetch.mockResolvedValueOnce(serpApiResponse([]));

    const result = await findListingUrlViaSerper(testAddress);

    expect(result).toBeNull();
  });

  it('sends correct request format to SerpAPI', async () => {
    mockFetch.mockResolvedValue(serpApiResponse([]));

    await findListingUrlViaSerper(testAddress);

    const [url, options] = mockFetch.mock.calls[0];
    // SerpAPI uses GET with query params
    expect(url).toContain('https://serpapi.com/search.json');
    expect(url).toContain('api_key=test-serpapi-key');
    expect(url).toContain('gl=au');
    expect(url).toContain('engine=google');
    expect(url).toContain('site%3Adomain.com.au');
    // Should be GET (no method specified = GET by default)
    expect(options.method).toBeUndefined();
  });

  it('returns null when API returns error status', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429, statusText: 'Too Many Requests' });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429, statusText: 'Too Many Requests' });

    const result = await findListingUrlViaSerper(testAddress);

    expect(result).toBeNull();
  });

  it('returns null when fetch throws (network error)', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await findListingUrlViaSerper(testAddress);

    expect(result).toBeNull();
  });

  it('includes title and snippet in result', async () => {
    mockFetch.mockResolvedValueOnce(serpApiResponse([
      {
        title: '44 Red Rocks Road, Cowes VIC 3922 - House for Sale',
        link: 'https://www.domain.com.au/44-red-rocks-road-cowes-vic-3922-2019540812',
        snippet: '3 bed, 2 bath house on 650sqm. Price guide $850,000.',
      },
    ]));

    const result = await findListingUrlViaSerper(testAddress);

    expect(result!.title).toBe('44 Red Rocks Road, Cowes VIC 3922 - House for Sale');
    expect(result!.snippet).toBe('3 bed, 2 bath house on 650sqm. Price guide $850,000.');
  });
});
