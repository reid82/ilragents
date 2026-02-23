import type { BrowserManager } from './manager';
import { config } from '../config';

export type SessionStatus = 'active' | 'expired' | 'unknown';

/**
 * Manages HPF session health:
 * - Validates auth before requests
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
      const page = await this.browserManager.newPage();

      try {
        // Navigate to a known authenticated page and check if we get redirected to login
        await page.goto(config.hpf.baseUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 15_000,
        });

        const url = page.url();
        const isAuthenticated = !url.includes('login') && !url.includes('signin') && !url.includes('auth');

        this.status = isAuthenticated ? 'active' : 'expired';
        this.lastValidation = now;

        if (!isAuthenticated) {
          console.warn('[session] Session expired - HPF redirected to login page');
        }

        return isAuthenticated;
      } finally {
        await page.close();
      }
    } catch (err) {
      console.error('[session] Validation failed:', err instanceof Error ? err.message : err);
      this.status = 'unknown';
      return false;
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
