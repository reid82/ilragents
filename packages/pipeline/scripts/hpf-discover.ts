#!/usr/bin/env tsx
/**
 * HPF Discovery Script
 *
 * Launches a headed Playwright browser for exploring hotpropertyfinder.ai.
 * After manual login, instruments the page to capture:
 * - All XHR/fetch requests and JSON responses
 * - Embedded page data (__NEXT_DATA__, __NUXT__, Redux stores, etc.)
 * - Auth tokens (cookies, localStorage, sessionStorage)
 * - Response headers for tech stack identification
 *
 * Usage:
 *   npx tsx packages/pipeline/scripts/hpf-discover.ts [--url <property-url>]
 *
 * After login, type URLs in the terminal to navigate and capture data,
 * or type "report" to dump the discovery report, "quit" to exit.
 */

import { chromium, type Page, type BrowserContext, type Response } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';

// ── Config ──────────────────────────────────────────────────────────────────

const HPF_BASE = 'https://hotpropertyfinder.ai';
const REPORT_DIR = path.join(import.meta.dirname, '..', 'data', 'hpf-discovery');

// ── Types ───────────────────────────────────────────────────────────────────

interface CapturedRequest {
  timestamp: string;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  status: number;
  responseContentType: string;
  responseBody: unknown;
  responseSize: number;
}

interface DiscoveryReport {
  capturedAt: string;
  techStack: TechStackInfo;
  apiEndpoints: ApiEndpointSummary[];
  authInfo: AuthInfo;
  pageDataStructures: PageDataCapture[];
  requests: CapturedRequest[];
}

interface TechStackInfo {
  framework: string | null;
  serverHeaders: Record<string, string>;
  hasNextData: boolean;
  hasNuxtData: boolean;
  hasReduxStore: boolean;
  hasInitialState: boolean;
  otherGlobals: string[];
}

interface ApiEndpointSummary {
  method: string;
  urlPattern: string;
  exampleUrl: string;
  responseShape: string;
  count: number;
}

interface AuthInfo {
  cookies: Array<{ name: string; domain: string; path: string; httpOnly: boolean; secure: boolean; sameSite: string; expires: number }>;
  localStorageKeys: string[];
  sessionStorageKeys: string[];
  authHeaderPattern: string | null;
}

interface PageDataCapture {
  url: string;
  timestamp: string;
  nextData: unknown;
  nuxtData: unknown;
  initialState: unknown;
  reduxState: unknown;
  jsonLd: unknown[];
  metaTags: Record<string, string>;
}

// ── State ───────────────────────────────────────────────────────────────────

const capturedRequests: CapturedRequest[] = [];
const pageDataCaptures: PageDataCapture[] = [];
let techStack: TechStackInfo | null = null;

// ── Helpers ─────────────────────────────────────────────────────────────────

function ensureReportDir() {
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
}

function isJsonResponse(contentType: string): boolean {
  return contentType.includes('json') || contentType.includes('graphql');
}

function isApiCall(url: string, contentType: string): boolean {
  // Skip static assets
  if (/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map)(\?|$)/.test(url)) {
    return false;
  }
  // Include JSON responses
  if (isJsonResponse(contentType)) return true;
  // Include explicit API paths
  if (/\/api\/|\/graphql|\/v\d+\//.test(url)) return true;
  return false;
}

function truncateBody(body: unknown, maxLen = 5000): unknown {
  const str = typeof body === 'string' ? body : JSON.stringify(body);
  if (!str || str.length <= maxLen) return body;
  return { _truncated: true, preview: str.slice(0, maxLen), totalLength: str.length };
}

function describeShape(obj: unknown, depth = 0): string {
  if (depth > 3) return '...';
  if (obj === null) return 'null';
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return `[${describeShape(obj[0], depth + 1)}] (${obj.length} items)`;
  }
  if (typeof obj === 'object') {
    const keys = Object.keys(obj as Record<string, unknown>);
    if (keys.length === 0) return '{}';
    const preview = keys.slice(0, 8).map(k => {
      const val = (obj as Record<string, unknown>)[k];
      return `${k}: ${typeof val === 'object' && val !== null ? describeShape(val, depth + 1) : typeof val}`;
    });
    if (keys.length > 8) preview.push(`... +${keys.length - 8} more`);
    return `{ ${preview.join(', ')} }`;
  }
  return typeof obj;
}

