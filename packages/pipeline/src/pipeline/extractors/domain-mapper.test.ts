import { describe, it, expect } from 'vitest';
import { mapDomainSearchResultToListing } from './domain-mapper';
import type { DomainSearchResult } from './domain-api';

describe('mapDomainSearchResultToListing', () => {
  const fullResult: DomainSearchResult = {
    type: 'PropertyListing',
    listing: {
      id: 12345,
      listingType: 'Sale',
      propertyDetails: {
        displayableAddress: '42 Smith St, Richmond VIC 3121',
        suburb: 'Richmond',
        state: 'VIC',
        postcode: '3121',
        streetNumber: '42',
        street: 'Smith St',
        propertyType: 'House',
        bedrooms: 3,
        bathrooms: 2,
        carspaces: 1,
        landArea: 450,
        buildingArea: 180,
        features: ['Air Conditioning', 'Garage'],
      },
      priceDetails: {
        displayPrice: '$750,000 - $800,000',
        price: 750000,
      },
      media: [
        { url: 'https://img.domain.com.au/photo1.jpg' },
        { url: 'https://img.domain.com.au/photo2.jpg' },
      ],
      advertiser: {
        name: 'Top Agency',
        contacts: [{ name: 'Jane Agent' }],
      },
      headline: 'Beautiful Family Home',
      summaryDescription: 'A lovely 3 bed home in the heart of Richmond.',
      auctionSchedule: { time: '2026-03-01T10:00:00' },
      dateListed: '2026-01-15',
    },
  };

  it('maps all property details correctly', () => {
    const listing = mapDomainSearchResultToListing(fullResult);
    expect(listing.source).toBe('domain');
    expect(listing.address).toBe('42 Smith St, Richmond VIC 3121');
    expect(listing.suburb).toBe('Richmond');
    expect(listing.state).toBe('VIC');
    expect(listing.postcode).toBe('3121');
    expect(listing.propertyType).toBe('House');
    expect(listing.bedrooms).toBe(3);
    expect(listing.bathrooms).toBe(2);
    expect(listing.parking).toBe(1);
    expect(listing.landSize).toBe(450);
    expect(listing.buildingSize).toBe(180);
  });

  it('maps price details', () => {
    const listing = mapDomainSearchResultToListing(fullResult);
    expect(listing.price).toBe('$750,000 - $800,000');
    expect(listing.priceGuide).toBe(750000);
  });

  it('maps listing type', () => {
    const sale = mapDomainSearchResultToListing(fullResult);
    expect(sale.listingType).toBe('sale');

    const auction = mapDomainSearchResultToListing({
      ...fullResult,
      listing: { ...fullResult.listing!, listingType: 'Auction' },
    });
    expect(auction.listingType).toBe('auction');
  });

  it('maps agent info', () => {
    const listing = mapDomainSearchResultToListing(fullResult);
    expect(listing.agentName).toBe('Jane Agent');
    expect(listing.agencyName).toBe('Top Agency');
  });

  it('maps description and images', () => {
    const listing = mapDomainSearchResultToListing(fullResult);
    expect(listing.description).toContain('lovely');
    expect(listing.images).toHaveLength(2);
  });

  it('handles missing optional fields gracefully', () => {
    const minimal: DomainSearchResult = {
      type: 'PropertyListing',
      listing: {
        id: 99,
        listingType: 'Sale',
        propertyDetails: {
          displayableAddress: '1 Test St, TestSuburb NSW 2000',
          suburb: 'TestSuburb',
          state: 'NSW',
          postcode: '2000',
        },
      },
    };

    const listing = mapDomainSearchResultToListing(minimal);
    expect(listing.bedrooms).toBeNull();
    expect(listing.price).toBeNull();
    expect(listing.agentName).toBeNull();
    expect(listing.description).toBe('');
    expect(listing.images).toEqual([]);
  });
});
