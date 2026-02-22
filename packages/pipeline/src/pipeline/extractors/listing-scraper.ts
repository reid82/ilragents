import * as cheerio from 'cheerio';
import type { ListingData, ParsedAddress } from './listing-types';
import { LISTING_DETAIL_DEFAULTS } from './listing-types';

/**
 * Fetch HTML from a URL with browser-like headers
 */
async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-AU,en;q=0.9',
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText} for ${url}`);
  }
  return response.text();
}

/**
 * Parse a numeric price from display text like "$750,000", "$650,000 - $700,000", "Contact Agent"
 */
function parsePrice(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text.match(/\$[\d,]+/);
  if (!match) return null;
  return parseInt(match[0].replace(/[$,]/g, ''), 10) || null;
}

/**
 * Parse domain.com.au listing from HTML containing __NEXT_DATA__
 */
export function parseDomainListing(html: string, url: string): ListingData {
  const $ = cheerio.load(html);
  const scriptContent = $('#__NEXT_DATA__').html();

  if (!scriptContent) {
    throw new Error('Could not find __NEXT_DATA__ on domain.com.au page');
  }

  const nextData = JSON.parse(scriptContent);
  const listing = nextData?.props?.pageProps?.listingDetails;

  if (!listing) {
    throw new Error('Could not find listingDetails in domain.com.au page data');
  }

  const addr = listing.addressParts || {};
  const features = listing.features || {};
  const priceText = listing.priceDetails?.displayPrice || listing.price || null;
  const agents = listing.agents || [];
  const firstAgent = agents[0];

  return {
    source: 'domain',
    url,
    address: addr.displayAddress || '',
    suburb: addr.suburb || '',
    state: addr.state || '',
    postcode: addr.postcode || '',
    propertyType: (listing.propertyTypes || [])[0] || 'unknown',
    bedrooms: features.bedrooms ?? null,
    bathrooms: features.bathrooms ?? null,
    parking: features.parkingSpaces ?? null,
    landSize: listing.landArea ?? null,
    buildingSize: listing.buildingArea ?? null,
    price: priceText,
    priceGuide: parsePrice(priceText),
    listingType: listing.listingType === 'sale' ? 'sale'
      : listing.listingType === 'auction' ? 'auction'
      : listing.listingType === 'expressionOfInterest' ? 'eoi'
      : 'unknown',
    auctionDate: listing.auctionSchedule?.auctionDate || null,
    daysOnMarket: listing.daysOnMarket ?? null,
    description: listing.description || '',
    features: (listing.propertyFeatures || []).map((f: { displayLabel?: string }) => f.displayLabel).filter(Boolean),
    images: (listing.media || []).map((m: { url?: string }) => m.url).filter(Boolean),
    agentName: firstAgent?.name || null,
    agencyName: firstAgent?.agency?.name || null,
    suburbMedianPrice: listing.suburbInsights?.medianSoldPrice ?? null,
    suburbMedianRent: listing.suburbInsights?.medianRentPrice ?? null,
    suburbDaysOnMarket: listing.suburbInsights?.avgDaysOnMarket ?? null,
    suburbAuctionClearance: listing.suburbInsights?.auctionClearanceRate ?? null,
    ...LISTING_DETAIL_DEFAULTS,
    rawData: listing,
  };
}

/**
 * Parse realestate.com.au listing from HTML containing ArgonautExchange
 */
export function parseReaListing(html: string, url: string): ListingData {
  const $ = cheerio.load(html);

  let argonautData: Record<string, unknown> | null = null;
  $('script').each((_, el) => {
    const text = $(el).html() || '';
    if (text.includes('ArgonautExchange')) {
      const match = text.match(/window\.ArgonautExchange\s*=\s*(\{[\s\S]*?\});/);
      if (match) {
        try {
          argonautData = JSON.parse(match[1]);
        } catch {
          try {
            argonautData = JSON.parse(JSON.parse(match[1]));
          } catch { /* skip */ }
        }
      }
    }
  });

  if (!argonautData) {
    throw new Error('Could not find ArgonautExchange on realestate.com.au page');
  }

  const details = (argonautData as Record<string, unknown>).details as Record<string, unknown> || argonautData;
  const address = (details.address || {}) as Record<string, string>;
  const features = (details.features || {}) as Record<string, number>;
  const priceText = (details.price as Record<string, string>)?.display || null;

  return {
    source: 'rea',
    url,
    address: address.display || '',
    suburb: address.suburb || '',
    state: address.state || '',
    postcode: address.postcode || '',
    propertyType: (details.propertyType as string) || 'unknown',
    bedrooms: features.bedrooms ?? null,
    bathrooms: features.bathrooms ?? null,
    parking: features.parking ?? null,
    landSize: (details.landSize as number) ?? null,
    buildingSize: (details.buildingSize as number) ?? null,
    price: priceText,
    priceGuide: parsePrice(priceText),
    listingType: (details.listingMethod as string) === 'auction' ? 'auction' : 'sale',
    auctionDate: (details.auction as Record<string, string>)?.date || null,
    daysOnMarket: null,
    description: (details.description as string) || '',
    features: [],
    images: [],
    agentName: null,
    agencyName: null,
    suburbMedianPrice: null,
    suburbMedianRent: null,
    suburbDaysOnMarket: null,
    suburbAuctionClearance: null,
    ...LISTING_DETAIL_DEFAULTS,
    rawData: argonautData,
  };
}

/**
 * Scrape a listing from a URL. Detects the source and uses the appropriate parser.
 */
export async function scrapeListing(url: string): Promise<ListingData> {
  const html = await fetchHtml(url);

  if (url.includes('domain.com.au')) {
    return parseDomainListing(html, url);
  }
  if (url.includes('realestate.com.au')) {
    return parseReaListing(html, url);
  }

  throw new Error(`Unsupported listing URL: ${url}`);
}

/**
 * Search realestate.com.au for a listing matching the given address.
 * Returns the first matching ListingData or null.
 */
export async function searchReaByAddress(address: ParsedAddress): Promise<ListingData | null> {
  try {
    const suburb = address.suburb.toLowerCase().replace(/\s+/g, '-');
    const state = address.state?.toLowerCase() || '';
    const postcode = address.postcode || '';

    let searchUrl = `https://www.realestate.com.au/buy/in-${suburb}`;
    if (state) searchUrl += `,+${state}`;
    if (postcode) searchUrl += `+${postcode}`;
    searchUrl += '/list-1';

    const html = await fetchHtml(searchUrl);
    const $ = cheerio.load(html);

    // REA search results contain listing cards with links to individual listings
    // Look for links matching the street address
    const streetSearch = `${address.streetNumber} ${address.streetName}`.toLowerCase();
    let matchedUrl: string | null = null;

    $('a[href*="/property-"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().toLowerCase();
      const hrefLower = href.toLowerCase();

      if (text.includes(streetSearch) || hrefLower.includes(streetSearch.replace(/\s+/g, '-'))) {
        matchedUrl = href.startsWith('http')
          ? href
          : `https://www.realestate.com.au${href}`;
        return false; // break
      }
    });

    if (!matchedUrl) return null;

    // Scrape the matched listing using existing parser
    const listingHtml = await fetchHtml(matchedUrl);
    return parseReaListing(listingHtml, matchedUrl);
  } catch {
    return null;
  }
}