// ── Response Capture ────────────────────────────────────────────────────────

async function captureResponse(response: Response) {
  try {
    const url = response.url();
    const contentType = response.headers()['content-type'] || '';

    if (!isApiCall(url, contentType)) return;

    let responseBody: unknown = null;
    let responseSize = 0;

    try {
      const buffer = await response.body();
      responseSize = buffer.length;

      if (isJsonResponse(contentType)) {
        const text = buffer.toString('utf-8');
        try {
          responseBody = JSON.parse(text);
        } catch {
          responseBody = text.slice(0, 2000);
        }
      }
    } catch {
      // Response body may not be available (e.g. redirects)
    }

    const request = response.request();
    let requestBody: string | null = null;
    try {
      requestBody = request.postData() || null;
    } catch {}

    const captured: CapturedRequest = {
      timestamp: new Date().toISOString(),
      method: request.method(),
      url,
      requestHeaders: request.headers(),
      requestBody,
      status: response.status(),
      responseContentType: contentType,
      responseBody: truncateBody(responseBody),
      responseSize,
    };

    capturedRequests.push(captured);

    // Log to console
    const bodyPreview = responseBody
      ? ` | ${describeShape(responseBody)}`
      : '';
    console.log(`  [API] ${request.method()} ${response.status()} ${url.replace(HPF_BASE, '')}${bodyPreview}`);
  } catch (err) {
    // Non-fatal - don't disrupt browsing
  }
}

// ── Page Data Extraction ────────────────────────────────────────────────────

async function extractPageData(page: Page): Promise<PageDataCapture> {
  const data = await page.evaluate(() => {
    const result: Record<string, unknown> = {};

    // __NEXT_DATA__
    const nextEl = document.getElementById('__NEXT_DATA__');
    if (nextEl?.textContent) {
      try { result.nextData = JSON.parse(nextEl.textContent); } catch {}
    }

    // __NUXT__
    if ((window as Record<string, unknown>).__NUXT__) {
      result.nuxtData = (window as Record<string, unknown>).__NUXT__;
    }

    // __INITIAL_STATE__
    if ((window as Record<string, unknown>).__INITIAL_STATE__) {
      result.initialState = (window as Record<string, unknown>).__INITIAL_STATE__;
    }

    // Redux store
    const w = window as Record<string, unknown>;
    if (w.__REDUX_DEVTOOLS_EXTENSION__ || w.__store__) {
      result.reduxState = w.__store__ || 'devtools-present';
    }

    // JSON-LD structured data
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    result.jsonLd = Array.from(jsonLdScripts).map(el => {
      try { return JSON.parse(el.textContent || ''); } catch { return null; }
    }).filter(Boolean);

    // Meta tags
    const metas: Record<string, string> = {};
    document.querySelectorAll('meta[name], meta[property]').forEach(el => {
      const key = el.getAttribute('name') || el.getAttribute('property') || '';
      const value = el.getAttribute('content') || '';
      if (key && value) metas[key] = value;
    });
    result.metaTags = metas;

    return result;
  });

  return {
    url: page.url(),
    timestamp: new Date().toISOString(),
    nextData: data.nextData || null,
    nuxtData: data.nuxtData || null,
    initialState: data.initialState || null,
    reduxState: data.reduxState || null,
    jsonLd: (data.jsonLd as unknown[]) || [],
    metaTags: (data.metaTags as Record<string, string>) || {},
  };
}

// ── Tech Stack Detection ────────────────────────────────────────────────────

