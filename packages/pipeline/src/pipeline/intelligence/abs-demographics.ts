import { IntelligenceCache } from './cache';

const ABS_BASE = 'https://data.api.abs.gov.au/rest/data';

export interface AbsDemographics {
  seifaAdvantage: number | null;
  seifaDisadvantage: number | null;
  medianPersonalIncome: number | null;
  population: number | null;
  medianAge: number | null;
}

export async function getAbsDemographics(
  suburb: string,
  state: string,
  postcode: string,
): Promise<AbsDemographics | null> {
  const cache = new IntelligenceCache();

  const cached = await cache.get('abs-demographics', suburb, state);
  if (cached) return cached as AbsDemographics;

  try {
    const seifaUrl = `${ABS_BASE}/ABS,SEIFA_POA,1.0.0/1+2.${postcode}?format=jsondata&detail=dataonly`;

    const res = await fetch(seifaUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.error(`[abs] SEIFA API returned ${res.status} for ${postcode}`);
      return null;
    }

    const data = await res.json();
    const obs = data?.dataSets?.[0]?.observations || {};
    const keys = Object.keys(obs);

    const result: AbsDemographics = {
      seifaAdvantage: keys.length > 0 ? obs[keys[0]]?.[0] ?? null : null,
      seifaDisadvantage: keys.length > 1 ? obs[keys[1]]?.[0] ?? null : null,
      medianPersonalIncome: null,
      population: null,
      medianAge: null,
    };

    await cache.set('abs-demographics', suburb, state, result);
    return result;
  } catch (err) {
    console.error(`[abs] Failed for ${suburb} ${state}:`, err instanceof Error ? err.message : err);
    return null;
  }
}
