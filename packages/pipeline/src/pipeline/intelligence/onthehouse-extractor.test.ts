import { describe, it, expect } from 'vitest';
import { mergeOnthehouseDetail, parseOnthehouseData } from './onthehouse-extractor';
import type { ListingData } from '../extractors/listing-types';
import { LISTING_DETAIL_DEFAULTS } from '../extractors/listing-types';

const baseListing: ListingData = {
  source: 'onthehouse',
  url: 'https://www.onthehouse.com.au/property/vic/cowes-3922/44-red-rocks-rd-cowes-vic-3922-12345',
  address: '44 Red Rocks Rd Cowes VIC 3922',
  suburb: 'Cowes',
  state: 'VIC',
  postcode: '3922',
  propertyType: 'house',
  bedrooms: 3,
  bathrooms: 2,
  parking: 1,
  landSize: null,
  buildingSize: null,
  price: null,
  priceGuide: null,
  listingType: 'unknown',
  auctionDate: null,
  daysOnMarket: null,
  description: 'From SerpAPI snippet',
  features: [],
  images: [],
  agentName: null,
  agencyName: null,
  suburbMedianPrice: null,
  suburbMedianRent: null,
  suburbDaysOnMarket: null,
  suburbAuctionClearance: null,
  ...LISTING_DETAIL_DEFAULTS,
  enrichmentSource: 'serp-snippet',
  rawData: {},
};

describe('parseOnthehouseData', () => {
  it('parses property attributes from raw extracted data', () => {
    const raw = {
      bedrooms: 4,
      bathrooms: 2,
      carSpaces: 2,
      propertyType: 'House',
      landSize: 650,
      estimatedValue: '$680,000 - $740,000',
      propertyHistory: [
        { date: '2020-03-15', event: 'Sold', price: '$620,000' },
        { date: '2018-06-01', event: 'Listed', price: '$600,000' },
      ],
      councilRates: '$2,100',
    };

    const result = parseOnthehouseData(raw);

    expect(result.bedrooms).toBe(4);
    expect(result.bathrooms).toBe(2);
    expect(result.parking).toBe(2);
    expect(result.propertyType).toBe('house');
    expect(result.landSize).toBe(650);
    expect(result.priceGuide).toBe(680000);
    expect(result.propertyHistory).toHaveLength(2);
    expect(result.propertyHistory[0]).toEqual({
      date: '2020-03-15',
      event: 'sold',
      price: 620000,
      source: 'onthehouse',
    });
    expect(result.councilRates).toBe(2100);
  });

  it('handles missing fields gracefully', () => {
    const result = parseOnthehouseData({});
    expect(result.bedrooms).toBeNull();
    expect(result.propertyHistory).toEqual([]);
    expect(result.priceGuide).toBeNull();
  });
});

describe('mergeOnthehouseDetail', () => {
  it('merges OTH data over snippet-based listing', () => {
    const raw = {
      bedrooms: 4,
      bathrooms: 2,
      carSpaces: 2,
      propertyType: 'House',
      landSize: 650,
      estimatedValue: '$680,000 - $740,000',
      description: 'A spacious family home with 4 bedrooms and large backyard',
      propertyHistory: [
        { date: '2020-03-15', event: 'Sold', price: '$620,000' },
      ],
    };

    const merged = mergeOnthehouseDetail(baseListing, raw);

    expect(merged.bedrooms).toBe(4);
    expect(merged.landSize).toBe(650);
    expect(merged.priceGuide).toBe(680000);
    expect(merged.description).toContain('spacious family home');
    expect(merged.propertyHistory).toHaveLength(1);
    expect(merged.enrichmentSource).toBe('bright-data');
    expect(merged.enrichedAt).toBeTruthy();
  });

  it('keeps original data when OTH data is empty', () => {
    const merged = mergeOnthehouseDetail(baseListing, {});

    expect(merged.bedrooms).toBe(3); // from baseListing
    expect(merged.description).toBe('From SerpAPI snippet');
    expect(merged.enrichmentSource).toBe('bright-data');
  });
});