async function detectTechStack(page: Page, responseHeaders: Record<string, string>): Promise<TechStackInfo> {
  const globals = await page.evaluate(() => {
    const w = window as Record<string, unknown>;
    const found: string[] = [];

    // Framework detection
    const checks: Record<string, string> = {
      'React': '__REACT_DEVTOOLS_GLOBAL_HOOK__',
      'Vue': '__VUE__',
      'Angular': 'ng',
      'Svelte': '__svelte',
      'Next.js': '__NEXT_DATA__',
      'Nuxt': '__NUXT__',
      'Remix': '__remixContext',
      'Gatsby': '___gatsby',
    };

    for (const [name, global] of Object.entries(checks)) {
      if (w[global] || document.getElementById(global)) {
        found.push(name);
      }
    }

    // Check for React in DOM
    const rootEl = document.getElementById('root') || document.getElementById('__next') || document.getElementById('app');
    if (rootEl && (rootEl as Record<string, unknown>)._reactRootContainer) {
      if (!found.includes('React')) found.push('React');
    }

    return found;
  });

  const framework = globals.length > 0 ? globals.join(' + ') : 'Unknown (possibly server-rendered)';

  return {
    framework,
    serverHeaders: responseHeaders,
    hasNextData: globals.includes('Next.js'),
    hasNuxtData: globals.includes('Nuxt'),
    hasReduxStore: await page.evaluate(() => !!(window as Record<string, unknown>).__REDUX_DEVTOOLS_EXTENSION__),
    hasInitialState: await page.evaluate(() => !!(window as Record<string, unknown>).__INITIAL_STATE__),
    otherGlobals: globals,
  };
}

// ── Auth Info Capture ───────────────────────────────────────────────────────

async function captureAuthInfo(context: BrowserContext, page: Page): Promise<AuthInfo> {
  const cookies = await context.cookies();
  const cookieInfo = cookies.map(c => ({
    name: c.name,
    domain: c.domain,
    path: c.path,
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite: c.sameSite,
    expires: c.expires,
  }));

  const storageInfo = await page.evaluate(() => {
    const lsKeys: string[] = [];
    const ssKeys: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) lsKeys.push(key);
      }
    } catch {}
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key) ssKeys.push(key);
      }
    } catch {}
    return { lsKeys, ssKeys };
  });

  // Check captured requests for auth header patterns
  let authHeaderPattern: string | null = null;
  for (const req of capturedRequests) {
    const authHeader = req.requestHeaders['authorization'];
    if (authHeader) {
      if (authHeader.startsWith('Bearer ')) {
        authHeaderPattern = 'Bearer <token>';
      } else {
        authHeaderPattern = authHeader.slice(0, 20) + '...';
      }
      break;
    }
  }

  return {
    cookies: cookieInfo,
    localStorageKeys: storageInfo.lsKeys,
    sessionStorageKeys: storageInfo.ssKeys,
    authHeaderPattern,
  };
}

// ── Report Generation ───────────────────────────────────────────────────────

function generateReport(authInfo: AuthInfo): DiscoveryReport {
  // Summarize API endpoints
  const endpointMap = new Map<string, { count: number; method: string; exampleUrl: string; exampleResponse: unknown }>();

  for (const req of capturedRequests) {
    // Normalize URL pattern (replace IDs with placeholders)
    const urlPattern = req.url
      .replace(HPF_BASE, '')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, ':uuid')
      .replace(/\/\d+/g, '/:id')
      .replace(/\?.*$/, '');

    const key = `${req.method} ${urlPattern}`;
    const existing = endpointMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      endpointMap.set(key, {
        count: 1,
        method: req.method,
        exampleUrl: req.url,
        exampleResponse: req.responseBody,
      });
    }
  }

  const apiEndpoints: ApiEndpointSummary[] = Array.from(endpointMap.entries()).map(([_, info]) => ({
    method: info.method,
    urlPattern: _.replace(info.method + ' ', ''),
    exampleUrl: info.exampleUrl,
    responseShape: describeShape(info.exampleResponse),
    count: info.count,
  }));

  return {
    capturedAt: new Date().toISOString(),
    techStack: techStack!,
    apiEndpoints,
    authInfo,
    pageDataStructures: pageDataCaptures,
    requests: capturedRequests,
  };
}

