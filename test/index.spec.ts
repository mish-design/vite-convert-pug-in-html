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
import type {
  Plugin,
  ViteDevServer,
  HmrContext,
  Alias,
  UserConfig,
  ConfigPluginContext,
} from 'vite';
import { viteConvertPugInHtml } from '../src';
import { resolve } from 'path';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { normalizePath, type Connect } from 'vite';
import type { ServerResponse } from 'http';

// --- НАСТРОЙКА ТЕСТОВОГО ОКРУЖЕНИЯ ---

const testProjectRoot = resolve(process.cwd(), '.vitest-project-root');
const srcRoot = resolve(testProjectRoot, 'src');

const filesContent = {
  'src/index.pug': `
doctype html
html
  head
    title Main Page
  body
    h1 Main Page Content
`,
  'src/pages/about.pug': `
doctype html
html
  body
    h1 About Page
`,
  'src/pages/contact/index.pug': `
doctype html
html
  body
    h1 Contact Index Page
`,
  'src/pages/error.pug': `
doctype html
html
  body
    //- Невалидный синтаксис pug
    div(
`,
  'src/components/header.pug': 'header This is the header from a component',
  'src/pages/with-alias.pug': `
doctype html
html
  body
    include @/components/header.pug
`,
};

describe('viteConvertPugInHtml (zero-config version)', () => {
  beforeAll(() => {
    if (existsSync(testProjectRoot)) {
      rmSync(testProjectRoot, { recursive: true, force: true });
    }
    mkdirSync(srcRoot, { recursive: true });
    mkdirSync(resolve(srcRoot, 'pages'), { recursive: true });
    mkdirSync(resolve(srcRoot, 'pages/contact'), { recursive: true });
    mkdirSync(resolve(srcRoot, 'components'), { recursive: true });
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

  // --- ТЕСТЫ ДЛЯ ГЛАВНОГО ХУКА `config` ---
  describe('config hook', () => {
    it('should find pug files and generate correct rollupOptions.input', () => {
      const plugin = viteConvertPugInHtml() as Plugin;
      const userConfig: UserConfig = { root: srcRoot };

      const configHook = plugin.config;
      let resultConfig: any = {};
      if (configHook && typeof configHook === 'function') {
        resultConfig = configHook.call(null, userConfig, {
          command: 'build',
          mode: 'production',
        });
      }

      const input = resultConfig.build.rollupOptions.input;

      expect(Object.keys(input)).toEqual(
        expect.arrayContaining([
          'index',
          'about/index',
          'contact/index',
          'with-alias/index',
        ]),
      );

      expect(input['about/index']).toBe(
        normalizePath(resolve(srcRoot, 'about/index.html')),
      );
      expect(input['index']).toBe(normalizePath(resolve(srcRoot, 'index.html')));
    });
  });

  // --- ТЕСТЫ ДЛЯ `resolveId` И `load` ---
  describe('resolveId and load hooks', () => {
    let plugin: Plugin;
    const aliases: Alias[] = [{ find: '@', replacement: srcRoot }];

    beforeEach(() => {
      plugin = viteConvertPugInHtml({ locals: { SITE_NAME: 'Test Site' } }) as Plugin;
      const userConfig: UserConfig = { root: srcRoot, resolve: { alias: aliases } };
      if (plugin.config && typeof plugin.config === 'function') {
        plugin.config.call(null, userConfig, { command: 'build', mode: 'production' });
      }
      if (plugin.configResolved && typeof plugin.configResolved === 'function') {
        (plugin.configResolved as any)({ root: srcRoot, resolve: { alias: aliases } });
      }
    });

    it('resolveId should resolve virtual HTML paths found by config hook', () => {
      const virtualHtmlPath = resolve(srcRoot, 'about/index.html');
      const resolveIdHook = plugin.resolveId;
      let resolved: any;
      if (resolveIdHook && typeof resolveIdHook === 'function') {
        resolved = resolveIdHook.call(null, virtualHtmlPath, undefined, {} as any);
      }
      expect(resolved).toBe(normalizePath(virtualHtmlPath));
    });

    it('load should return rendered HTML for a known virtual path', () => {
      const virtualHtmlPath = resolve(srcRoot, 'index.html');
      const loadHook = plugin.load;
      let loaded: any;
      if (loadHook && typeof loadHook === 'function') {
        loaded = loadHook.call({ addWatchFile: vi.fn() }, virtualHtmlPath, {} as any);
      }
      expect(loaded).toContain('<h1>Main Page Content</h1>');
    });

    it('load should correctly resolve aliases during render', () => {
      const virtualHtmlPath = resolve(srcRoot, 'with-alias/index.html');
      const loadHook = plugin.load;
      let loaded: any;
      if (loadHook && typeof loadHook === 'function') {
        loaded = loadHook.call({ addWatchFile: vi.fn() }, virtualHtmlPath, {} as any);
      }
      expect(loaded).toContain('<header>This is the header from a component</header>');
    });

    it('load should pass `locals` to the template', () => {
      // Добавим файл с использованием locals
      writeFileSync(resolve(srcRoot, 'pages/with-locals.pug'), 'p= SITE_NAME');

      // Пересоздадим плагин с `locals` и пере-инициализируем
      plugin = viteConvertPugInHtml({
        locals: { SITE_NAME: 'My Awesome Site' },
      }) as Plugin;
      const userConfig: UserConfig = { root: srcRoot };
      if (plugin.config && typeof plugin.config === 'function') {
        plugin.config.call(null, userConfig, { command: 'build', mode: 'production' });
      }
      if (plugin.configResolved && typeof plugin.configResolved === 'function') {
        (plugin.configResolved as any)({ root: srcRoot });
      }

      const virtualHtmlPath = resolve(srcRoot, 'with-locals/index.html');
      const loadHook = plugin.load;
      let loaded: any;
      if (loadHook && typeof loadHook === 'function') {
        loaded = loadHook.call({ addWatchFile: vi.fn() }, virtualHtmlPath, {} as any);
      }
      expect(loaded).toContain('<p>My Awesome Site</p>');
    });
  });

  // --- ТЕСТЫ ДЛЯ DEV-СЕРВЕРА ---
  describe('configureServer hook (dev server)', () => {
    let mockServer: ViteDevServer;
    let middleware: Connect.NextHandleFunction;

    beforeEach(() => {
      mockServer = {
        config: {
          root: srcRoot,
          logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
        },
        middlewares: { use: vi.fn((m) => (middleware = m)) },
        transformIndexHtml: vi.fn((_url, html) => Promise.resolve(html)),
        watcher: { add: vi.fn() },
      } as unknown as ViteDevServer;

      const plugin = viteConvertPugInHtml() as Plugin;
      const userConfig: UserConfig = { root: srcRoot };
      if (plugin.config && typeof plugin.config === 'function') {
        plugin.config.call(null, userConfig, { command: 'serve', mode: 'development' });
      }
      if (plugin.configResolved && typeof plugin.configResolved === 'function') {
        (plugin.configResolved as any)({ root: srcRoot });
      }
      if (plugin.configureServer && typeof plugin.configureServer === 'function') {
        plugin.configureServer.call(null, mockServer);
      }
    });

    it('should serve index.pug for root URL ("/")', async () => {
      const req = { url: '/' } as Connect.IncomingMessage;
      const res = { setHeader: vi.fn(), end: vi.fn() } as unknown as ServerResponse;
      await middleware(req, res, vi.fn());
      expect(res.end).toHaveBeenCalledWith(
        expect.stringContaining('<h1>Main Page Content</h1>'),
      );
    });

    it('should serve a page with a clean URL (e.g., "/about")', async () => {
      const req = { url: '/about' } as Connect.IncomingMessage;
      const res = { setHeader: vi.fn(), end: vi.fn() } as unknown as ServerResponse;
      await middleware(req, res, vi.fn());
      expect(res.end).toHaveBeenCalledWith(
        expect.stringContaining('<h1>About Page</h1>'),
      );
    });

    it('should serve a nested index page with a clean URL (e.g., "/contact")', async () => {
      const req = { url: '/contact' } as Connect.IncomingMessage;
      const res = { setHeader: vi.fn(), end: vi.fn() } as unknown as ServerResponse;
      await middleware(req, res, vi.fn());
      expect(res.end).toHaveBeenCalledWith(
        expect.stringContaining('<h1>Contact Index Page</h1>'),
      );
    });

    it('should call next() for non-pug assets', async () => {
      const req = { url: '/style.css' } as Connect.IncomingMessage;
      const next = vi.fn();
      await middleware(req, {} as any, next);
      expect(next).toHaveBeenCalled();
    });

    it('should handle rendering errors', async () => {
      const req = { url: '/error' } as Connect.IncomingMessage;
      const next = vi.fn();
      await middleware(req, {} as any, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // --- ТЕСТЫ ДЛЯ HMR ---
  describe('handleHotUpdate hook', () => {
    it('should trigger a full-reload for .pug file changes', () => {
      const plugin = viteConvertPugInHtml() as Plugin;

      const mockHmrContext: HmrContext = {
        file: resolve(srcRoot, 'pages/about.pug'),
        server: {
          ws: { send: vi.fn() },
          config: { logger: { info: vi.fn() } },
        } as any,
        timestamp: Date.now(),
        modules: [],
        read: () => Promise.resolve(''),
      };

      if (plugin.configResolved && typeof plugin.configResolved === 'function') {
        (plugin.configResolved as any).call(mockHmrContext, { root: srcRoot });
      }

      if (plugin.handleHotUpdate && typeof plugin.handleHotUpdate === 'function') {
        plugin.handleHotUpdate.call(mockHmrContext, mockHmrContext);
      }

      expect(mockHmrContext.server.ws.send).toHaveBeenCalledWith({
        type: 'full-reload',
        path: '*',
      });
    });
  });
});
