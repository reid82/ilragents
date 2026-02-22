/**
 * OnTheHouse.com.au data extraction and mapping.
 *
 * OTH is powered by CoreLogic and provides:
 * - Property attributes (beds, baths, parking, land size)
 * - Estimated value range (CoreLogic AVM)
 * - Sale history (dates + prices)
 * - Council rates
 *
 * OTH does NOT typically provide:
 * - Active listing info (agent, inspection times, days on market)
 * - Floor plans, virtual tours
 * - Auction dates
 */

import type { Page } from 'playwright-core';
import type { ListingData, PropertyHistoryEntry } from '../extractors/listing-types';

/** Parse a numeric price from display text like "$650,000 - $700,000" (takes first price) */
function parsePrice(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text.match(/\$[\d,]+/);
  if (!match) return null;
  return parseInt(match[0].replace(/[$,]/g, ''), 10) || null;
}

/** Categorise a history event string */
function categoriseEvent(event: string): PropertyHistoryEntry['event'] {
  const lower = event.toLowerCase();
  if (lower.includes('sold') || lower.includes('sale')) return 'sold';
  if (lower.includes('list')) return 'listed';
  if (lower.includes('withdraw') || lower.includes('removed')) return 'withdrawn';
  if (lower.includes('rent') || lower.includes('lease')) return 'rental';
  return 'other';
}

/** Intermediate parsed data from OTH page */
interface OnthehouseParsed {
  bedrooms: number | null;
  bathrooms: number | null;
  parking: number | null;
  propertyType: string;
  landSize: number | null;
  buildingSize: number | null;
  priceGuide: number | null;
  description: string;
  propertyHistory: PropertyHistoryEntry[];
  councilRates: number | null;
  bodyCorpFees: number | null;
  images: string[];
}

/**
 * Parse raw extracted data from OTH page into structured fields.
 */
export function parseOnthehouseData(raw: Record<string, unknown>): OnthehouseParsed {
  const history = Array.isArray(raw.propertyHistory) ? raw.propertyHistory : [];

  return {
    bedrooms: typeof raw.bedrooms === 'number' ? raw.bedrooms : null,
    bathrooms: typeof raw.bathrooms === 'number' ? raw.bathrooms : null,
    parking: typeof raw.carSpaces === 'number' ? raw.carSpaces
      : typeof raw.parking === 'number' ? raw.parking : null,
    propertyType: typeof raw.propertyType === 'string' ? raw.propertyType.toLowerCase() : 'unknown',
    landSize: typeof raw.landSize === 'number' ? raw.landSize : null,
    buildingSize: typeof raw.buildingSize === 'number' ? raw.buildingSize : null,
    priceGuide: parsePrice(raw.estimatedValue as string),
    description: typeof raw.description === 'string' ? raw.description : '',
    propertyHistory: history.map((h: unknown): PropertyHistoryEntry => {
      const entry = h as Record<string, unknown>;
      return {
        date: (entry.date as string) || '',
        event: categoriseEvent((entry.event as string) || ''),
        price: parsePrice(entry.price as string),
        source: 'onthehouse',
      };
    }),
    councilRates: parsePrice(raw.councilRates as string),
    bodyCorpFees: parsePrice(raw.bodyCorpFees as string),
    images: Array.isArray(raw.images) ? (raw.images as string[]) : [],
  };
}

/**
 * Merge OTH extracted data into an existing ListingData.
 * Only overwrites fields that are richer than what we already have.
 */
