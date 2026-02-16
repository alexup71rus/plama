import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { graphqlUploadExpress } from 'graphql-upload-ts';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { IncomingMessage, ServerResponse } from 'http';
import { SettingsService } from './settings/settings.service';
import { ensureDataDir } from './common/data-dir';

const OLLAMA_PROXY_FIRST_BYTE_TIMEOUT_MS = parseInt(
  process.env.OLLAMA_PROXY_FIRST_BYTE_TIMEOUT_MS ||
    process.env.OLLAMA_PROXY_TIMEOUT_MS ||
    '60000',
  10,
);

const OLLAMA_PROXY_TOTAL_TIMEOUT_MS = parseInt(
  process.env.OLLAMA_PROXY_TOTAL_TIMEOUT_MS ||
    process.env.OLLAMA_PROXY_TIMEOUT_MS ||
    '600000',
  10,
);

async function bootstrap() {
  const basePath = ensureDataDir();

  const nestApp = await NestFactory.create<NestExpressApplication>(AppModule);
  const settingsService = nestApp.get(SettingsService);

  const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3002')
    .split(',')
    .map((s) => s.trim());

  nestApp.use(
    '/api',
    async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      if (req.method === 'OPTIONS') {
        const origin =
          req.headers.origin && allowedOrigins.includes(req.headers.origin)
            ? req.headers.origin
            : allowedOrigins[0];
        res
          .writeHead(204, {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
            'Access-Control-Allow-Headers': '*',
          })
          .end();
        return;
      }

      const settingsEntity = await settingsService.getSettings();
      const ollamaUrl = settingsEntity.settings.ollamaURL;

      if (!ollamaUrl) {
        res.writeHead(400).end('Missing ollamaURL in settings');
        return;
      }

      try {
        new URL(ollamaUrl);
      } catch (err: any) {
        res.writeHead(400).end(`Invalid ollamaURL: ${err.message}`);
        return;
      }

      let activeProxyReq: any | null = null;
      let timeoutFired = false;

      let firstByteSeen = false;
      let totalTimer: NodeJS.Timeout | null = null;

      const firstByteTimer = setTimeout(() => {
        timeoutFired = true;
        try {
          if (!res.headersSent) {
            res
              .writeHead(504, {
                'Content-Type': 'text/plain; charset=utf-8',
              })
              .end(
                `Ollama proxy timeout (no response within ${OLLAMA_PROXY_FIRST_BYTE_TIMEOUT_MS}ms)`,
              );
          } else {
            res.end();
          }
        } catch {
          // ignore
        }

        try {
          activeProxyReq?.destroy?.(new Error('ETIMEDOUT'));
        } catch {
          // ignore
        }
      }, OLLAMA_PROXY_FIRST_BYTE_TIMEOUT_MS);

      const startTotalTimer = () => {
        if (totalTimer) return;
        totalTimer = setTimeout(() => {
          timeoutFired = true;
          try {
            if (!res.headersSent) {
              res
                .writeHead(504, {
                  'Content-Type': 'text/plain; charset=utf-8',
                })
                .end(
                  `Ollama proxy timeout (${OLLAMA_PROXY_TOTAL_TIMEOUT_MS}ms)`,
                );
            } else {
              res.end();
            }
          } catch {
            // ignore
          }

          try {
            activeProxyReq?.destroy?.(new Error('ETIMEDOUT'));
          } catch {
            // ignore
          }
        }, OLLAMA_PROXY_TOTAL_TIMEOUT_MS);
      };

      const clearTimers = () => {
        clearTimeout(firstByteTimer);
        if (totalTimer) clearTimeout(totalTimer);
      };
      res.once('close', clearTimers);
      res.once('finish', clearTimers);

      const proxy = createProxyMiddleware({
        target: ollamaUrl,
        changeOrigin: true,
        timeout: OLLAMA_PROXY_TOTAL_TIMEOUT_MS,
        proxyTimeout: OLLAMA_PROXY_TOTAL_TIMEOUT_MS,
        pathRewrite: (path) => `/api${path.replace(/^\/api/, '')}`,
        on: {
          proxyReq: (proxyReq) => {
            activeProxyReq = proxyReq;
            try {
              proxyReq.setTimeout(OLLAMA_PROXY_TOTAL_TIMEOUT_MS);
              proxyReq.on('timeout', () => {
                proxyReq.destroy(new Error('ETIMEDOUT'));
              });
            } catch {
              // ignore
            }
          },
          proxyRes: (proxyRes, req) => {
            // As soon as the upstream starts streaming bytes, we can stop the first-byte timer
            // and rely on the total timeout.
            if (!firstByteSeen) {
              proxyRes.once('data', () => {
                firstByteSeen = true;
                clearTimeout(firstByteTimer);
                startTotalTimer();
              });

              // If for some reason we only get an immediate end without data, still start total timer.
              proxyRes.once('end', () => {
                if (!firstByteSeen) {
                  firstByteSeen = true;
                  clearTimeout(firstByteTimer);
                  startTotalTimer();
                }
              });
            }

            const origin =
              req.headers.origin && allowedOrigins.includes(req.headers.origin)
                ? req.headers.origin
                : allowedOrigins[0];
            proxyRes.headers['Access-Control-Allow-Origin'] = origin;
            proxyRes.headers['Access-Control-Allow-Methods'] =
              'GET, POST, OPTIONS, PUT, DELETE';
            proxyRes.headers['Access-Control-Allow-Headers'] = '*';
            delete proxyRes.headers['access-control-allow-origin'];
          },
          error: (err, _req, res) => {
            // http-proxy-middleware types allow `res` to be ServerResponse | Socket
            // (e.g., during certain low-level proxy errors).
            if (!res || typeof (res as any).writeHead !== 'function') {
              try {
                (res as any)?.destroy?.();
              } catch {
                // ignore
              }
              return;
            }

            const serverRes = res as ServerResponse;

            if (serverRes.headersSent) {
              serverRes.end();
              return;
            }

            const code = (err as any)?.code as string | undefined;
            const status =
              code === 'ETIMEDOUT' || code === 'ECONNREFUSED' ? 504 : 502;
            const message =
              status === 504
                ? `Ollama proxy timeout`
                : 'Ollama proxy error';

            serverRes
              .writeHead(status, {
                'Content-Type': 'text/plain; charset=utf-8',
              })
              .end(message);
          },
        },
      });

      if (timeoutFired) {
        clearTimers();
        return;
      }
      proxy(req, res, next);
    },
  );

  nestApp.use(
    graphqlUploadExpress({ maxFileSize: 50 * 1024 * 1024, maxFiles: 10 }),
  );
  nestApp.useStaticAssets(join(basePath, 'Uploads'), { prefix: '/uploads' });
  nestApp.enableCors({ origin: allowedOrigins });

  const port = parseInt(process.env.PORT || '3001', 10);
  await nestApp.listen(port);
}

bootstrap();
