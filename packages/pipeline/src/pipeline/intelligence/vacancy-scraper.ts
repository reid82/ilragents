import { ApifyClient } from './apify-client';
import { IntelligenceCache } from './cache';

const VACANCY_ACTOR = process.env.APIFY_VACANCY_ACTOR || 'custom/sqm-vacancy-scraper';

export async function getVacancyRate(postcode: string): Promise<number | null> {
  const cache = new IntelligenceCache();
  const cached = await cache.get('vacancy', postcode, 'AU');
  if (cached !== null) return cached as number;

  try {
    const apify = new ApifyClient();
    const items = await apify.runActor(VACANCY_ACTOR, {
      startUrls: [{ url: `https://sqmresearch.com.au/vacancy.php?postcode=${postcode}&t=1` }],
    });

    if (!items.length) return null;

    const raw = items[0] as Record<string, unknown>;
    const rate = typeof raw.vacancyRate === 'number' ? raw.vacancyRate : null;

    if (rate !== null) {
      await cache.set('vacancy', postcode, 'AU', rate);
    }
    return rate;
  } catch (err) {
    console.error(`[vacancy] Failed for ${postcode}:`, err instanceof Error ? err.message : err);
    return null;
  }
}
