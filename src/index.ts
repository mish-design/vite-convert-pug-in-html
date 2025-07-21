import { type Options as PugOptions, render } from 'pug';
import { resolve } from 'path';
import fs from 'fs';
import type { Plugin, ResolvedConfig, ViteDevServer, HmrContext, Connect } from 'vite';
import type { ServerResponse } from 'http';
import { parse } from 'node-html-parser';

type Replacement = {
  css?: string;
  script?: string;
};

type PluginOptions = {
  pages: Record<string, string>;
  replacement?: Replacement;
  pugOptions?: PugOptions;
};

export function viteConvertPugInHtml(options: PluginOptions): Plugin {
  let viteRoot: string;

  return {
    name: 'vite-convert-pug-in-html',

    configResolved(resolvedConfig: ResolvedConfig) {
      viteRoot = resolvedConfig.root;
    },

    buildStart() {
      if (this.meta.watchMode) {
        return;
      }

      for (const [key, id] of Object.entries(options.pages)) {
        if (id.endsWith('.pug')) {
          const absolutePath = resolve(viteRoot, id);
          const source = fs.readFileSync(absolutePath, 'utf-8');
          const html = render(source, {
            filename: id,
            pretty: true,
            basedir: viteRoot,
            ...options.pugOptions
          });

          const root = parse(html);

          if (options.replacement && options.replacement.css) {
            const styleTag = root.querySelector('link[rel="stylesheet"]');
            styleTag?.setAttribute('href', options.replacement.css);
          }
          if (options.replacement && options.replacement.script) {
            const scriptTag = root.querySelector('script[src]');
            scriptTag?.setAttribute('src', options.replacement.script);
          }

          const finalHtml = root.toString();

          this.emitFile({
            type: 'asset',
            fileName: `${key}.html`,
            source: finalHtml,
          });
        }
      }
    },

    transform(code: string, id: string) {
      if (id.endsWith('.pug')) {
        try {
          const html = render(code, {
            filename: id,
            basedir: viteRoot,
          });

          return {
            code: `export default ${JSON.stringify(html)}`,
            map: null,
          };
        } catch (e) {
          console.error(`Pug Error in ${id}:\n`, e);
          this.error((e as Error).message);
        }
      }
      return null;
    },

    configureServer(server: ViteDevServer) {
      const handlePugRequest = async (
        req: Connect.IncomingMessage,
        res: ServerResponse,
        next: Connect.NextFunction,
      ): Promise<void> => {
        if (!req.url) {
          return next();
        }

        const originalUrl = req.url.split('?')[0];
        let searchUrl = originalUrl;

        if (!searchUrl.includes('.') && !searchUrl.endsWith('/')) {
          searchUrl += '.html';
        }
        if (searchUrl.endsWith('/')) {
          searchUrl += 'index.html';
        }
        if (!searchUrl.endsWith('.html')) {
          return next();
        }

        let finalPugPath: string;

        if (searchUrl === '/index.html') {
          finalPugPath = resolve(server.config.root, 'index.pug');
        } else {
          finalPugPath = resolve(
            server.config.root,
            'pages',
            searchUrl.slice(1).replace(/\.html$/, '.pug'),
          );
        }

        if (!fs.existsSync(finalPugPath)) {
          return next();
        }

        try {
          const pugContent = fs.readFileSync(finalPugPath, 'utf-8');
          const html = render(pugContent, {
            filename: finalPugPath,
            pretty: true,
            basedir: server.config.root,
          });

          const viteHtml = await server.transformIndexHtml(
            originalUrl,
            html,
            req.originalUrl,
          );

          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html');
          res.end(viteHtml);
        } catch (e: unknown) {
          const error = e as Error;
          server.ws.send({
            type: 'error',
            err: {
              message: error.message,
              stack: error.stack ?? '',
              id: finalPugPath,
            },
          });
          console.error(`[vite-pug-plugin] Error rendering ${finalPugPath}:\n`, error);
          next(error);
        }
      };

      server.middlewares.use(handlePugRequest);
    },

    handleHotUpdate(ctx: HmrContext): void {
      if (ctx.file.endsWith('.pug')) {
        console.log(
          `[vite-convert-pug-in-html]: Update ${ctx.file}`,
        );
        ctx.server.ws.send({
          type: 'full-reload',
          path: '*',
        });
      }
    },
  };
}
