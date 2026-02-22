import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock playwright-core before imports
const mockNewPage = vi.fn();
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockGoto = vi.fn();
const mockEvaluate = vi.fn();
const mockWaitForSelector = vi.fn();
const mockContent = vi.fn();

vi.mock('playwright-core', () => ({
  chromium: {
    connectOverCDP: vi.fn().mockResolvedValue({
      newPage: mockNewPage.mockResolvedValue({
        goto: mockGoto.mockResolvedValue(null),
        evaluate: mockEvaluate,
        waitForSelector: mockWaitForSelector.mockResolvedValue(null),
        content: mockContent.mockResolvedValue('<html></html>'),
        close: vi.fn(),
      }),
      close: mockClose,
    }),
  },
}));

import { scrapeWithBrightData } from './bright-data-scraper';

describe('scrapeWithBrightData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('BRIGHT_DATA_BROWSER_WS', 'wss://brd-customer-test:pass@brd.superproxy.io:9222');
  });

  it('returns null when BRIGHT_DATA_BROWSER_WS not configured', async () => {
    vi.stubEnv('BRIGHT_DATA_BROWSER_WS', '');
    const result = await scrapeWithBrightData('https://example.com', async () => ({}));
    expect(result).toBeNull();
  });

  it('connects via CDP and runs extractor', async () => {
    const extractedData = { bedrooms: 3, price: '$650,000' };
    const extractor = vi.fn().mockResolvedValue(extractedData);

    const result = await scrapeWithBrightData(
      'https://www.onthehouse.com.au/property/vic/cowes-3922/test',
      extractor,
    );

    expect(result).toEqual(extractedData);
    expect(mockGoto).toHaveBeenCalledWith(
      'https://www.onthehouse.com.au/property/vic/cowes-3922/test',
      expect.objectContaining({ waitUntil: 'domcontentloaded' }),
    );
    expect(extractor).toHaveBeenCalled();
  });

  it('closes browser on success', async () => {
    const extractor = vi.fn().mockResolvedValue({});
    await scrapeWithBrightData('https://example.com', extractor);
    expect(mockClose).toHaveBeenCalled();
  });

  it('closes browser on error and returns null', async () => {
    const extractor = vi.fn().mockRejectedValue(new Error('Parse error'));
    const result = await scrapeWithBrightData('https://example.com', extractor);
    expect(result).toBeNull();
    expect(mockClose).toHaveBeenCalled();
  });
});
