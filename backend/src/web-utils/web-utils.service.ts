import { Injectable } from '@nestjs/common';
import puppeteer, { Browser, Page } from 'puppeteer';
import * as cheerio from 'cheerio';
import { ElementType } from 'domelementtype';
import { EXCLUDED_CLASSES, EXCLUDED_TAGS } from './web-utils.constants';

@Injectable()
export class WebUtilsService {
  private readonly EXCLUDE_SELECTOR = [
    ...EXCLUDED_TAGS,
    ...EXCLUDED_CLASSES.map((cls) => `.${cls}`),
  ].join(',');

  private extractContentFromHtml(html: string): string {
    const $ = cheerio.load(html, { xmlMode: false });

    $(this.EXCLUDE_SELECTOR).remove();

    const metaDescription = this.cleanText(
      $('meta[name="description"]').attr('content') || '',
    );
    const ogDescription = this.cleanText(
      $('meta[property="og:description"]').attr('content') || '',
    );

    const contentBlocks: string[] = [];
    const processedTexts = new Set<string>();

    const containers = $('body')
      .find('*')
      .filter((_, el) => {
        const text = this.extractText($, el);
        return text.length > 5;
      });

    containers.each((_, element) => {
      const text = this.cleanText(this.extractText($, element));
      if (text && !processedTexts.has(text)) {
        processedTexts.add(text);
        contentBlocks.push(text);
      }
    });

    let content = contentBlocks.join('\n---\n').trim();
    if (!content) {
      content =
        metaDescription ||
        ogDescription ||
        this.cleanText(this.extractText($, $('body'))) ||
        '';
    }

    if (!content) {
      content = this.cleanText($('body').text()) || 'Content unavailable';
    }

    return content;
  }

  private async getRenderedHtml(
    url: string,
    retries: number = 2,
  ): Promise<string> {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
    ];

