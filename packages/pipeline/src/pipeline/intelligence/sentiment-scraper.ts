import type { NeighbourhoodSentiment } from '../extractors/listing-types';
import { ApifyClient } from './apify-client';
import { IntelligenceCache } from './cache';

const SENTIMENT_ACTOR = process.env.APIFY_SENTIMENT_ACTOR || 'custom/homely-suburb-scraper';

export async function getNeighbourhoodSentiment(
  suburb: string,
  state: string,
): Promise<NeighbourhoodSentiment | null> {
  const cache = new IntelligenceCache();
  const cached = await cache.get('sentiment', suburb, state);
  if (cached) return cached as NeighbourhoodSentiment;

  try {
    const apify = new ApifyClient();
    const slug = `${state.toLowerCase()}/${suburb.toLowerCase().replace(/\s+/g, '-')}`;
    const items = await apify.runActor(SENTIMENT_ACTOR, {
      startUrls: [{ url: `https://www.homely.com.au/${slug}` }],
    });

    if (!items.length) return null;

    const raw = items[0] as Record<string, unknown>;

    const result: NeighbourhoodSentiment = {
      overallRating: typeof raw.overallRating === 'number' ? raw.overallRating : null,
      reviewCount: typeof raw.reviewCount === 'number' ? raw.reviewCount : 0,
      topPositives: Array.isArray(raw.positives) ? raw.positives.slice(0, 5) : [],
      topNegatives: Array.isArray(raw.negatives) ? raw.negatives.slice(0, 5) : [],
      source: 'homely',
    };

    await cache.set('sentiment', suburb, state, result);
    return result;
  } catch (err) {
    console.error(`[sentiment] Failed for ${suburb} ${state}:`, err instanceof Error ? err.message : err);
    return null;
  }
}
