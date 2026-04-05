/**
 * Base Scraper Abstract Class
 * Provides common functionality for all scrapers:
 * - Browser pool management (Playwright)
 * - Rate limiting
 * - Circuit breaker pattern
 * - Exponential backoff retry
 * - Session rotation
 * - Fingerprint randomization
 * - CAPTCHA detection
 * - Logging
 */

import {
  chromium,
  Browser,
  Page,
  BrowserContext,
  PuppeteerLaunchOptions,
} from 'playwright';
import logger from '../utils/logger';
import {
  IScraper,
  JobSource,
  ScraperConfig,
  ScraperQuery,
  RawJob,
  HealthCheckResult,
  ScraperStats,
  ScraperSession,
  USER_AGENTS,
  VIEWPORT_SIZES,
  TIMEZONES,
} from './types';

interface BrowserPoolItem {
  browser: Browser;
  inUse: boolean;
  createdAt: Date;
}

export abstract class BaseScraper implements IScraper {
  abstract name: string;
  abstract source: JobSource;
  config: ScraperConfig;

  // Browser pool management
  private browserPool: BrowserPoolItem[] = [];
  private maxPoolSize: number = 5;
  private poolLock: Promise<void> = Promise.resolve();

  // Rate limiting
  private lastRequestTime: number = 0;
  private requestCount: number = 0;
  private requestWindow: number = 3600000; // 1 hour

  // Circuit breaker
  private circuitBreakerOpen: boolean = false;
  private consecutiveFailures: number = 0;
  private failureThreshold: number = 5;
  private circuitBreakerResetTime: number = 3600000; // 1 hour
  private circuitBreakerOpenedAt?: number;

  // Session management
  private currentSession?: ScraperSession;
  private sessionRequestCount: number = 0;
  private maxRequestsPerSession: number = 100;

  // Statistics
  private stats = {
    totalJobsScrapped: 0,
    totalRequests: 0,
    totalErrors: 0,
    lastScrapeTime?: Date,
    responseTimes: [] as number[],
  };

  constructor(name: string, source: JobSource, config: ScraperConfig) {
    this.name = name;
    this.source = source;
    this.config = config;
  }

  /**
   * Initialize scraper by creating browser pool
   */
  async initialize(): Promise<void> {
    try {
      logger.info(`Initializing scraper: ${this.name}`);

      // Create initial browsers for pool
      const initialPoolSize = Math.max(2, Math.min(this.maxPoolSize, 3));
      for (let i = 0; i < initialPoolSize; i++) {
        await this.createBrowserInstance();
      }

      // Create initial session
      this.currentSession = this.createNewSession();

      logger.info(`Scraper initialized: ${this.name} with ${initialPoolSize} browser instances`);
    } catch (error) {
      logger.error(`Failed to initialize scraper ${this.name}:`, error);
      throw error;
    }
  }

  /**
   * Shutdown scraper and close all browsers
   */
  async shutdown(): Promise<void> {
    try {
      logger.info(`Shutting down scraper: ${this.name}`);

      for (const item of this.browserPool) {
        try {
          await item.browser.close();
        } catch (error) {
          logger.warn(`Error closing browser:`, error);
        }
      }

      this.browserPool = [];
      logger.info(`Scraper shutdown complete: ${this.name}`);
    } catch (error) {
      logger.error(`Error during shutdown of ${this.name}:`, error);
      throw error;
    }
  }

  /**
   * Main scraping method - subclasses implement specific logic
   */
  abstract scrape(query: ScraperQuery): Promise<RawJob[]>;

  /**
   * Health check - verify scraper connectivity
   */
  async healthCheck(): Promise<HealthCheckResult> {
    try {
      logger.info(`Health check: ${this.name}`);

      if (this.circuitBreakerOpen) {
        const timeSinceOpen = Date.now() - (this.circuitBreakerOpenedAt || 0);
        if (timeSinceOpen > this.circuitBreakerResetTime) {
          logger.info(`Circuit breaker reset: ${this.name}`);
          this.circuitBreakerOpen = false;
          this.consecutiveFailures = 0;
        } else {
          return {
            healthy: false,
            lastCheck: new Date(),
            message: 'Circuit breaker is open',
            circuitBreakerOpen: true,
            failureCount: this.consecutiveFailures,
          };
        }
      }

      const page = await this.getPage();
      try {
        await page.goto('about:blank', { waitUntil: 'load', timeout: 5000 });
        this.consecutiveFailures = 0;
        return {
          healthy: true,
          lastCheck: new Date(),
          message: 'Health check passed',
        };
      } finally {
        await this.releasePage(page);
      }
    } catch (error) {
      logger.error(`Health check failed for ${this.name}:`, error);
      this.handleFailure();
      return {
        healthy: false,
        lastCheck: new Date(),
        message: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
        circuitBreakerOpen: this.circuitBreakerOpen,
        failureCount: this.consecutiveFailures,
      };
    }
  }

