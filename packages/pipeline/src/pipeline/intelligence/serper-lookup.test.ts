import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ParsedAddress } from '../extractors/listing-types';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { findListingUrlViaSerper, findAllListingUrls } from './serper-lookup';

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

/** Helper: mock fetch to return different results per site (parallel-safe) */
function mockFetchBySite(responses: Record<string, ReturnType<typeof serpApiResponse>>) {
  mockFetch.mockImplementation((url: string) => {
    for (const [site, response] of Object.entries(responses)) {
      if (url.includes(encodeURIComponent(`site:${site}`))) return Promise.resolve(response);
    }
    return Promise.resolve(serpApiResponse([]));
  });
}

describe('findAllListingUrls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SERPER_API_KEY', 'test-serpapi-key');
  });

  it('returns empty array when SERPER_API_KEY is not set', async () => {
    vi.stubEnv('SERPER_API_KEY', '');
    const results = await findAllListingUrls(testAddress);
    expect(results).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('searches all three sites in parallel', async () => {
    mockFetchBySite({});

    await findAllListingUrls(testAddress);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    const urls = mockFetch.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(urls.some(u => u.includes('domain.com.au'))).toBe(true);
    expect(urls.some(u => u.includes('realestate.com.au'))).toBe(true);
    expect(urls.some(u => u.includes('onthehouse.com.au'))).toBe(true);
  });

  it('returns results ordered REA > Domain > OTH', async () => {
    mockFetchBySite({
      'domain.com.au': serpApiResponse([{
        title: 'Domain listing',
        link: 'https://www.domain.com.au/44-red-rocks-road-cowes-vic-3922-2019540812',
      }]),
      'realestate.com.au': serpApiResponse([{
        title: 'REA listing',
        link: 'https://www.realestate.com.au/property-house-vic-cowes-143160680',
      }]),
      'onthehouse.com.au': serpApiResponse([{
        title: 'OTH listing',
        link: 'https://www.onthehouse.com.au/property/vic/cowes-3922/44-red-rocks-rd-4937422',
      }]),
    });

    const results = await findAllListingUrls(testAddress);

    expect(results).toHaveLength(3);
    expect(results[0].source).toBe('rea');
    expect(results[1].source).toBe('domain');
    expect(results[2].source).toBe('onthehouse');
  });

  it('returns only sources that have results', async () => {
    mockFetchBySite({
      'domain.com.au': serpApiResponse([]),
      'realestate.com.au': serpApiResponse([{
        title: 'REA listing',
        link: 'https://www.realestate.com.au/property-house-vic-cowes-143160680',
      }]),
      'onthehouse.com.au': serpApiResponse([]),
    });

    const results = await findAllListingUrls(testAddress);

    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('rea');
  });

  it('returns empty array when no site has a listing', async () => {
    mockFetchBySite({});

    const results = await findAllListingUrls(testAddress);

    expect(results).toEqual([]);
  });

  it('skips non-listing Domain URLs (search pages, suburb profiles)', async () => {
    mockFetchBySite({
      'domain.com.au': serpApiResponse([
        { title: 'Search results', link: 'https://www.domain.com.au/sale/cowes-vic-3922/' },
        { title: 'Suburb profile', link: 'https://www.domain.com.au/suburb-profile/cowes-vic-3922' },
      ]),
    });

    const results = await findAllListingUrls(testAddress);

    expect(results).toEqual([]);
  });

  it('handles API errors gracefully for individual sites', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes(encodeURIComponent('site:domain.com.au'))) {
        return Promise.resolve({ ok: false, status: 429, statusText: 'Too Many Requests' });
      }
      if (url.includes(encodeURIComponent('site:realestate.com.au'))) {
        return Promise.resolve(serpApiResponse([{
          title: 'REA listing',
          link: 'https://www.realestate.com.au/property-house-vic-cowes-143160680',
        }]));
      }
      return Promise.resolve(serpApiResponse([]));
    });

    const results = await findAllListingUrls(testAddress);

    // Domain failed but REA should still work
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('rea');
  });

  it('handles network errors gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const results = await findAllListingUrls(testAddress);

    expect(results).toEqual([]);
  });

  it('includes title and snippet in results', async () => {
    mockFetchBySite({
      'realestate.com.au': serpApiResponse([{
        title: '44 Red Rocks Road, Cowes VIC 3922 - House for Sale',
        link: 'https://www.realestate.com.au/property-house-vic-cowes-143160680',
        snippet: '3 bed, 2 bath house on 650sqm. Price guide $850,000.',
      }]),
    });

    const results = await findAllListingUrls(testAddress);

    expect(results[0].title).toBe('44 Red Rocks Road, Cowes VIC 3922 - House for Sale');
    expect(results[0].snippet).toBe('3 bed, 2 bath house on 650sqm. Price guide $850,000.');
  });

  it('sends correct request format to SerpAPI', async () => {
    mockFetchBySite({});

    await findAllListingUrls(testAddress);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('https://serpapi.com/search.json');
    expect(url).toContain('api_key=test-serpapi-key');
    expect(url).toContain('gl=au');
    expect(url).toContain('engine=google');
    expect(options.method).toBeUndefined();
  });
});

describe('findListingUrlViaSerper (legacy)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SERPER_API_KEY', 'test-serpapi-key');
  });

  it('returns null when no results', async () => {
    mockFetchBySite({});
    const result = await findListingUrlViaSerper(testAddress);
    expect(result).toBeNull();
  });

  it('returns best (first) result - REA preferred over Domain', async () => {
    mockFetchBySite({
      'domain.com.au': serpApiResponse([{
        title: 'Domain listing',
        link: 'https://www.domain.com.au/44-red-rocks-road-cowes-vic-3922-2019540812',
      }]),
      'realestate.com.au': serpApiResponse([{
        title: 'REA listing',
        link: 'https://www.realestate.com.au/property-house-vic-cowes-143160680',
      }]),
    });

    const result = await findListingUrlViaSerper(testAddress);

    expect(result).not.toBeNull();
    expect(result!.source).toBe('rea');
  });
});
