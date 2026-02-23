import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { config } from '../config';

/**
 * Manages the Playwright browser lifecycle:
 * - Launches headed/headless browser
 * - Saves and restores authenticated session state
 * - Provides pages for extraction work
 * - Handles crash recovery
 */
export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  async launch(): Promise<void> {
    console.log(`[browser] Launching ${config.browser.headless ? 'headless' : 'headed'} browser...`);

    this.browser = await chromium.launch({
      headless: config.browser.headless,
      args: config.browser.headless ? [] : ['--start-maximized'],
    });

    // Try restoring saved session
    const restored = await this.restoreSession();
    if (!restored) {
      this.context = await this.browser.newContext({ viewport: null });
    }

    console.log(`[browser] Browser launched, session ${restored ? 'restored' : 'new'}`);
  }

  async saveSession(): Promise<void> {
    if (!this.context) return;

    const sessionDir = path.dirname(config.browser.sessionPath);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const state = await this.context.storageState();
    fs.writeFileSync(config.browser.sessionPath, JSON.stringify(state, null, 2));
  }

  private async restoreSession(): Promise<boolean> {
    if (!this.browser || !fs.existsSync(config.browser.sessionPath)) {
      return false;
    }

    try {
      const state = JSON.parse(fs.readFileSync(config.browser.sessionPath, 'utf-8'));
      this.context = await this.browser.newContext({
        storageState: state,
        viewport: null,
      });
      return true;
    } catch (err) {
      console.error('[browser] Failed to restore session:', err instanceof Error ? err.message : err);
      return false;
    }
  }

  /** Get a fresh page for extraction work */
  async newPage(): Promise<Page> {
    if (!this.context) throw new Error('Browser not launched');
    return this.context.newPage();
  }

  /** Check if the browser is still running */
  isConnected(): boolean {
    return this.browser?.isConnected() ?? false;
  }

  /** Get the browser context (for cookie access, etc.) */
  getContext(): BrowserContext | null {
    return this.context;
  }

  /** Attempt to recover from a crash */
  async recover(): Promise<void> {
    console.log('[browser] Attempting recovery...');
    await this.close();
    await this.launch();
  }

  async close(): Promise<void> {
    try {
      await this.saveSession();
    } catch {}
    try {
      await this.context?.close();
    } catch {}
    try {
      await this.browser?.close();
    } catch {}
    this.context = null;
    this.browser = null;
  }
}