  /**
   * Get scraper statistics
   */
  getStats(): ScraperStats {
    const avgResponseTime =
      this.stats.responseTimes.length > 0
        ? this.stats.responseTimes.reduce((a, b) => a + b, 0) / this.stats.responseTimes.length
        : 0;

    const successRate =
      this.stats.totalRequests > 0
        ? ((this.stats.totalRequests - this.stats.totalErrors) / this.stats.totalRequests) * 100
        : 100;

    return {
      name: this.name,
      source: this.source,
      totalJobsScrapped: this.stats.totalJobsScrapped,
      totalRequests: this.stats.totalRequests,
      totalErrors: this.stats.totalErrors,
      successRate,
      averageResponseTime: avgResponseTime,
      lastScrapeTime: this.stats.lastScrapeTime,
      circuitBreakerOpen: this.circuitBreakerOpen,
      failureCount: this.consecutiveFailures,
    };
  }

  /**
   * Get a page from the browser pool with rate limiting
   */
  protected async getPage(): Promise<Page> {
    // Check circuit breaker
    if (this.circuitBreakerOpen) {
      throw new Error('Circuit breaker is open');
    }

    // Check rate limit
    await this.checkRateLimit();

    // Rotate session if needed
    if (this.sessionRequestCount >= this.maxRequestsPerSession) {
      this.currentSession = this.createNewSession();
      this.sessionRequestCount = 0;
    }

    // Get page from pool
    const page = await this.getBrowserPage();
    this.sessionRequestCount++;
    this.requestCount++;

    return page;
  }

  /**
   * Release a page back to the browser pool
   */
  protected async releasePage(page: Page): Promise<void> {
    try {
      // Clear cookies/local storage if needed
      const context = page.context();
      await context.clearCookies();
    } catch (error) {
      logger.warn('Error clearing page context:', error);
    }
  }

