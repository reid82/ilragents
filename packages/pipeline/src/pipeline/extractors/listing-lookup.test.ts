import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSearchApify = vi.fn();

vi.mock('./address-extractor', () => ({
  extractAddressFromMessage: vi.fn(),
}));

vi.mock('../intelligence/apify-listing-lookup', () => ({
  searchListingViaApify: (...args: unknown[]) => mockSearchApify(...args),
}));

import { lookupListingByAddress } from './listing-lookup';
import { extractAddressFromMessage } from './address-extractor';

const mockExtract = vi.mocked(extractAddressFromMessage);

describe('lookupListingByAddress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
    vi.stubEnv('APIFY_API_TOKEN', 'test-token');
    mockSearchApify.mockResolvedValue(null);
  });

  it('returns no-address when no address detected', async () => {
    mockExtract.mockResolvedValue(null);

    const result = await lookupListingByAddress('how do I invest?');

    expect(result.status).toBe('no-address');
    expect(result.listing).toBeNull();
  });

  it('returns listing when Apify finds a Domain match', async () => {
    const addr = { streetNumber: '71', streetName: 'Bridge', streetType: 'St', suburb: 'Eltham', state: 'VIC', postcode: '3095' };
    mockExtract.mockResolvedValue(addr);

    const fakeListing = { source: 'domain' as const, address: '71 Bridge St, Eltham VIC 3095', suburb: 'Eltham' } as any;
    mockSearchApify.mockResolvedValue(fakeListing);

    const result = await lookupListingByAddress('What about 71 Bridge St Eltham');

    expect(result.status).toBe('found');
    expect(result.listing).toBe(fakeListing);
    expect(result.source).toBe('apify-domain');
    expect(result.parsedAddress).toEqual(addr);
  });

  it('returns listing when Apify finds a REA match', async () => {
    const addr = { streetNumber: '71', streetName: 'Bridge', suburb: 'Eltham' };
    mockExtract.mockResolvedValue(addr);

    const fakeListing = { source: 'rea' as const, address: '71 Bridge St' } as any;
    mockSearchApify.mockResolvedValue(fakeListing);

    const result = await lookupListingByAddress('71 Bridge St Eltham');

    expect(result.status).toBe('found');
    expect(result.source).toBe('apify-rea');
  });

  it('returns not-found when Apify returns null', async () => {
    const addr = { streetNumber: '71', streetName: 'Bridge', suburb: 'Eltham' };
    mockExtract.mockResolvedValue(addr);
    mockSearchApify.mockResolvedValue(null);

    const result = await lookupListingByAddress('71 Bridge St Eltham');

    expect(result.status).toBe('not-found');
    expect(result.listing).toBeNull();
    expect(result.addressSearched).toBeDefined();
  });

  it('returns not-found when Apify throws', async () => {
    const addr = { streetNumber: '71', streetName: 'Bridge', suburb: 'Eltham' };
    mockExtract.mockResolvedValue(addr);
    mockSearchApify.mockRejectedValue(new Error('Apify down'));

    const result = await lookupListingByAddress('71 Bridge St Eltham');

    expect(result.status).toBe('not-found');
    expect(result.listing).toBeNull();
  });
});
