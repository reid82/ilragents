/**
 * Maps HPF suburb profile data to the pipeline's SuburbContext type.
 *
 * HPF suburb profile response contains:
 *   suburb{name, postcode, state, pid, slug, location, bbox, boundary}
 *   + demographic/statistical data (full shape TBD - needs higher truncation limit)
 *
 * The suburb profile response was 17489 bytes in discovery -- most of the
 * truncated preview was boundary polygon data. The actual statistics are
 * in the remainder of the response which we haven't fully captured yet.
 *
 * This mapper extracts whatever fields are available and returns null
 * for fields not present in the HPF response.
 */

import type { ExtractionResult, HpfSuburbProfile } from '../extraction/router';

// Mirror the pipeline's SuburbContext shape
export interface SuburbContext {
  suburb: string;
  state: string;
  postcode: string;
  medianHouseholdIncome: number | null;
  populationGrowth5yr: number | null;
  ownerOccupierPct: number | null;
  medianAge: number | null;
  familyHouseholdPct: number | null;
  medianHousePrice: number | null;
  medianUnitPrice: number | null;
  medianWeeklyRent: number | null;
  grossRentalYield: number | null;
  vacancyRate: number | null;
  averageDaysOnMarket: number | null;
  predominantZoning: string | null;
  dataAsOf: string;
  dataSources: string[];
}

/**
 * Map HPF extraction result to SuburbContext.
 * Extracts suburb statistics from the suburb profile response.
 */
export function mapToSuburbContext(result: ExtractionResult): SuburbContext | null {
  const sp = result.suburbProfile;
  if (!sp?.suburb) return null;

  const s = sp.suburb;

  // Extract statistics from the suburb profile response.
  // Field paths are based on HPF's response structure -- we access them
  // dynamically since the full schema isn't known yet.
  const raw = sp as Record<string, unknown>;

  // Try common paths for median price data
  const medianPrices = raw.medianPrices as Record<string, unknown> | undefined;
  const demographics = raw.demographics as Record<string, unknown> | undefined;
  const rentalYield = raw.rentalYield as Record<string, unknown> | undefined;
  const marketActivity = raw.marketActivity as Record<string, unknown> | undefined;

  // Also check for flat/nested stats patterns HPF might use
  const stats = raw.statistics as Record<string, unknown> | undefined;

  return {
    suburb: s.name || '',
    state: s.state || '',
    postcode: s.postcode || '',
    medianHouseholdIncome: extractNumber(demographics, 'medianHouseholdIncome', 'householdIncome', 'income'),
    populationGrowth5yr: extractNumber(demographics, 'populationGrowth5yr', 'populationGrowth', 'popGrowth'),
    ownerOccupierPct: extractNumber(demographics, 'ownerOccupierPct', 'ownerOccupied', 'ownerOccupierRate'),
    medianAge: extractNumber(demographics, 'medianAge', 'age'),
    familyHouseholdPct: extractNumber(demographics, 'familyHouseholdPct', 'familyHouseholds', 'families'),
    medianHousePrice: extractNumber(medianPrices || stats, 'house', 'medianHousePrice', 'housePriceMedian'),
    medianUnitPrice: extractNumber(medianPrices || stats, 'unit', 'medianUnitPrice', 'unitPriceMedian'),
    medianWeeklyRent: extractNumber(rentalYield || stats, 'medianRent', 'medianWeeklyRent', 'rent'),
    grossRentalYield: extractNumber(rentalYield || stats, 'grossYield', 'rentalYield', 'yield'),
    vacancyRate: extractNumber(stats, 'vacancyRate', 'vacancy'),
    averageDaysOnMarket: extractNumber(marketActivity || stats, 'averageDaysOnMarket', 'daysOnMarket', 'dom'),
    predominantZoning: result.planning?.zone ?? null,
    dataAsOf: new Date().toISOString(),
    dataSources: ['hpf'],
  };
}

/**
 * Try multiple possible field names to extract a numeric value from an object.
 */
function extractNumber(obj: Record<string, unknown> | undefined, ...keys: string[]): number | null {
  if (!obj) return null;
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === 'number' && !isNaN(val)) return val;
    // Handle nested objects like { value: 123, display: "$123" }
    if (val && typeof val === 'object' && 'value' in (val as Record<string, unknown>)) {
      const inner = (val as Record<string, unknown>).value;
      if (typeof inner === 'number' && !isNaN(inner)) return inner;
    }
  }
  return null;
}
