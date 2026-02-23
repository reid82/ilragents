/**
 * HPF (Hot Property Finder) Service Client
 *
 * Thin HTTP client that calls the HPF extraction service running on a VPS.
 * The service maintains an authenticated browser session on hotpropertyfinder.ai
 * and returns structured property data via HTTP.
 *
 * Gated on HPF_SERVICE_URL env var - if not set, all calls return null
 * and the pipeline falls through to existing data sources.
 */

import type { ListingData, SuburbContext, PropertyIntelligence } from '../extractors/listing-types';

const REQUEST_TIMEOUT_MS = 15_000;

export interface HpfResult {
  listing: ListingData;
  suburb: SuburbContext | null;
  intelligence: PropertyIntelligence | null;
  source: 'hpf';
  fetchedMs: number;
}

interface HpfHealthResponse {
  status: 'ok' | 'degraded' | 'down';
  browser: string;
  session: string;
  queueDepth: number;
}

function getConfig(): { url: string; apiKey: string } | null {
  const url = process.env.HPF_SERVICE_URL;
  if (!url) return null;
  const apiKey = process.env.HPF_API_KEY || '';
  return { url: url.replace(/\/$/, ''), apiKey };
}

async function hpfFetch<T>(path: string, body?: Record<string, unknown>): Promise<T | null> {
  const config = getConfig();
  if (!config) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${config.url}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      console.log(`[hpf-client] ${path} returned ${response.status}`);
      return null;
    }

    return await response.json() as T;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.log(`[hpf-client] ${path} timed out after ${REQUEST_TIMEOUT_MS}ms`);
    } else {
      console.log(`[hpf-client] ${path} failed: ${err instanceof Error ? err.message : err}`);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Check if the HPF service is configured and healthy */
export async function isHpfHealthy(): Promise<boolean> {
  if (!getConfig()) return false;

  const health = await hpfFetch<HpfHealthResponse>('/api/v1/health');
  if (!health) return false;

  return health.status === 'ok';
}

/** Look up a property by address via the HPF service */
export async function lookupViaHpf(
  address: string,
  suburb: string,
  state: string,
  postcode: string,
): Promise<HpfResult | null> {
  console.log(`[hpf-client] Looking up: ${address}`);

  const result = await hpfFetch<HpfResult>('/api/v1/property/lookup', {
    address,
    suburb,
    state,
    postcode,
  });

  if (result) {
    console.log(`[hpf-client] Got result in ${result.fetchedMs}ms`);
  }

  return result;
}

/** Look up suburb profile via the HPF service */
export async function getSuburbViaHpf(
  suburb: string,
  state: string,
  postcode: string,
): Promise<{ suburb: SuburbContext; intelligence: PropertyIntelligence | null } | null> {
  return hpfFetch('/api/v1/suburb/profile', { suburb, state, postcode });
}