    for (let attempt = 1; attempt <= retries; attempt++) {
      let browser: Browser | undefined;
      let page: Page | undefined;
      try {
        browser = await puppeteer.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
          ],
        });
        page = await browser.newPage();

        const userAgent =
          userAgents[Math.floor(Math.random() * userAgents.length)];
        await page.setUserAgent(userAgent);

        await page.setExtraHTTPHeaders({
          'Accept-Language': 'en-US,en;q=0.9',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        });

        const response = await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        if (!response?.ok()) {
          throw new Error(`HTTP status: ${response?.status()}`);
        }

        await page
          .waitForSelector(
            'body > div, article, main, section, p, h1, h2, h3',
            {
              timeout: 3000,
            },
          )
          .catch(() => {});

        const html = await page.content();
        if (html.length < 100) {
          throw new Error('HTML too short');
        }
        return html;
      } catch (error) {
        if (attempt === retries) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          throw new Error(`Failed to render ${url}: ${errorMessage}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      } finally {
        if (page) await page.close();
        if (browser) {
          await browser.close();
        }
      }
    }
    throw new Error('Unexpected rendering error');
  }

  async getRenderedHtmlContent(url: string, maxSize?: number): Promise<string> {
    let decodedUrl = url;
    try {
      decodedUrl = decodeURIComponent(url);
    } catch {
      // Intentionally ignore malformed escape sequences.
    }

    const html = await this.getRenderedHtml(decodedUrl);
    if (maxSize && html.length > maxSize) {
      return html.slice(0, maxSize);
    }
    return html;
  }

  async getHtmlContent(url: string, maxSize?: number): Promise<string> {
    let decodedUrl = url;
    try {
      decodedUrl = decodeURIComponent(url);
    } catch {
      // Intentionally ignore malformed escape sequences.
    }

    // Many pages (including SearXNG) are fully server-rendered; fetching them
    // directly is faster and less likely to trigger bot protections than headless Chromium.
    // Also retry transient rate limits to avoid returning misleading empty results.
    const maxAttempts = 3;
    let lastStatus: number | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
          const response = await fetch(decodedUrl, {
            method: 'GET',
            headers: {
              Accept:
                'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              'User-Agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
            signal: controller.signal,
          });

          lastStatus = response.status;

          if (response.status === 429) {
            const retryAfterHeader = response.headers.get('retry-after');
            const retryAfterSeconds = retryAfterHeader
              ? Number.parseInt(retryAfterHeader, 10)
              : NaN;
            const delayMs = Number.isFinite(retryAfterSeconds)
              ? Math.max(0, retryAfterSeconds) * 1000
              : 1200 * attempt;

            if (attempt < maxAttempts) {
              await new Promise((resolve) => setTimeout(resolve, delayMs));
              continue;
            }

            throw new Error('Rate limited (HTTP 429)');
          }

          if (response.ok) {
            const text = await response.text();
            if (text && text.length >= 100) {
              if (maxSize && text.length > maxSize)
                return text.slice(0, maxSize);
              return text;
            }
          }
        } finally {
          clearTimeout(timeout);
        }
      } catch (error) {
        if (attempt === maxAttempts && lastStatus === 429) {
          const message =
            error instanceof Error ? error.message : 'Rate limited (HTTP 429)';
          throw new Error(`Failed to fetch HTML: ${message}`);
        }
        // Fall through to retry or to Puppeteer fallback.
      }
    }

    return this.getRenderedHtmlContent(decodedUrl, maxSize);
  }

  async getHtmlContentFetchOnly(
    url: string,
    options?: {
      maxSize?: number;
      timeoutMs?: number;
      maxAttempts?: number;
    },
  ): Promise<string> {
    let decodedUrl = url;
    try {
      decodedUrl = decodeURIComponent(url);
    } catch {
      // Intentionally ignore malformed escape sequences.
    }

    const maxAttempts = Math.max(1, options?.maxAttempts ?? 1);
    const timeoutMs = Math.max(1000, options?.timeoutMs ?? 8000);
    let lastStatus: number | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(decodedUrl, {
          method: 'GET',
          headers: {
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          signal: controller.signal,
        });

        lastStatus = response.status;
        if (!response.ok) {
          if (response.status === 429 && attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
            continue;
          }
          break;
        }

        const text = await response.text();
        if (!text || text.length < 100) break;

        const maxSize = options?.maxSize;
        if (maxSize && text.length > maxSize) return text.slice(0, maxSize);
        return text;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new Error(
      `Failed to fetch HTML (status ${lastStatus ?? 'unknown'})`,
    );
  }

  private extractText($: cheerio.CheerioAPI, element: any): string {
    const blockElements = [
      'section',
      'article',
      'main',
      'h1',
      'h2',
      'h3',
      'ul',
      'ol',
      'a',
    ];
    let text = '';

    $(element)
      .contents()
      .each((_, node) => {
        if (node.type === ElementType.Text) {
          const nodeText = (node.data || '').trim();
          if (nodeText) {
            text += nodeText + ' ';
          }
        } else if (node.type === ElementType.Tag) {
          const childText = this.extractText($, node);
          const dataValue = $(node).attr('data-value') || '';
          const dataTooltip = $(node).attr('data-tooltip') || '';
          const combinedText = [childText, dataValue, dataTooltip]
            .filter(Boolean)
            .join(' ');

          if (combinedText) {
            if (blockElements.includes(node.name)) {
              text += `\n${combinedText}\n`;
            } else {
              text += combinedText + ' ';
            }
          }
        }
      });

    return text.trim();
  }

  public cleanText(text: string): string {
    if (!text) return '';
    return text
      .replace(/\s+/g, ' ')
      .replace(/[\r\n]+/g, '\n')
      .replace(/,([^\s])/g, ', $1')
      .replace(/(\d)([^\d\s])/g, '$1 $2')
      .trim();
  }

  async parseHtmlContent(url: string, maxSize: number): Promise<string> {
    try {
      // Fetch-first is significantly faster than running headless Chromium.
      // Use Puppeteer only as a fallback for JS-heavy or bot-protected pages.
      let html = '';
      try {
        html = await this.getHtmlContent(url);
      } catch {
        html = '';
      }

      let content = html ? this.extractContentFromHtml(html) : '';

      // If the fetch-first HTML is not useful (e.g. JS app shell), fallback to rendering.
      if (!content || content === 'Content unavailable' || content.length < 80) {
        try {
          const rendered = await this.getRenderedHtmlContent(url);
          const renderedContent = this.extractContentFromHtml(rendered);
          if (renderedContent && renderedContent.length > content.length) {
            content = renderedContent;
          }
        } catch {
          // keep best-effort content from fetch-first
        }
      }

      if (content.length > maxSize) {
        content = content.slice(0, maxSize);
        const lastSpace = content.lastIndexOf(' ');
        if (lastSpace > maxSize * 0.8) {
          content = content.slice(0, lastSpace) + '...';
        }
      }

      return content;
    } catch {
      return 'Content unavailable';
    }
  }

  async parseHtmlContentFast(url: string, maxSize: number): Promise<string> {
    try {
      const html = await this.getHtmlContentFetchOnly(url, {
        timeoutMs: 8000,
        maxAttempts: 1,
      });

      let content = this.extractContentFromHtml(html);
      if (!content) content = 'Content unavailable';

      if (content.length > maxSize) {
        content = content.slice(0, maxSize);
        const lastSpace = content.lastIndexOf(' ');
        if (lastSpace > maxSize * 0.8) {
          content = content.slice(0, lastSpace) + '...';
        }
      }

      return content;
    } catch {
      return 'Content unavailable';
    }
  }
}
