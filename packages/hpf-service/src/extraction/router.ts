import type { Page } from 'playwright';
import type { BrowserManager } from '../browser/manager';
import { config } from '../config';

/**
 * Raw property data extracted from HPF.
 * This is the intermediate format before mapping to ListingData.
 * Shape will be defined during discovery phase.
 */
export interface HpfRawData {
  [key: string]: unknown;
}

export interface ExtractionResult {
  data: HpfRawData;
  method: 'api-replay' | 'api-intercept' | 'dom-scrape';
  fetchedMs: number;
}

/**
 * Routes extraction requests through available methods in priority order:
 * 1. API replay (direct HTTP calls with auth cookies)
 * 2. API intercept (navigate + capture JSON responses)
 * 3. DOM scrape (navigate + extract from rendered page)
 *
 * The specific extractors will be implemented after the discovery phase
 * reveals HPF's tech stack and data structure.
 */
export class ExtractionRouter {
  constructor(private browserManager: BrowserManager) {}

  async lookupProperty(address: string, suburb?: string, state?: string, postcode?: string): Promise<ExtractionResult | null> {
    const start = Date.now();

    // TODO: Implement after discovery phase
    // 1. Try API replay (if replayable endpoints discovered)
    // 2. Try API intercept (navigate to property page, capture API responses)
    // 3. Fall back to DOM scraping

    // For now, use browser navigation + page data extraction
    const page = await this.browserManager.newPage();
    try {
      const data = await this.navigateAndExtract(page, address, suburb, state, postcode);
      if (data && Object.keys(data).length > 0) {
        return {
          data,
          method: 'api-intercept',
          fetchedMs: Date.now() - start,
        };
      }
      return null;
    } finally {
      await page.close();
    }
  }

  /**
   * Navigate to HPF property page and extract data.
   * This is a placeholder that will be refined after discovery.
   */
  private async navigateAndExtract(
    page: Page,
    address: string,
    suburb?: string,
    state?: string,
    postcode?: string,
  ): Promise<HpfRawData | null> {
    const capturedResponses: Array<{ url: string; data: unknown }> = [];

    // Intercept JSON API responses during navigation
    page.on('response', async (response) => {
      try {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('json')) {
          const url = response.url();
          // Skip static assets
          if (/\.(js|css|map)(\?|$)/.test(url)) return;
          const body = await response.json().catch(() => null);
          if (body) capturedResponses.push({ url, data: body });
        }
      } catch {}
    });

    // TODO: Replace with actual HPF search flow after discovery
    // For now, navigate to search page and enter address
    const searchQuery = [address, suburb, state, postcode].filter(Boolean).join(' ');
    await page.goto(`${config.hpf.baseUrl}/search?q=${encodeURIComponent(searchQuery)}`, {
      waitUntil: 'networkidle',
      timeout: config.browser.requestTimeoutMs,
    });

    // Check for __NEXT_DATA__ or similar embedded data
    const pageData = await page.evaluate(() => {
      const nextEl = document.getElementById('__NEXT_DATA__');
      if (nextEl?.textContent) {
        try { return JSON.parse(nextEl.textContent); } catch {}
      }
      return null;
    });

    // Return captured API data or page data
    if (capturedResponses.length > 0) {
      return {
        _source: 'api-intercept',
        _capturedEndpoints: capturedResponses.map(r => r.url),
        ...Object.fromEntries(capturedResponses.map((r, i) => [`response_${i}`, r.data])),
      };
    }

    if (pageData) {
      return { _source: 'page-data', ...pageData };
    }

    return null;
  }
}