  /**
   * Navigate with retry and exponential backoff
   */
  protected async navigateWithRetry(
    page: Page,
    url: string,
    maxRetries: number = this.config.retryAttempts
  ): Promise<void> {
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await page.goto(url, {
          waitUntil: 'networkidle',
          timeout: this.config.timeout || 30000,
        });

        const duration = Date.now() - startTime;
        this.stats.responseTimes.push(duration);
        this.stats.totalRequests++;

        logger.debug(`Navigation successful: ${url} (attempt ${attempt + 1})`);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxRetries) {
          const backoffMs = Math.pow(4, attempt) * 1000; // 1s, 4s, 16s, 64s
          logger.warn(
            `Navigation failed (${url}), retrying in ${backoffMs}ms: ${lastError.message}`
          );
          await this.delay(backoffMs);
        }
      }
    }

    this.stats.totalErrors++;
    this.handleFailure();
    throw lastError || new Error('Navigation failed after all retries');
  }

  /**
   * Wait for selector with retry
   */
  protected async waitForSelector(
    page: Page,
    selector: string,
    maxRetries: number = 3,
    timeoutMs: number = 5000
  ): Promise<void> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await page.waitForSelector(selector, { timeout: timeoutMs });
        return;
      } catch (error) {
        if (attempt < maxRetries) {
          logger.debug(`Selector not found (${selector}), retrying...`);
          await this.delay(500);
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * Extract text from element
   */
  protected async extractText(page: Page, selector: string): Promise<string> {
    try {
      const text = await page.$eval(selector, (el) => el.textContent || '');
      return text.trim();
    } catch (error) {
      logger.debug(`Could not extract text from ${selector}: ${error}`);
      return '';
    }
  }

  /**
   * Extract multiple elements
   */
  protected async extractElements(
    page: Page,
    selector: string
  ): Promise<Array<Record<string, string>>> {
    try {
      return await page.$$eval(selector, (elements) =>
        elements.map((el) => ({
          text: el.textContent?.trim() || '',
          html: el.innerHTML,
        }))
      );
    } catch (error) {
      logger.debug(`Could not extract elements from ${selector}: ${error}`);
      return [];
    }
  }

  /**
   * Dismiss cookie consent dialogs
   */
  protected async dismissCookieConsent(page: Page): Promise<void> {
    const selectors = [
      'button[onclick*="cookie"], button[aria-label*="cookie"]',
      '.cookie-banner button:first-child',
      '.cookie-consent button[data-dismiss]',
      'button:has-text("Accept")',
      'button:has-text("Decline")',
      'button:has-text("Reject")',
    ];

    for (const selector of selectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          await button.click({ timeout: 1000 });
          logger.debug('Cookie consent dismissed');
          return;
        }
      } catch (error) {
        // Try next selector
      }
    }
  }

  /**
   * Close pop-up dialogs
   */
  protected async closePopups(page: Page): Promise<void> {
    const selectors = [
      '[role="dialog"] button[aria-label="Close"]',
      '.modal button.close',
      '.popup button[onclick*="close"]',
      'button[aria-label*="close"]',
      'button[onclick*="closeModal"]',
    ];

    for (const selector of selectors) {
      try {
        await page.click(selector, { timeout: 1000 });
        logger.debug('Pop-up closed');
      } catch (error) {
        // Pop-up not found, continue
      }
    }
  }

  /**
   * Handle infinite scroll (lazy loading)
   */
  protected async scrollToLoadMore(
    page: Page,
    scrolls: number = 5,
    delayMs: number = 1000
  ): Promise<void> {
    for (let i = 0; i < scrolls; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });
      await this.delay(delayMs);
    }
  }

  /**
   * Check for CAPTCHA or challenges
   */
  protected async detectChallenge(page: Page): Promise<boolean> {
    const challengeSelectors = [
      'iframe[src*="recaptcha"]',
      'iframe[src*="hcaptcha"]',
      '.g-recaptcha',
      'div[class*="captcha"]',
      'div[class*="challenge"]',
      'div[class*="verification"]',
    ];

    for (const selector of challengeSelectors) {
      const found = await page.$(selector);
      if (found) {
        logger.warn(`CAPTCHA/Challenge detected with selector: ${selector}`);
        return true;
      }
    }

    return false;
  }

  /**
   * Private helper: create new browser instance
   */
  private async createBrowserInstance(): Promise<void> {
    try {
      const launchOptions: PuppeteerLaunchOptions = {
        headless: this.config.headless !== false,
        args: ['--disable-blink-features=AutomationControlled'],
      };

      if (this.config.proxy) {
        launchOptions.proxy = {
          server: this.config.proxy,
        };
      }

      const browser = await chromium.launch(launchOptions);
      this.browserPool.push({
        browser,
        inUse: false,
        createdAt: new Date(),
      });
    } catch (error) {
      logger.error('Error creating browser instance:', error);
      throw error;
    }
  }

  /**
   * Private helper: get page from pool
   */
  private async getBrowserPage(): Promise<Page> {
    // Try to get an available browser from pool
    let availableItem = this.browserPool.find((item) => !item.inUse);

    // If all busy and pool not full, create new browser
    if (!availableItem && this.browserPool.length < this.maxPoolSize) {
      await this.createBrowserInstance();
      availableItem = this.browserPool[this.browserPool.length - 1];
    }

    // If still no available browser, wait for one
    if (!availableItem) {
      await this.delay(1000);
      return this.getBrowserPage();
    }

    availableItem.inUse = true;

    try {
      // Create new context with fingerprinting
      const context = await availableItem.browser.newContext({
        userAgent: this.currentSession?.userAgent || USER_AGENTS[0],
        viewport: this.currentSession?.viewport || VIEWPORT_SIZES[0],
        locale: this.currentSession?.locale || 'en-US',
        timezoneId: this.currentSession?.timezone || 'UTC',
        acceptLanguage: this.currentSession?.acceptLanguage || 'en-US,en;q=0.9',
      });

      const page = await context.newPage();

      // Store context in page for cleanup
      (page as any).__context = context;

      return page;
    } finally {
      availableItem.inUse = false;
    }
  }

  /**
   * Private helper: check rate limit
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    // Reset request count if window has passed
    if (timeSinceLastRequest > this.requestWindow) {
      this.requestCount = 0;
    }

    this.lastRequestTime = now;

    // Calculate max requests per second based on rate limit
    const maxRequestsPerSecond = this.config.rateLimit / 3600;
    const minDelayMs = 1000 / maxRequestsPerSecond;

    // If we've made requests recently, apply delay
    if (this.requestCount > 0) {
      await this.delay(minDelayMs);
    }
  }

  /**
   * Private helper: handle failures for circuit breaker
   */
  private handleFailure(): void {
    this.consecutiveFailures++;

    if (this.consecutiveFailures >= this.failureThreshold) {
      logger.error(`Circuit breaker opened for ${this.name} after ${this.consecutiveFailures} failures`);
      this.circuitBreakerOpen = true;
      this.circuitBreakerOpenedAt = Date.now();
    }
  }

  /**
   * Private helper: create new session with random fingerprint
   */
  private createNewSession(): ScraperSession {
    const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const viewport = VIEWPORT_SIZES[Math.floor(Math.random() * VIEWPORT_SIZES.length)];
    const timezone = TIMEZONES[Math.floor(Math.random() * TIMEZONES.length)];

    return {
      sessionId: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userAgent,
      viewport,
      timezone,
      locale: 'en-US',
      acceptLanguage: 'en-US,en;q=0.9',
      createdAt: new Date(),
      requestCount: 0,
    };
  }

  /**
   * Private helper: delay function
   */
  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
