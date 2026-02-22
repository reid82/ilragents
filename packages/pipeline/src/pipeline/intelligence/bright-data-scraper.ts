/**
 * Bright Data Scraping Browser - CDP-based headless browser for page rendering.
 *
 * Replaces Apify actors + Cheerio for scraping listing pages.
 * Connects via Chrome DevTools Protocol to Bright Data's managed browser
 * which handles anti-bot bypass, CAPTCHA solving, and fingerprinting.
 *
 * Env: BRIGHT_DATA_BROWSER_WS - WebSocket endpoint (includes auth)
 * Example: wss://brd-customer-XXXX-zone-scraping_browser:PASSWORD@brd.superproxy.io:9222
 */

import type { Page } from 'playwright-core';

const SCRAPE_TIMEOUT_MS = 30000;

export type PageExtractor = (page: Page) => Promise<Record<string, unknown>>;

/**
 * Scrape a URL using Bright Data Scraping Browser.
 *
 * Connects via CDP, navigates to URL, waits for JS rendering,
 * then runs the provided extractor function against the page.
 *
 * Returns null if BRIGHT_DATA_BROWSER_WS not configured or on error.
 */
export async function scrapeWithBrightData(
  url: string,
  extractor: PageExtractor,
): Promise<Record<string, unknown> | null> {
  const wsEndpoint = process.env.BRIGHT_DATA_BROWSER_WS;
  if (!wsEndpoint) {
    console.log('[bright-data] BRIGHT_DATA_BROWSER_WS not configured, skipping');
    return null;
  }
  if (!wsEndpoint.startsWith('wss://') && !wsEndpoint.startsWith('ws://')) {
    console.error('[bright-data] BRIGHT_DATA_BROWSER_WS must be a wss:// URL, got:', wsEndpoint.substring(0, 20) + '...');
    return null;
  }

  let browser;
  try {
    const { chromium } = await import('playwright-core');
    console.log(`[bright-data] Connecting to Scraping Browser for: ${url}`);

    browser = await chromium.connectOverCDP(wsEndpoint);
    const page = await browser.newPage();

    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: SCRAPE_TIMEOUT_MS,
    });

    const data = await extractor(page);
    await page.close();

    console.log(`[bright-data] Extracted ${Object.keys(data).length} fields from: ${url}`);
    return data;
  } catch (err) {
    console.error('[bright-data] Scrape failed:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

/**
 * Generic page extractor - captures __NEXT_DATA__ or ArgonautExchange.
 * Used for Domain/REA when scraped via Bright Data instead of Cheerio.
 */
export async function extractGenericPage(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    // Try Domain's __NEXT_DATA__
    const nextDataEl = document.getElementById('__NEXT_DATA__');
    if (nextDataEl?.textContent) {
      try {
        const nextData = JSON.parse(nextDataEl.textContent);
        const listing = nextData?.props?.pageProps?.listingDetails;
        if (listing) return listing;
      } catch {}
    }

    // Try REA's ArgonautExchange
    const scripts = Array.from(document.querySelectorAll('script'));
    for (const script of scripts) {
      const text = script.textContent || '';
      if (text.includes('ArgonautExchange')) {
        const match = text.match(/window\.ArgonautExchange\s*=\s*(\{[\s\S]*?\});/);
        if (match) {
          try {
            const data = JSON.parse(match[1]);
            return data.details || data;
          } catch {}
        }
      }
    }

    return {};
  });
}
