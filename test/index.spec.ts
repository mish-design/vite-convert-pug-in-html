import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from 'vitest';
import type { Plugin, ViteDevServer, HmrContext } from 'vite';
import { viteConvertPugInHtml } from '../src';
import { resolve } from 'path';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import type { Connect } from 'vite';
import type { ServerResponse } from 'http';

const testProjectRoot = resolve(process.cwd(), '.vitest-project-root');

const filesContent = {
  'index.pug': `
doctype html
html
  head
    link(rel="stylesheet" href="/style.css")
  body
    h1 Main Page
    script(src="/main.js" type="module")
`,
  'pages/about.pug': `
doctype html
html
  head
    title About Us
  body
    h1 About Page
`,
  'pages/error.pug': `
doctype html
html
  body
    h1 This will fail..
    //- Невалидный синтаксис pug
    div(
`,
};

describe('viteConvertPugInHtml', () => {
  beforeAll(() => {
    if (existsSync(testProjectRoot)) {
      rmSync(testProjectRoot, { recursive: true, force: true });
    }
    mkdirSync(testProjectRoot, { recursive: true });
    mkdirSync(resolve(testProjectRoot, 'pages'), { recursive: true });
  });

  afterAll(() => {
    if (existsSync(testProjectRoot)) {
      rmSync(testProjectRoot, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    for (const [path, content] of Object.entries(filesContent)) {
      writeFileSync(resolve(testProjectRoot, path), content, 'utf-8');
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // --- ТЕСТЫ ДЛЯ СБОРКИ ---
  describe('buildStart hook (production build)', () => {
    it('should generate HTML files from pug entries', async () => {
      const mockRollupContext = { emitFile: vi.fn(), meta: { watchMode: false } };
      const plugin = viteConvertPugInHtml({
        pages: {
          index: 'index.pug',
          about: 'pages/about.pug',
        },
      });
      (plugin.configResolved as any)({ root: testProjectRoot });

      await (plugin.buildStart as any).call(mockRollupContext);

      expect(mockRollupContext.emitFile).toHaveBeenCalledTimes(2);
      expect(mockRollupContext.emitFile).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: 'index.html',
          source: expect.stringContaining('<h1>Main Page</h1>'),
        }),
      );
      expect(mockRollupContext.emitFile).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: 'about.html',
          source: expect.stringContaining('<h1>About Page</h1>'),
        }),
      );
    });

    it('should apply replacements for css and script tags', async () => {
      const mockRollupContext = { emitFile: vi.fn(), meta: { watchMode: false } };
      const plugin = viteConvertPugInHtml({
        pages: { index: 'index.pug' },
        replacement: { css: 'assets/main.css', script: 'assets/main.js' },
      });
      (plugin.configResolved as any)({ root: testProjectRoot });

      await (plugin.buildStart as any).call(mockRollupContext);

      const emittedFile = mockRollupContext.emitFile.mock.calls[0][0];
      expect(emittedFile.source).toContain('href="assets/main.css"');
      expect(emittedFile.source).toContain('src="assets/main.js"');
    });

    it('should do nothing in watch mode', async () => {
      const mockRollupContext = { emitFile: vi.fn(), meta: { watchMode: true } };
      const plugin = viteConvertPugInHtml({ pages: {} }) as Plugin;
      await (plugin.buildStart as any).call(mockRollupContext);
      expect(mockRollupContext.emitFile).not.toHaveBeenCalled();
    });
  });

  // --- ТЕСТЫ ДЛЯ ТРАНСФОРМАЦИИ ---
  describe('transform hook', () => {
    const mockTransformContext = { emitFile: vi.fn() };
    const plugin = viteConvertPugInHtml({ pages: {} });
    (plugin.configResolved as any)({ root: testProjectRoot });

    it('should transform .pug file to a string export', () => {
      const code = 'p Hello World';
      const id = resolve(testProjectRoot, 'test.pug');
      const transformHook = plugin.transform;
      let result: any;
      if (typeof transformHook === 'function') {
        result = transformHook.call(mockTransformContext, code, id);
      } else if (transformHook && 'handler' in transformHook) {
        result = transformHook.handler.call(mockTransformContext, code, id);
      }

      const expectedHtml = '<p>Hello World</p>';
      expect(result).not.toBeNull();
      expect(result.code).toBe(`export default ${JSON.stringify(expectedHtml)}`);
    });

    it('should return null for non-pug files', () => {
      const code = 'const a = 1;';
      const id = 'test.js';
      const transformHook = plugin.transform;
      let result: any;
      if (typeof transformHook === 'function') {
        result = transformHook.call(mockTransformContext, code, id);
      } else if (transformHook && 'handler' in transformHook) {
        result = transformHook.handler.call(mockTransformContext, code, id);
      }
      expect(result).toBeNull();
    });
  });

  // --- ТЕСТЫ ДЛЯ DEV-СЕРВЕРА ---
  describe('configureServer hook (dev server)', () => {
    let mockServer: ViteDevServer;
    let middleware: Connect.NextHandleFunction;

    beforeEach(() => {
      mockServer = {
        config: {
          root: testProjectRoot,
          logger: {
            error: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
          },
        },
        middlewares: { use: vi.fn((m) => (middleware = m)) },
        transformIndexHtml: vi.fn((_url, html) => Promise.resolve(html)),
        ws: {
          send: vi.fn(),
        },
      } as unknown as ViteDevServer;

      const plugin = viteConvertPugInHtml({ pages: {} }) as Plugin;
      const configureServerHook = plugin.configureServer;
      if (configureServerHook) {
        if (typeof configureServerHook === 'function') {
          configureServerHook(mockServer);
        } else {
          configureServerHook.handler(mockServer);
        }
      }
    });

    it('should serve index.pug for root URL ("/")', async () => {
      const req = { url: '/' } as Connect.IncomingMessage;
      const res = { setHeader: vi.fn(), end: vi.fn() } as unknown as ServerResponse;
      const next = vi.fn();
      await middleware(req, res, next);
      expect(res.end).toHaveBeenCalledWith(expect.stringContaining('<h1>Main Page</h1>'));
      expect(next).not.toHaveBeenCalled();
    });

    it('should serve a page from the "pages" directory', async () => {
      const req = { url: '/about.html' } as Connect.IncomingMessage;
      const res = { setHeader: vi.fn(), end: vi.fn() } as unknown as ServerResponse;
      const next = vi.fn();
      await middleware(req, res, next);
      expect(res.end).toHaveBeenCalledWith(
        expect.stringContaining('<h1>About Page</h1>'),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next() for non-html requests', async () => {
      const req = { url: '/style.css' } as Connect.IncomingMessage;
      const res = { end: vi.fn() } as unknown as ServerResponse;
      const next = vi.fn();
      await middleware(req, res, next);
      expect(res.end).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('should handle rendering errors and send to websocket', async () => {
      const req = { url: '/error.html' } as Connect.IncomingMessage;
      const res = { end: vi.fn() } as unknown as ServerResponse;
      const next = vi.fn();
      await middleware(req, res, next);
      expect(mockServer.ws.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' }),
      );
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // --- ТЕСТЫ ДЛЯ HMR ---
  describe('handleHotUpdate hook', () => {
    it('should trigger a full-reload for .pug file changes', () => {
      const plugin = viteConvertPugInHtml({ pages: {} });

      if (plugin.configResolved && typeof plugin.configResolved === 'function') {
        (plugin.configResolved as any)({
          root: testProjectRoot,
          logger: { info: vi.fn() }
        });
      }

      const mockContext: HmrContext = {
        file: resolve(testProjectRoot, 'pages/about.pug'),
        timestamp: Date.now(),
        server: {
          ws: { send: vi.fn() },
          config: {
            logger: {
              error: vi.fn(),
              info: vi.fn(),
              warn: vi.fn(),
            },
          },
        } as any,
        read: vi.fn(),
        modules: [],
      };
      (plugin.handleHotUpdate as any)(mockContext);
      expect(mockContext.server.ws.send).toHaveBeenCalledWith({
        type: 'full-reload',
        path: '*',
      });
    });

    it('should do nothing for non-pug file changes', () => {
      const plugin = viteConvertPugInHtml({ pages: {} });
      const mockContext: HmrContext = {
        file: resolve(testProjectRoot, 'main.js'),
        timestamp: Date.now(),
        server: {
          ws: {
            send: vi.fn(),
          },
          config: {
            logger: {
              error: vi.fn(),
              info: vi.fn(),
              warn: vi.fn(),
            },
          },
        } as any,
        read: vi.fn(),
        modules: [],
      };
      (plugin.handleHotUpdate as any)(mockContext);
      expect(mockContext.server.ws.send).not.toHaveBeenCalled();
    });
  });
});
