/**
 * Maps HPF suburb profile data to the pipeline's SuburbContext type.
 *
 * HPF suburb profile response structure (from discovery):
 *   suburb{name, postcode, state, pid, slug, location, bbox, boundary}
 *   demographics.population{total, populationGrowth1/3/5/10Year,
 *     medianMortgageRepayMonthly, medianRentWeekly, medianHouseholdIncomeWeekly,
 *     age breakdowns, occupation breakdowns, commute methods}
 *   demographics.housing{totalPrivateDwellings, house, unit,
 *     ownedRatio, rentedRatio, buildingApprovals}
 *   demographics.seifa{...SEIFA indices}
 *   statistics.house.sold{count, mean, min, max, median, q1, q3,
 *     discountMedian, medianGrowth, domMedian, pageviewsMedian}
 *   statistics.house.leased{count, mean, median, domMedian}
 *   statistics.house.investment{yieldMedian, yieldMean, vacancyRate,
 *     marketAbsorptionRate, stockOnMarket, salePriceMedianGrowth1/3/5/10Year}
 *   statistics.bedrooms.house.{2,3,4,5}{sold/leased/investment}
 *   textSummary (AI-generated suburb description)
 *   neighbourhood{education metrics, locality flags, CBD distance}
 */

import type { ExtractionResult } from '../extraction/router';

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
  auctionClearanceRate: number | null;
  populationTotal: number | null;
  medianMortgageRepayMonthly: number | null;
  priceGrowth1yr: number | null;
  priceGrowth3yr: number | null;
  priceGrowth5yr: number | null;
  priceGrowth10yr: number | null;
  stockOnMarket: number | null;
  marketAbsorptionRate: number | null;
  textSummary: string | null;
  dataAsOf: string;
  dataSources: string[];
}

/**
 * Map HPF extraction result to SuburbContext.
 * Uses exact field paths from the HPF suburb profile API response.
 */
export function mapToSuburbContext(result: ExtractionResult): SuburbContext | null {
  const sp = result.suburbProfile;
  if (!sp?.suburb) return null;

  const s = sp.suburb;
  const pop = sp.demographics?.population;
  const housing = sp.demographics?.housing as Record<string, unknown> | undefined;
  const houseSold = sp.statistics?.house?.sold;
  const houseLeased = sp.statistics?.house?.leased;
  const houseInv = sp.statistics?.house?.investment;
  const unitSold = sp.statistics?.unit?.sold;

  // medianHouseholdIncomeWeekly is per week -- annualize it
  const weeklyIncome = pop?.medianHouseholdIncomeWeekly;
  const annualIncome = typeof weeklyIncome === 'number' ? weeklyIncome * 52 : null;

  return {
    suburb: s.name || '',
    state: s.state || '',
    postcode: s.postcode || '',

    // Demographics
    medianHouseholdIncome: annualIncome,
    populationGrowth5yr: pop?.populationGrowth5Year ?? null,
    ownerOccupierPct: getNestedNumber(housing, 'total', 'ownedRatio')
      ?? getNestedNumber(housing, 'house', 'ownedRatio')
      ?? null,
    medianAge: null, // HPF provides age distribution breakdowns, not a single median
    familyHouseholdPct: null, // Not directly available from HPF
    populationTotal: pop?.total ?? null,
    medianMortgageRepayMonthly: pop?.medianMortgageRepayMonthly ?? null,

    // House prices
    medianHousePrice: houseSold?.median ?? null,
    medianUnitPrice: unitSold?.median ?? null,
    medianWeeklyRent: houseLeased?.median ?? pop?.medianRentWeekly ?? null,
    averageDaysOnMarket: houseSold?.domMedian ?? null,
    auctionClearanceRate: null, // Not available from HPF

    // Investment metrics
    grossRentalYield: houseInv?.yieldMedian ?? null,
    vacancyRate: houseInv?.vacancyRate ?? null,
    stockOnMarket: houseInv?.stockOnMarket ?? null,
    marketAbsorptionRate: houseInv?.marketAbsorptionRate ?? null,

    // Price growth
    priceGrowth1yr: houseInv?.salePriceMedianGrowth1Year ?? null,
    priceGrowth3yr: houseInv?.salePriceMedianGrowth3Year ?? null,
    priceGrowth5yr: houseInv?.salePriceMedianGrowth5Year ?? null,
    priceGrowth10yr: houseInv?.salePriceMedianGrowth10Year ?? null,

    // Zoning and text
    predominantZoning: result.planning?.zone ?? null,
    textSummary: sp.textSummary ?? null,

    dataAsOf: new Date().toISOString(),
    dataSources: ['hpf'],
  };
}

/** Safely access a nested numeric value like obj.key1.key2 */
function getNestedNumber(
  obj: Record<string, unknown> | undefined,
  ...keys: string[]
): number | undefined {
  let current: unknown = obj;
  for (const key of keys) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'number' && !isNaN(current) ? current : undefined;
}
