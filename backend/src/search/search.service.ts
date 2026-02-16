import { Injectable, Logger } from '@nestjs/common';
import { URL } from 'url';
import * as cheerio from 'cheerio';
import { WebUtilsService } from '../web-utils/web-utils.service';
import {
  MAX_HTML_SIZE,
  MAX_QUERY_LENGTH,
  MAX_URL_LENGTH,
  SEARXNG_TIMEOUT_MS,
} from '../common/constants';

export interface SearchResultItem {
  title: string;
  url: string;
  description: string;
  content?: string;
}

interface SearxngJsonResponse {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    snippet?: string;
  }>;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  private truncateText(value: string, maxChars: number): string {
    if (!value) return '';
    if (!Number.isFinite(maxChars) || maxChars <= 0) return '';
    if (value.length <= maxChars) return value;
    if (maxChars <= 1) return value.slice(0, maxChars);
    return value.slice(0, maxChars - 1) + '…';
  }

  private compactResults(
    items: SearchResultItem[],
    options: {
      maxTitleChars: number;
      maxUrlChars: number;
      maxDescriptionChars: number;
      maxContentChars: number;
      includeContent: boolean;
    },
  ): SearchResultItem[] {
    return items.map((item) => {
      const title = this.truncateText(item.title || 'No title', options.maxTitleChars);
      const url = this.truncateText(item.url || 'No URL', options.maxUrlChars);
      const description = this.truncateText(
        item.description || 'No description',
        options.maxDescriptionChars,
      );

      const content = options.includeContent
        ? this.truncateText(
            item.content || 'Content not retrieved',
            options.maxContentChars,
          )
        : undefined;

      return { title, url, description, content };
    });
  }

  private enforceJsonBudget(
    items: SearchResultItem[],
    budgetChars: number,
  ): SearchResultItem[] {
    if (!Number.isFinite(budgetChars) || budgetChars <= 0) return [];

    const base = items.map((x) => ({ ...x }));
    const toJsonSize = (arr: SearchResultItem[]) => JSON.stringify(arr).length;

    let size = toJsonSize(base);
    if (size <= budgetChars) return base;

    // Iteratively shrink content first, then description, until within budget.
    let contentCap = Math.max(
      ...base.map((x) => (x.content ? x.content.length : 0)),
      0,
    );
    let descCap = Math.max(...base.map((x) => x.description.length), 0);

    const minContentCap = 200;
    const minDescCap = 120;

    for (let i = 0; i < 8 && size > budgetChars; i++) {
      contentCap = Math.max(minContentCap, Math.floor(contentCap * 0.6));
      descCap = Math.max(minDescCap, Math.floor(descCap * 0.8));

      for (const item of base) {
        if (item.content) item.content = this.truncateText(item.content, contentCap);
        item.description = this.truncateText(item.description, descCap);
      }

      size = toJsonSize(base);
    }

    return base;
  }

  private async fetchSearxngHtml(
    url: string,
    acceptLanguage?: string,
  ): Promise<string> {
    const maxAttempts = 3;
    let lastStatus: number | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            ...(acceptLanguage ? { 'Accept-Language': acceptLanguage } : {}),
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          signal: controller.signal,
        });

        lastStatus = response.status;

        if (response.status === 429) {
          if (attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
            continue;
          }
          throw new Error('Rate limited (HTTP 429)');
        }

        if (!response.ok) {
          throw new Error(`SearXNG HTML request failed (${response.status})`);
        }

        const text = await response.text();
        if (!text || text.length < 200) {
          throw new Error('SearXNG HTML response too short');
        }
        return text;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new Error(
      `SearXNG HTML request failed (status ${lastStatus ?? 'unknown'})`,
    );
  }

  private tokenizeQuery(query: string): string[] {
    const tokens = query
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .split(' ')
      .map((t) => t.trim())
      .filter((t) => t.length >= 2);

    const unique: string[] = [];
    const seen = new Set<string>();
    for (const token of tokens) {
      if (!seen.has(token)) {
        seen.add(token);
        unique.push(token);
      }
    }

    // Prevent pathological scoring costs on extremely long queries.
    return unique.slice(0, 12);
  }

  private scoreResult(
    item: SearchResultItem,
    tokens: string[],
    tokenWeights: Map<string, number>,
  ): number {
    const title = (item.title || '').toLowerCase();
    const description = (item.description || '').toLowerCase();
    const url = (item.url || '').toLowerCase();
    const content = (item.content || '').toLowerCase();

    let score = 0;
    let matched = 0;
    for (const token of tokens) {
      const w = tokenWeights.get(token) ?? 1;
      const inTitle = title.includes(token);
      const inDesc = description.includes(token);
      const inUrl = url.includes(token);
      const inContent = content.includes(token);

      if (inTitle || inDesc || inUrl || inContent) {
        matched += 1;
      }

      if (inTitle) score += 6 * w;
      if (inDesc) score += 3 * w;
      if (inUrl) score += 4 * w;
      if (inContent) score += 1 * w;
    }

    // Prefer results that match more distinct query tokens.
    score += matched * 2;

    // Prefer deeper URLs over homepages when token relevance is similar.
    try {
      const u = new URL(item.url);
      const path = u.pathname || '/';
      const depth = path.split('/').filter(Boolean).length;
      score += Math.min(6, depth);

      const looksLikeHomepage =
        (path === '/' || path === '') && (!u.search || u.search === '');
      if (looksLikeHomepage) score -= 5;
    } catch {
      // ignore
    }

    return score;
  }

  private rankAndTrim(
    items: SearchResultItem[],
    tokens: string[],
    limit: number,
  ): SearchResultItem[] {
    if (tokens.length === 0) return items.slice(0, limit);

    const tokenDocFreq = new Map<string, number>();
    for (const token of tokens) {
      tokenDocFreq.set(token, 0);
    }

    for (const item of items) {
      const haystack = `${item.title || ''} ${item.description || ''} ${item.url || ''} ${item.content || ''}`.toLowerCase();
      for (const token of tokens) {
        if (haystack.includes(token)) {
          tokenDocFreq.set(token, (tokenDocFreq.get(token) ?? 0) + 1);
        }
      }
    }

    const n = Math.max(1, items.length);
    const tokenWeights = new Map<string, number>();
    for (const token of tokens) {
      const df = tokenDocFreq.get(token) ?? 0;
      // IDF-like weight: rare tokens in this specific result set become more important.
      const idf = Math.log((n + 1) / (df + 1)) + 1;
      tokenWeights.set(token, idf);
    }

    const withScore = items
      .map((item) => ({ item, score: this.scoreResult(item, tokens, tokenWeights) }))
      .sort((a, b) => b.score - a.score);

    const top = withScore.map((x) => x.item);
    // If everything scored 0, keep original order.
    if (withScore.length > 0 && withScore[0].score === 0) {
      return items.slice(0, limit);
    }
    return top.slice(0, limit);
  }

  constructor(private readonly webUtilsService: WebUtilsService) {}

  async search(
    query: string,
    searxngUrl: string,
    format: 'json' | 'html',
    limit: number = 3,
    followLinks: boolean = false,
    acceptLanguage?: string,
  ): Promise<string> {
    try {
      let cleanQuery = query;
      try {
        cleanQuery = decodeURIComponent(query);
      } catch {
        // Intentionally ignore malformed escape sequences.
      }

      if (cleanQuery.length > MAX_QUERY_LENGTH) {
        throw new Error(`Query exceeds ${MAX_QUERY_LENGTH} characters`);
      }
      if (!cleanQuery.trim()) {
        throw new Error('Query cannot be empty');
      }
      if (searxngUrl.length > MAX_URL_LENGTH) {
        throw new Error(`SearXNG URL exceeds ${MAX_URL_LENGTH} characters`);
      }
      if (!searxngUrl.includes('%s')) {
        throw new Error('SearXNG URL must contain %s placeholder');
      }
      if (
        !/^https?:\/\/[^\s/$.?#].[^\s]*$/.test(searxngUrl.replace('%s', ''))
      ) {
        throw new Error('Invalid SearXNG URL format');
      }
      if (!['json', 'html'].includes(format)) {
        throw new Error('Invalid format: must be "json" or "html"');
      }
      const validatedLimit = Math.max(1, Math.min(limit ?? 3, 100));
      const queryTokens = this.tokenizeQuery(cleanQuery);

      let baseUrl: string;
      try {
        baseUrl = new URL(searxngUrl.replace('%s', '')).href;
      } catch {
        throw new Error('Invalid base URL for link resolution');
      }

      let results: SearchResultItem[] = [];

      // Hard budget to avoid blowing up downstream LLM prompts.
      // Keep this conservative; UI can always fetch more via follow-up queries.
      const MAX_RESULTS_JSON_CHARS = Number.parseInt(
        process.env.SEARCH_RESULTS_MAX_CHARS || '8000',
        10,
      );
      const MAX_LINK_CONTENT_CHARS = Number.parseInt(
        process.env.SEARCH_LINK_CONTENT_MAX_CHARS || '900',
        10,
      );

      const rawSearchUrl = searxngUrl.replace('%s', encodeURIComponent(cleanQuery));
      const searchUrl = rawSearchUrl;

      if (format === 'json') {
        const searxngController = new AbortController();
        const searxngTimeout = setTimeout(() => {
          searxngController.abort();
        }, SEARXNG_TIMEOUT_MS);

        try {
          const response = await fetch(searchUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              ...(acceptLanguage ? { 'Accept-Language': acceptLanguage } : {}),
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            },
            signal: searxngController.signal,
          });

          if (!response.ok) {
            throw new Error(
              `SearXNG request failed, status: ${response.status}`,
            );
          }

          let data: SearxngJsonResponse;
          try {
            data = (await response.json()) as SearxngJsonResponse;
          } catch {
            throw new Error('Invalid JSON response from SearXNG');
          }
          if (!Array.isArray(data.results)) {
            data.results = [];
          }
          const extractionLimit = Math.min(validatedLimit * 6, 60);
          results = data.results.slice(0, extractionLimit).map((item) => ({
            title: item.title?.trim() || 'No title',
            url: item.url || 'No URL',
            description: this.webUtilsService.cleanText(
              item.content || item.snippet || 'No description',
            ),
          }));

          const preFollowLimit = followLinks
            ? Math.min(results.length, validatedLimit * 4)
            : validatedLimit;
          results = this.rankAndTrim(results, queryTokens, preFollowLimit);
        } finally {
          clearTimeout(searxngTimeout);
        }
      } else if (format === 'html') {
        const html = await this.fetchSearxngHtml(searchUrl, acceptLanguage);
        const $ = cheerio.load(html);

        const resultSelectors = [
          '#urls > .result',
          '#results .result',
          'article.result',
          '.results > .result',
          'main .result',
        ];

        const $resultNodes = $(resultSelectors.join(',')).filter((_, el) => {
          const href = $(el).find('a').first().attr('href') || '';
          const title = $(el).find('h3, .title, a').first().text().trim();
          return Boolean(href || title);
        });

        const extractionLimit = Math.min(validatedLimit * 6, 60);
        results = $resultNodes
          .slice(0, extractionLimit)
          .map((_, element) => {
            const $el = $(element);
            const title =
              $el.find('h3').first().text().trim() ||
              $el.find('.title').first().text().trim() ||
              $el.find('a').first().text().trim() ||
              'No title';

            const href = $el.find('a').first().attr('href') || '';
            const urlText = $el
              .find('.url, .result-url, cite')
              .first()
              .text()
              .trim();
            const url = href || urlText || 'No URL';

            const description = this.webUtilsService.cleanText(
              $el.find('.content, .description, p').first().text().trim() ||
                'No description',
            );

            return { title, url, description };
          })
          .get()
          .filter((item) => item.url !== 'No URL');

        const preFollowLimit = followLinks
          ? Math.min(results.length, validatedLimit * 4)
          : validatedLimit;
        results = this.rankAndTrim(results, queryTokens, preFollowLimit);

        // Fallback: some instances/themes may not match selectors, or may serve
        // anti-bot pages. If no results were extracted, try the JSON API.
        if (results.length === 0) {
          try {
            const jsonUrl = new URL(searchUrl);
            if (!jsonUrl.searchParams.get('format')) {
              jsonUrl.searchParams.set('format', 'json');
            }

            const response = await fetch(jsonUrl.href, {
              method: 'GET',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'User-Agent':
                  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              },
            });

            if (response.ok) {
              const data = (await response.json()) as SearxngJsonResponse;
              if (Array.isArray(data.results)) {
                const extractionLimit = Math.min(validatedLimit * 6, 60);
                results = data.results.slice(0, extractionLimit).map((item) => ({
                  title: item.title?.trim() || 'No title',
                  url: item.url || 'No URL',
                  description: this.webUtilsService.cleanText(
                    item.content || item.snippet || 'No description',
                  ),
                }));

                const preFollowLimit = followLinks
                  ? Math.min(results.length, validatedLimit * 4)
                  : validatedLimit;
                results = this.rankAndTrim(results, queryTokens, preFollowLimit);
              }
            }
          } catch {
            // Ignore fallback errors and keep empty results.
          }
        }
      }

      if (followLinks && results.length > 0) {
        const batchSize = 3;
        const processedResults: SearchResultItem[] = [];
        for (let i = 0; i < results.length; i += batchSize) {
          const batch = results.slice(i, i + batchSize);
          const batchResults = await Promise.all(
            batch.map(async (item) => {
              let absoluteUrl = item.url;
              try {
                absoluteUrl = decodeURIComponent(absoluteUrl);
                const urlObj = new URL(absoluteUrl, baseUrl);
                if (!['http:', 'https:'].includes(urlObj.protocol)) {
                  throw new Error('Unsupported protocol');
                }
                absoluteUrl = urlObj.href;
              } catch {
                return { ...item, content: 'Invalid URL' };
              }

              try {
                const content = await this.webUtilsService.parseHtmlContentFast(
                  absoluteUrl,
                  Math.min(MAX_HTML_SIZE, MAX_LINK_CONTENT_CHARS),
                );
                return { ...item, content };
              } catch (error) {
                const errorMessage =
                  error instanceof Error ? error.message : 'Unknown error';
                return {
                  ...item,
                  content: `Failed to load: ${errorMessage}`,
                };
              }
            }),
          );
          processedResults.push(...batchResults);
        }
        results = processedResults;

        // Re-rank after fetching page content.
        results = this.rankAndTrim(results, queryTokens, validatedLimit);
      }

      results = this.compactResults(results, {
        maxTitleChars: 160,
        maxUrlChars: 600,
        maxDescriptionChars: 360,
        maxContentChars: followLinks ? MAX_LINK_CONTENT_CHARS : 0,
        includeContent: Boolean(followLinks),
      });

      results = this.enforceJsonBudget(results, MAX_RESULTS_JSON_CHARS);

      return JSON.stringify(results);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Search error: ${errorMessage}`);
      return JSON.stringify({
        error: true,
        message: `Search failed: ${errorMessage}`,
        results: [],
      });
    }
  }
}
