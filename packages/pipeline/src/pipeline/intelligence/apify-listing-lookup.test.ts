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

import { searchListingViaApify } from './apify-listing-lookup';
import type { ParsedAddress } from '../extractors/listing-types';

const testAddress: ParsedAddress = {
  streetNumber: '71',
  streetName: 'Bridge',
  streetType: 'St',
  suburb: 'Eltham',
  state: 'VIC',
  postcode: '3095',
};

describe('searchListingViaApify', () => {
  beforeEach(() => {
    mockRunActor.mockReset();
    vi.stubEnv('APIFY_API_TOKEN', 'test-token');
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'test-key');
  });

  it('returns listing from Domain search results', async () => {
    mockRunActor.mockResolvedValue([
      {
        url: 'https://www.domain.com.au/71-bridge-street-eltham-vic-3095-abc123',
        address: '71 Bridge Street, Eltham VIC 3095',
        price: '$850,000 - $935,000',
        bedrooms: 3,
        bathrooms: 2,
        parking: 2,
        propertyType: 'House',
        description: 'Beautiful family home',
        landSize: 650,
        agent: 'John Smith',
        agency: 'Barry Plant Eltham',
      },
    ]);

    const result = await searchListingViaApify(testAddress);

    expect(result).not.toBeNull();
    expect(result!.source).toBe('domain');
    expect(result!.suburb).toBe('Eltham');
    expect(result!.bedrooms).toBe(3);
    expect(mockRunActor).toHaveBeenCalledTimes(1);
  });

  it('falls back to REA when Domain returns no results', async () => {
    // First call (Domain) returns empty
    mockRunActor.mockResolvedValueOnce([]);
    // Second call (REA search) returns a result
    mockRunActor.mockResolvedValueOnce([
      {
        url: 'https://www.realestate.com.au/property-house-vic-eltham-abc123',
        address: '71 Bridge St, Eltham VIC 3095',
        price: '$850,000 - $935,000',
        bedrooms: 3,
        bathrooms: 2,
        carSpaces: 2,
        propertyType: 'house',
        description: 'Beautiful family home',
      },
    ]);

    const result = await searchListingViaApify(testAddress);

    expect(result).not.toBeNull();
    expect(result!.source).toBe('rea');
    expect(mockRunActor).toHaveBeenCalledTimes(2);
  });

  it('returns null when neither Domain nor REA has results', async () => {
    mockRunActor.mockResolvedValue([]);

    const result = await searchListingViaApify(testAddress);

    expect(result).toBeNull();
  });

  it('returns null when actor throws', async () => {
    mockRunActor.mockRejectedValue(new Error('Actor failed'));

    const result = await searchListingViaApify(testAddress);

    expect(result).toBeNull();
  });

  it('filters Domain results to match the target address', async () => {
    mockRunActor.mockResolvedValue([
      {
        url: 'https://www.domain.com.au/10-other-street-eltham-vic-3095-xyz',
        address: '10 Other Street, Eltham VIC 3095',
        price: '$500,000',
        bedrooms: 2,
        bathrooms: 1,
        propertyType: 'Unit',
      },
    ]);

    const result = await searchListingViaApify(testAddress);

    // Should not match - different street number/name
    expect(result).toBeNull();
  });
});
