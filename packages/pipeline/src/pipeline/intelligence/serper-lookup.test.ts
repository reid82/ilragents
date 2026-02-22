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

function serperResponse(organic: Array<{ title: string; link: string; snippet?: string }>) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ organic }),
  };
}

describe('findListingUrlViaSerper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SERPER_API_KEY', 'test-serper-key');
  });

  it('returns null when SERPER_API_KEY is not set', async () => {
    vi.stubEnv('SERPER_API_KEY', '');
    const result = await findListingUrlViaSerper(testAddress);
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('finds a Domain listing URL', async () => {
    mockFetch.mockResolvedValueOnce(serperResponse([
      {
        title: '44 Red Rocks Road, Cowes VIC 3922 - Domain',
        link: 'https://www.domain.com.au/44-red-rocks-road-cowes-vic-3922-2019540812',
      },
    ]));

    const result = await findListingUrlViaSerper(testAddress);

    expect(result).not.toBeNull();
    expect(result!.source).toBe('domain');
    expect(result!.url).toBe('https://www.domain.com.au/44-red-rocks-road-cowes-vic-3922-2019540812');
    expect(mockFetch).toHaveBeenCalledTimes(1); // Only Domain search needed
  });

  it('falls back to REA when Domain has no listing', async () => {
    // Domain: no listing URLs in results
    mockFetch.mockResolvedValueOnce(serperResponse([
      { title: 'Cowes property prices', link: 'https://www.domain.com.au/suburb-profile/cowes-vic-3922' },
    ]));
    // REA: found a listing
    mockFetch.mockResolvedValueOnce(serperResponse([
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
    mockFetch.mockResolvedValue(serperResponse([]));

    const result = await findListingUrlViaSerper(testAddress);

    expect(result).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('skips non-listing Domain URLs (search pages, suburb profiles)', async () => {
    mockFetch.mockResolvedValueOnce(serperResponse([
      { title: 'Search results', link: 'https://www.domain.com.au/sale/cowes-vic-3922/' },
      { title: 'Suburb profile', link: 'https://www.domain.com.au/suburb-profile/cowes-vic-3922' },
      { title: 'News article', link: 'https://www.domain.com.au/news/some-article' },
    ]));
    mockFetch.mockResolvedValueOnce(serperResponse([]));

    const result = await findListingUrlViaSerper(testAddress);

    expect(result).toBeNull();
  });

  it('sends correct request format to Serper API', async () => {
    mockFetch.mockResolvedValue(serperResponse([]));

    await findListingUrlViaSerper(testAddress);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://google.serper.dev/search');
    expect(options.method).toBe('POST');
    expect(options.headers['X-API-KEY']).toBe('test-serper-key');
    expect(options.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(options.body);
    expect(body.q).toContain('site:domain.com.au');
    expect(body.q).toContain('"44 Red Rocks Rd Cowes VIC 3922"');
    expect(body.gl).toBe('au');
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
    mockFetch.mockResolvedValueOnce(serperResponse([
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
