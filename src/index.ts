import { type Options as PugOptions, render } from 'pug';
import { dirname, extname, relative, resolve } from 'path';
import fs from 'fs';
import {
  type Plugin,
  type ResolvedConfig,
  type ViteDevServer,
  type HmrContext,
  type Connect,
  type Logger,
  normalizePath,
  type Alias,
} from 'vite';
import type { ServerResponse } from 'http';
import { parse } from 'node-html-parser';
import pc from 'picocolors';

const { cyan, red, green } = pc;

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
  let logger: Logger;
  let viteAliases: Alias[] = [];

  const pugAliasResolver = (
    filename: string,
    source: string | undefined,
    pugOptions: PugOptions,
  ): string | null => {
    for (const alias of viteAliases) {
      const find =
        typeof alias.find === 'string' ? new RegExp(`^${alias.find}`) : alias.find;
      if (find.test(filename)) {
        const aliasedPath = filename.replace(find, alias.replacement);
        filename = aliasedPath;
        break;
      }
    }

    const base = source ? dirname(source) : pugOptions.basedir;
    if (!base) {
      return filename;
    }

    const resolvedPath = resolve(base, filename);
    if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
      return resolvedPath;
    }

    if (extname(resolvedPath) !== '.pug' && fs.existsSync(resolvedPath + '.pug')) {
      return resolvedPath + '.pug';
    }
    return resolvedPath;
  };

  return {
    name: 'vite-convert-pug-in-html',

    configResolved(resolvedConfig: ResolvedConfig) {
      viteRoot = resolvedConfig.root;
      logger = resolvedConfig.logger;
      viteAliases = resolvedConfig.resolve?.alias ?? [];
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
            filename: absolutePath,
            pretty: true,
            basedir: viteRoot,
            ...options.pugOptions,
            plugins: [{ resolve: pugAliasResolver }],
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
            plugins: [{ resolve: pugAliasResolver }],
          });

          return {
            code: `export default ${JSON.stringify(html)}`,
            map: null,
          };
        } catch (e) {
          const error = e as Error;
          logger.error(`${red('Pug Error in ' + id)}`, {
            timestamp: true,
            error: error,
          });
          this.error(error);
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
            plugins: [{ resolve: pugAliasResolver }],
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
          server.config.logger.error(
            `${cyan('[vite-convert-pug-in-html]')}: ${red(
              'Error rendering ' + finalPugPath + '\n' + error,
            )}`,
          );
          next(error);
        }
      };

      server.middlewares.use(handlePugRequest);
    },

    handleHotUpdate({ file, server }: HmrContext): void {
      if (file.endsWith('.pug')) {
        const relativePath = normalizePath(relative(viteRoot, file));
        server.config.logger.info(
          `${cyan('[vite-convert-pug-in-html]')}: Update ${green(relativePath)}`,
        );
        server.ws.send({
          type: 'full-reload',
          path: '*',
        });
      }
    },
  };
}
