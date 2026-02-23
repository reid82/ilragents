import type { BrowserManager } from './manager';
import { config } from '../config';

export type SessionStatus = 'active' | 'expired' | 'unknown';

/**
 * Manages HPF session health:
 * - Validates auth via API call (GET /app/api/user/getStatus)
 * - Refreshes tokens via /auth/api/refresh
 * - Runs periodic keep-alive pings
 * - Tracks session status
 */
export class SessionManager {
  private status: SessionStatus = 'unknown';
  private lastValidation = 0;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private browserManager: BrowserManager) {}

  getStatus(): SessionStatus {
    return this.status;
  }

  /** Validate that the session is still authenticated */
  async validate(): Promise<boolean> {
    const now = Date.now();
    // Don't validate more than once per 30 seconds
    if (now - this.lastValidation < 30_000 && this.status === 'active') {
      return true;
    }

    try {
      // Try API-based validation first (faster, no page navigation)
      const apiValid = await this.validateViaApi();
      if (apiValid) {
        this.status = 'active';
        this.lastValidation = now;
        return true;
      }

      // API check returned 401 - try refreshing the token
      const refreshed = await this.refreshToken();
      if (refreshed) {
        // Re-check after refresh
        const recheckValid = await this.validateViaApi();
        if (recheckValid) {
          this.status = 'active';
          this.lastValidation = now;
          return true;
        }
      }

      // Fallback: page-based validation
      const pageValid = await this.validateViaPage();
      if (pageValid) {
        this.status = 'active';
        this.lastValidation = now;
        return true;
      }

      // Session is dead - try auto-login if credentials are configured
      if (config.hpf.email && config.hpf.password) {
        console.log('[session] Session expired, attempting auto-login...');
        const loggedIn = await this.autoLogin();
        if (loggedIn) {
          this.status = 'active';
          this.lastValidation = now;
          return true;
        }
      }

      this.status = 'expired';
      this.lastValidation = now;
      console.warn('[session] Session expired - no valid credentials for auto-login');
      return false;
    } catch (err) {
      console.error('[session] Validation failed:', err instanceof Error ? err.message : err);
      this.status = 'unknown';
      return false;
    }
  }

  /** Validate via direct API call -- avoids browser navigation */
  private async validateViaApi(): Promise<boolean> {
    const context = this.browserManager.getContext();
    if (!context) return false;

    const cookies = await context.cookies('https://app.hotpropertyfinder.ai');
    const hpfCookies = cookies.filter(c => c.domain.includes('hotpropertyfinder.ai'));
    if (hpfCookies.length === 0) return false;

    const cookieHeader = hpfCookies.map(c => `${c.name}=${c.value}`).join('; ');

    try {
      const response = await fetch(`${config.hpf.apiBase}/app/api/user/getStatus`, {
        headers: {
          'accept': 'application/json',
          'cookie': cookieHeader,
          'use-cache': 'true',
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (response.status !== 200) return false;
      // Verify the response contains actual user data (not a guest/empty response)
      const data = await response.json().catch(() => null);
      return !!(data && typeof data === 'object' && ('email' in data || 'user' in data || 'id' in data));
    } catch {
      return false;
    }
  }

  /** Call HPF's token refresh endpoint */
  private async refreshToken(): Promise<boolean> {
    const context = this.browserManager.getContext();
    if (!context) return false;

    const cookies = await context.cookies('https://app.hotpropertyfinder.ai');
    const hpfCookies = cookies.filter(c => c.domain.includes('hotpropertyfinder.ai'));
    if (hpfCookies.length === 0) return false;

    const cookieHeader = hpfCookies.map(c => `${c.name}=${c.value}`).join('; ');

    try {
      const response = await fetch(`${config.hpf.apiBase}/auth/api/refresh`, {
        headers: {
          'accept': 'application/json',
          'cookie': cookieHeader,
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) {
        // The refresh endpoint sets new cookies via Set-Cookie headers.
        // We need to apply these to the browser context.
        const setCookieHeaders = response.headers.getSetCookie?.() || [];
        for (const setCookie of setCookieHeaders) {
          const parsed = parseSetCookie(setCookie);
          if (parsed) {
            await context.addCookies([{
              name: parsed.name,
              value: parsed.value,
              domain: parsed.domain || '.app.hotpropertyfinder.ai',
              path: parsed.path || '/',
              httpOnly: parsed.httpOnly,
              secure: parsed.secure,
              sameSite: (parsed.sameSite as 'Lax' | 'Strict' | 'None') || 'Lax',
            }]);
          }
        }

        // Save updated session to disk
        await this.browserManager.saveSession();
        console.log('[session] Token refreshed successfully');
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /** Fallback: page-based validation */
  private async validateViaPage(): Promise<boolean> {
    const page = await this.browserManager.newPage();
    try {
      const response = await page.goto(`${config.hpf.apiBase}/app/`, {
        waitUntil: 'domcontentloaded',
        timeout: 15_000,
      });

      // Wait for any client-side redirects to settle
      await page.waitForTimeout(2000);

      const url = page.url();
      return !url.includes('login') && !url.includes('signin') && !url.includes('/auth/');
    } catch {
      return false;
    } finally {
      await page.close();
    }
  }

  /** Automate HPF login via Playwright */
  private async autoLogin(): Promise<boolean> {
    const page = await this.browserManager.newPage();
    try {
      console.log(`[session] Navigating to ${config.hpf.loginUrl}`);
      await page.goto(config.hpf.loginUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

      // Wait for the login form to appear
      await page.waitForSelector('input[type="email"], input[name="email"], input[placeholder*="email" i]', { timeout: 10_000 });

      // Fill email
      const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
      await emailInput.fill(config.hpf.email);

      // Fill password
      const passwordInput = page.locator('input[type="password"]').first();
      await passwordInput.fill(config.hpf.password);

      // Click submit button
      const submitButton = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Login")').first();
      await submitButton.click();

      // Wait for navigation away from login page
      await page.waitForURL((url) => !url.toString().includes('/auth/'), { timeout: 15_000 });

      console.log(`[session] Auto-login successful, landed on: ${page.url()}`);

      // Save the new session
      await this.browserManager.saveSession();
      return true;
    } catch (err) {
      console.error('[session] Auto-login failed:', err instanceof Error ? err.message : err);
      return false;
    } finally {
      await page.close();
    }
  }

  /** Start periodic keep-alive pings */
  startKeepAlive(): void {
    if (this.keepAliveTimer) return;

    this.keepAliveTimer = setInterval(async () => {
      try {
        console.log('[session] Keep-alive ping...');
        const valid = await this.validate();
        if (valid) {
          await this.browserManager.saveSession();
          console.log('[session] Keep-alive OK, session saved');
        } else {
          console.warn('[session] Keep-alive failed - session may have expired');
        }
      } catch (err) {
        console.error('[session] Keep-alive error:', err instanceof Error ? err.message : err);
      }
    }, config.browser.keepAliveIntervalMs);

    console.log(`[session] Keep-alive started (every ${config.browser.keepAliveIntervalMs / 60000} min)`);
  }

  stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }
}

/** Minimal Set-Cookie header parser */
function parseSetCookie(header: string): {
  name: string; value: string; domain?: string; path?: string;
  httpOnly: boolean; secure: boolean; sameSite?: string;
} | null {
  const parts = header.split(';').map(p => p.trim());
  if (parts.length === 0) return null;

  const [nameVal, ...attrs] = parts;
  const eqIdx = nameVal.indexOf('=');
  if (eqIdx < 0) return null;

  const result = {
    name: nameVal.slice(0, eqIdx),
    value: nameVal.slice(eqIdx + 1),
    httpOnly: false,
    secure: false,
  } as ReturnType<typeof parseSetCookie> & Record<string, unknown>;

  for (const attr of attrs) {
    const lower = attr.toLowerCase();
    if (lower === 'httponly') result!.httpOnly = true;
    else if (lower === 'secure') result!.secure = true;
    else if (lower.startsWith('domain=')) result!.domain = attr.slice(7);
    else if (lower.startsWith('path=')) result!.path = attr.slice(5);
    else if (lower.startsWith('samesite=')) result!.sameSite = attr.slice(9);
  }

  return result;
}