export function mergeOnthehouseDetail(listing: ListingData, raw: Record<string, unknown>): ListingData {
  const parsed = parseOnthehouseData(raw);

  return {
    ...listing,
    bedrooms: parsed.bedrooms ?? listing.bedrooms,
    bathrooms: parsed.bathrooms ?? listing.bathrooms,
    parking: parsed.parking ?? listing.parking,
    propertyType: parsed.propertyType !== 'unknown' ? parsed.propertyType : listing.propertyType,
    landSize: parsed.landSize ?? listing.landSize,
    buildingSize: parsed.buildingSize ?? listing.buildingSize,
    priceGuide: parsed.priceGuide ?? listing.priceGuide,
    price: parsed.priceGuide ? `$${parsed.priceGuide.toLocaleString()}` : listing.price,
    description: parsed.description.length > listing.description.length
      ? parsed.description : listing.description,
    propertyHistory: parsed.propertyHistory.length > 0
      ? parsed.propertyHistory : listing.propertyHistory,
    councilRates: parsed.councilRates ?? listing.councilRates,
    bodyCorpFees: parsed.bodyCorpFees ?? listing.bodyCorpFees,
    images: parsed.images.length > listing.images.length
      ? parsed.images : listing.images,
    enrichedAt: new Date().toISOString(),
    enrichmentSource: 'bright-data',
    rawData: { ...listing.rawData, _othDetail: raw },
  };
}

/**
 * Playwright page extractor for onthehouse.com.au.
 *
 * Attempts to extract data from:
 * 1. window.REDUX_DATA (if available)
 * 2. Rendered DOM elements (fallback)
 */
export async function extractOnthehousePage(page: Page): Promise<Record<string, unknown>> {
  // Wait for the property content to render
  await page.waitForSelector('[class*="property"], [data-testid*="property"], main', { timeout: 10000 }).catch(() => {});

  return page.evaluate(() => {
    const data: Record<string, unknown> = {};

    // Try Redux store first
    const reduxData = (window as unknown as Record<string, unknown>).REDUX_DATA as Record<string, unknown> | undefined;
    if (reduxData) {
      return reduxData;
    }

    // Fallback: extract from rendered DOM
    const allText = document.body.innerText;

    // Beds/baths/car from icon groups or text
    const bedsMatch = allText.match(/(\d+)\s*(?:bed|bedroom)/i);
    const bathsMatch = allText.match(/(\d+)\s*(?:bath|bathroom)/i);
    const carsMatch = allText.match(/(\d+)\s*(?:car|parking|garage)/i);

    if (bedsMatch) data.bedrooms = parseInt(bedsMatch[1], 10);
    if (bathsMatch) data.bathrooms = parseInt(bathsMatch[1], 10);
    if (carsMatch) data.carSpaces = parseInt(carsMatch[1], 10);

    // Property type
    const typeMatch = allText.match(/property\s*type[:\s]*(house|apartment|unit|townhouse|villa|land|studio|duplex|terrace)/i);
    if (typeMatch) data.propertyType = typeMatch[1];

    // Land size
    const landMatch = allText.match(/land\s*(?:size|area)[:\s]*(\d[\d,]*)\s*(?:m²|sqm)/i);
    if (landMatch) data.landSize = parseInt(landMatch[1].replace(/,/g, ''), 10);

    // Estimated value
    const valueMatch = allText.match(/(?:estimated|value|worth)[:\s]*(\$[\d,]+(?:\s*-\s*\$[\d,]+)?)/i);
    if (valueMatch) data.estimatedValue = valueMatch[1];

    // Council rates
    const ratesMatch = allText.match(/council\s*rates?[:\s]*(\$[\d,]+)/i);
    if (ratesMatch) data.councilRates = ratesMatch[1];

    // Description - look for the longest paragraph
    const paragraphs = Array.from(document.querySelectorAll('p'));
    const longest = paragraphs
      .map(p => p.textContent?.trim() || '')
      .filter(t => t.length > 50)
      .sort((a, b) => b.length - a.length)[0];
    if (longest) data.description = longest;

    // Images
    const images = Array.from(document.querySelectorAll('img[src*="property"], img[src*="photo"], img[src*="image"]'))
      .map(img => (img as HTMLImageElement).src)
      .filter(Boolean);
    if (images.length > 0) data.images = images;

    return data;
  });
}
