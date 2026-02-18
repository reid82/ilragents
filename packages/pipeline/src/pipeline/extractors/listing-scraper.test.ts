import { describe, it, expect } from 'vitest';
import { parseDomainListing, parseReaListing } from './listing-scraper';
import { detectListingUrl } from './listing-types';

describe('detectListingUrl', () => {
  it('detects domain.com.au URL', () => {
    const result = detectListingUrl('Check this out https://www.domain.com.au/123-fake-street-suburb-vic-3000-abc123');
    expect(result).toEqual({
      url: 'https://www.domain.com.au/123-fake-street-suburb-vic-3000-abc123',
      source: 'domain',
    });
  });

  it('detects realestate.com.au URL', () => {
    const result = detectListingUrl('Look at https://www.realestate.com.au/property-house-vic-suburb-456');
    expect(result).toEqual({
      url: 'https://www.realestate.com.au/property-house-vic-suburb-456',
      source: 'rea',
    });
  });

  it('returns null for non-listing text', () => {
    expect(detectListingUrl('123 Main St, Suburbia')).toBeNull();
  });
});

describe('parseDomainListing', () => {
  it('extracts listing data from __NEXT_DATA__ JSON', () => {
    const html = `<html><head></head><body>
      <script id="__NEXT_DATA__" type="application/json">
      ${JSON.stringify({
        props: {
          pageProps: {
            listingDetails: {
              id: 12345,
              listingType: 'sale',
              headline: '3 Bed Family Home',
              priceDetails: { displayPrice: '$750,000' },
              addressParts: {
                displayAddress: '123 Fake St, Richmond',
                suburb: 'Richmond',
                state: 'VIC',
                postcode: '3121',
              },
              features: {
                bedrooms: 3,
                bathrooms: 2,
                parkingSpaces: 1,
              },
              landArea: 450,
              buildingArea: 180,
              propertyTypes: ['house'],
              description: 'A lovely 3 bed home.',
              media: [{ url: 'https://img.domain.com.au/photo.jpg' }],
              agents: [{ name: 'Jane Agent', agency: { name: 'Top Agency' } }],
            },
          },
        },
      })}
      </script></body></html>`;

    const result = parseDomainListing(html, 'https://domain.com.au/test');
    expect(result.source).toBe('domain');
    expect(result.suburb).toBe('Richmond');
    expect(result.state).toBe('VIC');
    expect(result.postcode).toBe('3121');
    expect(result.bedrooms).toBe(3);
    expect(result.bathrooms).toBe(2);
    expect(result.parking).toBe(1);
    expect(result.landSize).toBe(450);
    expect(result.propertyType).toBe('house');
    expect(result.price).toBe('$750,000');
    expect(result.description).toContain('lovely');
    expect(result.agentName).toBe('Jane Agent');
    expect(result.agencyName).toBe('Top Agency');
  });

  it('handles missing optional fields gracefully', () => {
    const html = `<html><body>
      <script id="__NEXT_DATA__" type="application/json">
      ${JSON.stringify({
        props: { pageProps: { listingDetails: {
          id: 99,
          addressParts: { displayAddress: '1 Elm St', suburb: 'Test', state: 'NSW', postcode: '2000' },
          features: {},
          propertyTypes: [],
          description: '',
          media: [],
          agents: [],
        }}}
      })}
      </script></body></html>`;

    const result = parseDomainListing(html, 'https://domain.com.au/test2');
    expect(result.bedrooms).toBeNull();
    expect(result.price).toBeNull();
    expect(result.agentName).toBeNull();
  });
});
