import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { DomainApiClient } from './domain-api';

describe('DomainApiClient', () => {
  let client: DomainApiClient;

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubEnv('DOMAIN_API_CLIENT_ID', 'test-id');
    vi.stubEnv('DOMAIN_API_CLIENT_SECRET', 'test-secret');
    client = new DomainApiClient();
  });

  describe('authenticate', () => {
    it('fetches an OAuth token on first call', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'tok-123', expires_in: 43200 }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ id: '1', address: '42 Smith St' }]),
      });

      await client.suggestProperties('42 Smith St Richmond');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      // First call is auth
      expect(mockFetch.mock.calls[0][0]).toBe('https://auth.domain.com.au/v1/connect/token');
    });

    it('reuses cached token on second call', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'tok-123', expires_in: 43200 }),
      });
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await client.suggestProperties('query 1');
      await client.suggestProperties('query 2');

      // 1 auth + 2 API calls = 3
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('suggestProperties', () => {
    it('calls the properties/_suggest endpoint with terms', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'tok-123', expires_in: 43200 }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([
          { id: 'prop-1', address: '42 Smith St, Richmond VIC 3121', propertyType: 'house' },
        ]),
      });

      const results = await client.suggestProperties('42 Smith St Richmond');

      const suggestCall = mockFetch.mock.calls[1];
      expect(suggestCall[0]).toContain('api.domain.com.au/v1/properties/_suggest');
      expect(suggestCall[0]).toContain('terms=42+Smith+St+Richmond');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('prop-1');
    });
  });

  describe('searchResidentialListings', () => {
    it('POSTs to the residential search endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'tok-123', expires_in: 43200 }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([
          { id: 12345, type: 'PropertyListing', listing: { listingType: 'Sale' } },
        ]),
      });

      const results = await client.searchResidentialListings('Richmond', 'VIC');

      const searchCall = mockFetch.mock.calls[1];
      expect(searchCall[0]).toBe('https://api.domain.com.au/v1/listings/residential/_search');
      expect(searchCall[1].method).toBe('POST');
      const body = JSON.parse(searchCall[1].body);
      expect(body.listingType).toBe('Sale');
      expect(body.locations[0].suburb).toBe('Richmond');
      expect(body.locations[0].state).toBe('VIC');
    });
  });

  describe('getListing', () => {
    it('fetches a single listing by ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'tok-123', expires_in: 43200 }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 12345, headline: 'Beautiful Home' }),
      });

      const result = await client.getListing(12345);

      const listingCall = mockFetch.mock.calls[1];
      expect(listingCall[0]).toBe('https://api.domain.com.au/v1/listings/12345');
      expect(result.headline).toBe('Beautiful Home');
    });
  });

  describe('error handling', () => {
    it('throws on auth failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(client.suggestProperties('test')).rejects.toThrow('Domain API auth failed');
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'tok-123', expires_in: 43200 }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(client.suggestProperties('test')).rejects.toThrow('HTTP 500');
    });
  });
});