function saveReport(report: DiscoveryReport) {
  ensureReportDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  // Full report
  const reportPath = path.join(REPORT_DIR, `report-${timestamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n  Full report saved to: ${reportPath}`);

  // API endpoints summary
  const endpointsPath = path.join(REPORT_DIR, `api-endpoints-${timestamp}.json`);
  fs.writeFileSync(endpointsPath, JSON.stringify(report.apiEndpoints, null, 2));
  console.log(`  API endpoints saved to: ${endpointsPath}`);

  // Auth info (shape only, no values)
  const authPath = path.join(REPORT_DIR, `auth-info-${timestamp}.json`);
  fs.writeFileSync(authPath, JSON.stringify(report.authInfo, null, 2));
  console.log(`  Auth info saved to: ${authPath}`);

  // Page data structures
  const pageDataPath = path.join(REPORT_DIR, `page-data-${timestamp}.json`);
  const pageDataSummary = report.pageDataStructures.map(pd => ({
    url: pd.url,
    hasNextData: !!pd.nextData,
    hasNuxtData: !!pd.nuxtData,
    hasInitialState: !!pd.initialState,
    hasReduxState: !!pd.reduxState,
    jsonLdCount: pd.jsonLd.length,
    metaTagCount: Object.keys(pd.metaTags).length,
    nextDataShape: pd.nextData ? describeShape(pd.nextData) : null,
    fullData: pd,
  }));
  fs.writeFileSync(pageDataPath, JSON.stringify(pageDataSummary, null, 2));
  console.log(`  Page data saved to: ${pageDataPath}`);
}

// ── Interactive REPL ────────────────────────────────────────────────────────

