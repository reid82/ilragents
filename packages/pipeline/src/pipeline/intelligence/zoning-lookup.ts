import type { ZoningData } from '../extractors/listing-types';
import { IntelligenceCache } from './cache';

const VICMAP_GEOCODE = 'https://services.land.vic.gov.au/SpatialDatamart/rest/addressLookup/findAddress';
const VICMAP_ZONE = 'https://services.land.vic.gov.au/SpatialDatamart/rest/planningScheme/zone/query';
const VICMAP_OVERLAY = 'https://services.land.vic.gov.au/SpatialDatamart/rest/planningScheme/overlay/query';

async function getVicZoning(address: string, suburb: string): Promise<ZoningData | null> {
  try {
    const geoUrl = new URL(VICMAP_GEOCODE);
    geoUrl.searchParams.set('address', `${address}, ${suburb}, VIC`);
    geoUrl.searchParams.set('f', 'json');

    const geoRes = await fetch(geoUrl.toString(), { signal: AbortSignal.timeout(10000) });
    if (!geoRes.ok) return null;

    const geoData = await geoRes.json();
    const location = geoData?.candidates?.[0]?.location;
    if (!location) return null;

    const { x: lon, y: lat } = location;

    const zoneUrl = new URL(VICMAP_ZONE);
    zoneUrl.searchParams.set('geometry', `${lon},${lat}`);
    zoneUrl.searchParams.set('geometryType', 'esriGeometryPoint');
    zoneUrl.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
    zoneUrl.searchParams.set('outFields', 'ZONE_CODE,ZONE_DESCRIPTION');
    zoneUrl.searchParams.set('f', 'json');

    const zoneRes = await fetch(zoneUrl.toString(), { signal: AbortSignal.timeout(10000) });
    if (!zoneRes.ok) return null;

    const zoneData = await zoneRes.json();
    const zone = zoneData?.features?.[0]?.attributes;

    const overlayUrl = new URL(VICMAP_OVERLAY);
    overlayUrl.searchParams.set('geometry', `${lon},${lat}`);
    overlayUrl.searchParams.set('geometryType', 'esriGeometryPoint');
    overlayUrl.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
    overlayUrl.searchParams.set('outFields', 'OVERLAY_CODE,OVERLAY_DESCRIPTION');
    overlayUrl.searchParams.set('f', 'json');

    const overlayRes = await fetch(overlayUrl.toString(), { signal: AbortSignal.timeout(10000) });
    const overlayData = overlayRes.ok ? await overlayRes.json() : { features: [] };
    const overlays = (overlayData?.features || []).map(
      (f: { attributes: { OVERLAY_CODE: string; OVERLAY_DESCRIPTION: string } }) => f.attributes
    );

    return {
      zoneCode: zone?.ZONE_CODE || 'Unknown',
      zoneDescription: zone?.ZONE_DESCRIPTION || 'Unknown',
      overlays: overlays.map((o: { OVERLAY_CODE: string }) => o.OVERLAY_CODE),
      overlayDescriptions: overlays.map((o: { OVERLAY_DESCRIPTION: string }) => o.OVERLAY_DESCRIPTION),
      maxBuildingHeight: null,
      minLotSize: null,
      state: 'VIC',
      source: 'vicmap-planning',
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[zoning] VIC lookup failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function getZoningData(
  address: string,
  suburb: string,
  state: string,
): Promise<ZoningData | null> {
  const cache = new IntelligenceCache();
  const cacheKey = `${address}, ${suburb}`.toLowerCase();
  const cached = await cache.get('zoning', cacheKey, state);
  if (cached) return cached as ZoningData;

  let result: ZoningData | null = null;

  switch (state.toUpperCase()) {
    case 'VIC':
      result = await getVicZoning(address, suburb);
      break;
    case 'NSW':
      console.log('[zoning] NSW not yet implemented');
      break;
    case 'QLD':
      console.log('[zoning] QLD not yet implemented');
      break;
    case 'SA':
      console.log('[zoning] SA not yet implemented');
      break;
    case 'WA':
      console.log('[zoning] WA not yet implemented');
      break;
    default:
      return null;
  }

  if (result) {
    await cache.set('zoning', cacheKey, state, result);
  }
  return result;
}
