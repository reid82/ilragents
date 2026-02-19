import { createClient, SupabaseClient } from '@supabase/supabase-js';

const TTL_DAYS: Record<string, number> = {
  'suburb-profile': 7,
  'abs-demographics': 30,
  'zoning': 30,
  'schools': 90,
  'sentiment': 14,
  'vacancy': 7,
  'crime': 90,
};

const TABLE = 'property_intelligence_cache';

export class IntelligenceCache {
  private client: SupabaseClient;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY required');
    this.client = createClient(url, key);
  }

  async get(source: string, suburb: string, state: string): Promise<unknown | null> {
    const key = `${source}:${suburb.toLowerCase()}:${state.toLowerCase()}`;
    try {
      const { data } = await this.client
        .from(TABLE)
        .select('data')
        .eq('cache_key', key)
        .gt('expires_at', new Date().toISOString())
        .single();
      return data?.data ?? null;
    } catch {
      return null;
    }
  }

  async set(source: string, suburb: string, state: string, value: unknown): Promise<void> {
    const key = `${source}:${suburb.toLowerCase()}:${state.toLowerCase()}`;
    const now = new Date();
    const ttlDays = TTL_DAYS[source] ?? 7;
    const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);

    await this.client.from(TABLE).upsert({
      cache_key: key,
      data: value,
      fetched_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    });
  }
}