async function startRepl(page: Page, context: BrowserContext): Promise<void> {
  return new Promise<void>((resolveRepl) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    console.log('\n=== HPF Discovery Mode ===');
    console.log('Commands:');
    console.log('  <url>      - Navigate to URL and capture data');
    console.log('  capture    - Capture current page data (embedded JSON, etc.)');
    console.log('  cookies    - Show current cookies');
    console.log('  requests   - Show captured API requests summary');
    console.log('  report     - Generate and save full discovery report');
    console.log('  session    - Save browser session state to disk');
    console.log('  quit       - Exit');
    console.log('');

    // Handle stdin closing unexpectedly (non-interactive context)
    rl.on('close', () => {
      resolveRepl();
    });

    const askNext = () => {
      rl.question('hpf> ', async (input) => {
        const trimmed = (input || '').trim();

        if (!trimmed) {
          askNext();
          return;
        }

        if (trimmed === 'quit' || trimmed === 'exit') {
          console.log('Generating final report...');
          const authInfo = await captureAuthInfo(context, page);
          const report = generateReport(authInfo);
          saveReport(report);
          rl.close();
          return;
        }

        if (trimmed === 'capture') {
          console.log('Capturing page data...');
          const pageData = await extractPageData(page);
          pageDataCaptures.push(pageData);
          console.log(`  URL: ${pageData.url}`);
          console.log(`  __NEXT_DATA__: ${pageData.nextData ? 'YES - ' + describeShape(pageData.nextData) : 'no'}`);
          console.log(`  __NUXT__: ${pageData.nuxtData ? 'YES' : 'no'}`);
          console.log(`  __INITIAL_STATE__: ${pageData.initialState ? 'YES' : 'no'}`);
          console.log(`  Redux: ${pageData.reduxState ? 'YES' : 'no'}`);
          console.log(`  JSON-LD: ${pageData.jsonLd.length} items`);
          console.log(`  Meta tags: ${Object.keys(pageData.metaTags).length} tags`);
          askNext();
          return;
        }

        if (trimmed === 'cookies') {
          const cookies = await context.cookies();
          console.log(`\n  ${cookies.length} cookies:`);
          for (const c of cookies) {
            const expires = c.expires > 0 ? new Date(c.expires * 1000).toISOString() : 'session';
            console.log(`    ${c.name} (${c.domain}) httpOnly=${c.httpOnly} expires=${expires}`);
          }
          console.log('');
          askNext();
          return;
        }

        if (trimmed === 'requests') {
          console.log(`\n  ${capturedRequests.length} API requests captured:`);
          const byEndpoint = new Map<string, number>();
          for (const req of capturedRequests) {
            const key = `${req.method} ${req.url.replace(HPF_BASE, '').replace(/\?.*$/, '')}`;
            byEndpoint.set(key, (byEndpoint.get(key) || 0) + 1);
          }
          for (const [endpoint, count] of byEndpoint) {
            console.log(`    ${endpoint} (x${count})`);
          }
          console.log('');
          askNext();
          return;
        }

        if (trimmed === 'report') {
          console.log('Generating report...');
          const authInfo = await captureAuthInfo(context, page);
          const report = generateReport(authInfo);
          saveReport(report);
          askNext();
          return;
        }

        if (trimmed === 'session') {
          ensureReportDir();
          const sessionPath = path.join(REPORT_DIR, 'hpf-session.json');
          const state = await context.storageState();
          fs.writeFileSync(sessionPath, JSON.stringify(state, null, 2));
          console.log(`  Session state saved to: ${sessionPath}`);
          askNext();
          return;
        }

        // Assume it's a URL or path
        let url = trimmed;
        if (!url.startsWith('http')) {
          url = url.startsWith('/') ? `${HPF_BASE}${url}` : `${HPF_BASE}/${url}`;
        }

        try {
          console.log(`  Navigating to: ${url}`);
          await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
          console.log(`  Page loaded: ${page.url()}`);

          // Auto-capture page data
          const pageData = await extractPageData(page);
          pageDataCaptures.push(pageData);

          if (pageData.nextData) console.log(`  __NEXT_DATA__ found! Shape: ${describeShape(pageData.nextData)}`);
          if (pageData.nuxtData) console.log(`  __NUXT__ data found!`);
          if (pageData.jsonLd.length > 0) console.log(`  ${pageData.jsonLd.length} JSON-LD items found`);

          const recentApiCalls = capturedRequests.filter(r =>
            new Date(r.timestamp).getTime() > Date.now() - 10000
          );
          if (recentApiCalls.length > 0) {
            console.log(`  ${recentApiCalls.length} API calls captured during navigation`);
          }
        } catch (err) {
          console.log(`  Navigation failed: ${err instanceof Error ? err.message : err}`);
        }

        askNext();
      });
    };

    askNext();
  });
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const startUrl = process.argv.find((a, i) => process.argv[i - 1] === '--url') || HPF_BASE;

  console.log('=== HPF Discovery Script ===');
  console.log(`Target: ${HPF_BASE}`);
  console.log('');

  // Check for saved session
  const sessionPath = path.join(REPORT_DIR, 'hpf-session.json');
  const hasSavedSession = fs.existsSync(sessionPath);

  console.log('Launching headed browser...');
  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized'],
  });

  let context: BrowserContext;
  if (hasSavedSession) {
    console.log('Restoring saved session...');
    const state = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
    context = await browser.newContext({
      storageState: state,
      viewport: null,
    });
  } else {
    context = await browser.newContext({
      viewport: null,
    });
  }

  const page = await context.newPage();

  // Attach response capture to all pages in the context
  context.on('page', (newPage) => {
    newPage.on('response', captureResponse);
  });
  page.on('response', captureResponse);

  // Navigate to HPF
  console.log(`Navigating to ${startUrl}...`);
  const response = await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 60000 });

  // Capture initial response headers for tech stack detection
  const responseHeaders: Record<string, string> = {};
  if (response) {
    const headers = response.headers();
    for (const key of ['x-powered-by', 'server', 'x-frame-options', 'x-nextjs-page', 'x-vercel-id']) {
      if (headers[key]) responseHeaders[key] = headers[key];
    }
  }

  // ── Step 1: Ensure authenticated ──────────────────────────────────────
  //
  // Use page.pause() to hand control to the user. This opens Playwright's
  // inspector toolbar at the top of the browser. The user can:
  //   - Log in if needed
  //   - Navigate to property pages manually
  //   - Click the green "Resume" (play) button when ready to continue
  //
  console.log('');
  console.log('==========================================================');
  console.log('  The browser is now under YOUR control.');
  console.log('');
  console.log('  1. Log in to HPF if you are not already logged in');
  console.log('  2. Navigate to a PROPERTY DETAIL page');
  console.log('  3. Click the green RESUME button (play icon) at the');
  console.log('     top of the browser to continue the script');
  console.log('');
  console.log('  All network requests are being captured in background.');
  console.log('==========================================================');
  console.log('');

  await page.pause();

  // ── Step 2: Capture current page ──────────────────────────────────────
  console.log(`\nResumed! Current URL: ${page.url()}`);
  console.log('Capturing page data...\n');

  // Detect tech stack
  techStack = await detectTechStack(page, responseHeaders);
  console.log(`Tech stack: ${techStack.framework}`);
  console.log(`Server: ${JSON.stringify(techStack.serverHeaders)}`);

  // Capture page data
  const pageData1 = await extractPageData(page);
  pageDataCaptures.push(pageData1);

  console.log(`__NEXT_DATA__: ${pageData1.nextData ? 'YES' : 'no'}`);
  console.log(`__NUXT__: ${pageData1.nuxtData ? 'YES' : 'no'}`);
  console.log(`__INITIAL_STATE__: ${pageData1.initialState ? 'YES' : 'no'}`);
  console.log(`Redux: ${pageData1.reduxState ? 'YES' : 'no'}`);
  console.log(`JSON-LD: ${pageData1.jsonLd.length} items`);
  console.log(`Meta tags: ${Object.keys(pageData1.metaTags).length}`);
  console.log(`API requests captured so far: ${capturedRequests.length}`);

  // Save session
  ensureReportDir();
  const sessionState = await context.storageState();
  fs.writeFileSync(sessionPath, JSON.stringify(sessionState, null, 2));
  console.log('Session saved.\n');

  // ── Step 3: Let user navigate to another page ─────────────────────────
  console.log('==========================================================');
  console.log('  Now navigate to a DIFFERENT property page in the browser');
  console.log('  (or a suburb/search page) then click RESUME again.');
  console.log('  This helps us compare data across multiple pages.');
  console.log('==========================================================\n');

  await page.pause();

  // Capture second page
  console.log(`\nResumed! Current URL: ${page.url()}`);
  const pageData2 = await extractPageData(page);
  pageDataCaptures.push(pageData2);

  console.log(`Page 2 __NEXT_DATA__: ${pageData2.nextData ? 'YES' : 'no'}`);
  console.log(`Page 2 JSON-LD: ${pageData2.jsonLd.length} items`);
  console.log(`Total API requests captured: ${capturedRequests.length}`);

  // ── Step 4: Optional third page ───────────────────────────────────────
  console.log('\n==========================================================');
  console.log('  Optional: navigate to one more page (search results,');
  console.log('  suburb profile, etc.) then click RESUME.');
  console.log('  Or just click RESUME to finish and generate the report.');
  console.log('==========================================================\n');

  await page.pause();

  // Capture if URL changed
  const page3Url = page.url();
  if (page3Url !== pageData2.url) {
    console.log(`\nCapturing page 3: ${page3Url}`);
    const pageData3 = await extractPageData(page);
    pageDataCaptures.push(pageData3);
  }

  // ── Step 5: Generate report ───────────────────────────────────────────
  console.log('\n\nGenerating discovery report...');

  // Save final session state
  const finalState = await context.storageState();
  fs.writeFileSync(sessionPath, JSON.stringify(finalState, null, 2));

  const authInfo = await captureAuthInfo(context, page);
  const report = generateReport(authInfo);
  saveReport(report);

  // Print summary
  console.log('\n=== DISCOVERY SUMMARY ===');
  console.log(`Tech stack: ${techStack.framework}`);
  console.log(`Total API requests captured: ${capturedRequests.length}`);
  console.log(`Unique API endpoints: ${report.apiEndpoints.length}`);
  console.log(`Pages analyzed: ${pageDataCaptures.length}`);
  console.log(`Cookies: ${authInfo.cookies.length}`);
  console.log(`localStorage keys: ${authInfo.localStorageKeys.length}`);
  console.log(`Auth header pattern: ${authInfo.authHeaderPattern || 'none detected'}`);
  console.log('');

  if (report.apiEndpoints.length > 0) {
    console.log('API Endpoints found:');
    for (const ep of report.apiEndpoints) {
      console.log(`  ${ep.method} ${ep.urlPattern} (x${ep.count})`);
    }
    console.log('');
  }

  // Cleanup
  await browser.close();
  console.log('Browser closed. Discovery complete.');
  console.log(`Reports saved to: ${REPORT_DIR}/`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
