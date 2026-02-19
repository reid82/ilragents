import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('./cache', () => ({
  IntelligenceCache: class {
    get = vi.fn().mockResolvedValue(null);
    set = vi.fn().mockResolvedValue(undefined);
  },
}));

import { getZoningData } from './zoning-lookup';

describe('getZoningData', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'test-key');
  });

  it('returns zoning data for a VIC address', async () => {
    // Mock Vicmap geocode
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ location: { x: 145.0, y: -37.8 } }],
      }),
    });
    // Mock Vicmap zone query
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        features: [{
          attributes: {
            ZONE_CODE: 'GRZ1',
            ZONE_DESCRIPTION: 'General Residential Zone - Schedule 1',
          },
        }],
      }),
    });
    // Mock overlay query
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        features: [{
          attributes: {
            OVERLAY_CODE: 'HO123',
            OVERLAY_DESCRIPTION: 'Heritage Overlay',
          },
        }],
      }),
    });

    const result = await getZoningData('42 Smith St', 'Richmond', 'VIC');
    expect(result).not.toBeNull();
    expect(result!.zoneCode).toBe('GRZ1');
    expect(result!.overlays).toContain('HO123');
  });

  it('returns null for unsupported states', async () => {
    const result = await getZoningData('1 Main St', 'Darwin', 'NT');
    expect(result).toBeNull();
  });
});
