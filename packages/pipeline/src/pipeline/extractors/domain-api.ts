const AUTH_URL = 'https://auth.domain.com.au/v1/connect/token';
const API_BASE = 'https://api.domain.com.au/v1';

interface TokenCache {
  token: string;
  expiresAt: number;
}

export class DomainApiClient {
  private tokenCache: TokenCache | null = null;

  private async getToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache.token;
    }

    const clientId = process.env.DOMAIN_API_CLIENT_ID;
    const clientSecret = process.env.DOMAIN_API_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('DOMAIN_API_CLIENT_ID and DOMAIN_API_CLIENT_SECRET are required');
    }

    const response = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'api_listings_read api_properties_read',
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Domain API auth failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    this.tokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000, // refresh 60s early
    };

    return this.tokenCache.token;
  }

  private async apiGet(path: string, params?: Record<string, string>): Promise<unknown> {
    const token = await this.getToken();
    const url = new URL(`${API_BASE}/${path}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  private async apiPost(path: string, body: unknown): Promise<unknown> {
    const token = await this.getToken();

    const response = await fetch(`${API_BASE}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error(`HTTP 403: Forbidden - your Domain API plan may not include access to ${path}. Check your API tier at developer.domain.com.au`);
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /** Search for property suggestions by address terms */
  async suggestProperties(terms: string): Promise<DomainPropertySuggestion[]> {
    const result = await this.apiGet('properties/_suggest', {
      terms,
      channel: 'Residential',
      pageSize: '5',
    });
    return (result as DomainPropertySuggestion[]) || [];
  }

  /** Search active residential sale listings by suburb */
  async searchResidentialListings(suburb: string, state: string): Promise<DomainSearchResult[]> {
    const result = await this.apiPost('listings/residential/_search', {
      listingType: 'Sale',
      locations: [{ suburb, state }],
      pageSize: 25,
    });
    return (result as DomainSearchResult[]) || [];
  }

  /** Get full details for a single listing */
  async getListing(id: number): Promise<Record<string, unknown>> {
    return (await this.apiGet(`listings/${id}`)) as Record<string, unknown>;
  }
}

// Domain API response types (subset of what they return)
export interface DomainPropertySuggestion {
  id: string;
  address?: string;
  addressComponents?: {
    streetNumber?: string;
    streetName?: string;
    streetType?: string;
    suburb?: string;
    state?: string;
    postcode?: string;
  };
  propertyType?: string;
  [key: string]: unknown;
}

export interface DomainSearchResult {
  type: string;
  listing?: {
    id: number;
    listingType: string;
    propertyDetails?: {
      displayableAddress?: string;
      suburb?: string;
      state?: string;
      postcode?: string;
      streetNumber?: string;
      street?: string;
      propertyType?: string;
      bedrooms?: number;
      bathrooms?: number;
      carspaces?: number;
      landArea?: number;
      buildingArea?: number;
      features?: string[];
    };
    priceDetails?: {
      displayPrice?: string;
      price?: number;
    };
    media?: { url?: string }[];
    advertiser?: {
      name?: string;
      contacts?: { name?: string }[];
    };
    headline?: string;
    summaryDescription?: string;
    auctionSchedule?: { time?: string };
    dateListed?: string;
  };
  [key: string]: unknown;
}
