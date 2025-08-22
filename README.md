# vite-convert-pug-in-html

A Vite plugin for a seamless, zero-config Pug integration in multi-page applications (MPA).

This plugin automatically detects your `.pug` pages, compiles them on-the-fly in the dev server with support for "pretty URLs" (e.g., `/about`), and builds them into a clean, nested directory structure for production.

## Features

- **🚀 Zero-Config MPA**: Automatically detects all `.pug` files in your source directory to create a multi-page application without manual configuration.
- **⚡️ Pretty URLs & Dev Server**: Intercepts requests to clean URLs (like `/about` or `/contact`) and serves the correctly compiled Pug file on-the-fly.
- **🔄 Hot Module Replacement (HMR)**: Full-page reloads when any `.pug` file (including partials via `include` or `extends`) is changed.
- **🧩 Vite Alias Support**: Use Vite aliases from your `resolve.alias` config directly in Pug `include` or `extends` statements.
- **🌐 Global Data**: Pass global variables and data to all your Pug templates using the `locals` option.
- **📦 Vite-Native Asset Handling**: Let Vite handle your assets naturally. Just link your scripts and styles (`<script src="/main.ts">`) in Pug, and Vite will bundle and inject them correctly.
- **🔧 Extensible**: Pass custom options directly to the Pug compiler via `pugOptions`.

## Installation

```bash
npm install @mish.dev/vite-convert-pug-in-html -D
```

The plugin requires `pug` to be installed in your project:

```bash
npm install pug -D
```

## Usage

Add the plugin to your `vite.config.ts`. For most projects, no options are required.

### How It Works

The plugin automatically scans your project's `root` directory (by default, `src` if you've set `root: 'src'`) for `.pug` files to build your application.

- It ignores any file starting with `_` (e.g., `_layout.pug`), treating them as partials.
- `src/index.pug` becomes the site's root (`/`).
- `src/pages/about.pug` becomes accessible at `/about`.
- `src/pages/contact/index.pug` becomes accessible at `/contact`.

**Recommended Project Structure:**

```
.
├── src/
│   ├── components/
│   │   └── _header.pug
│   ├── pages/
│   │   ├── about.pug
│   │   └── contact/
│   │       └── index.pug
│   ├── templates/
│   │   └── _layout.pug
│   ├── index.pug
│   └── main.ts
└── vite.config.ts
```

### Basic Zero-Config Setup

**vite.config.ts:**

```ts
import { defineConfig } from 'vite';
import { viteConvertPugInHtml } from '@mish.dev/vite-convert-pug-in-html';

export default defineConfig({
  // Tell Vite that your source code is in the 'src' directory
  root: 'src',

  plugins: [
    // That's it! No options needed for a standard setup.
    viteConvertPugInHtml(),
  ],

  build: {
    // Make sure Vite builds to the project root, not inside 'src'
    outDir: '../dist',
  },
});
```

When you run `vite build`, the plugin automatically generates:

- `dist/index.html` (from `src/index.pug`)
- `dist/about/index.html` (from `src/pages/about.pug`)
- `dist/contact/index.html` (from `src/pages/contact/index.pug`)

In the dev server, you can access these pages at `/`, `/about`, and `/contact`.

### Handling Assets (The Modern Vite Way)

Forget manual replacements. Just link your TypeScript/JavaScript entry point directly in your main layout file. Vite will handle the rest.

**src/templates/\_layout.pug:**

```pug
doctype html
html
  head
    title My Awesome Site
    // Vite will automatically inject the compiled CSS here
  body
    block content

    // Just point to your TS/JS entry file.
    // Vite will bundle it and add the correct hashed path on build.
    script(src="/main.ts" type="module")
```

### Passing Global Data with `locals`

Use the `locals` option to make data available in all your Pug templates. This is the perfect place for site-wide constants, helper functions, or environment variables.

**vite.config.ts:**

```ts
import { defineConfig } from 'vite';
import { viteConvertPugInHtml } from '@mish.dev/vite-convert-pug-in-html';

export default defineConfig({
  root: 'src',
  plugins: [
    viteConvertPugInHtml({
      locals: {
        SITE_NAME: 'My Awesome Company',
        PHONE: '+1 (800) 555-1234',
        CURRENT_YEAR: new Date().getFullYear(),
      },
    }),
  ],
  build: {
    outDir: '../dist',
  },
});
```

**src/templates/\_layout.pug:**

```pug
doctype html
html
  head
    //- Variables from `locals` are globally available
    title= SITE_NAME
  body
    block content
    footer
      p &copy; #{CURRENT_YEAR} #{SITE_NAME}
      p Call us at: #{PHONE}
```

### Vite Alias Support

The plugin automatically uses aliases from your `resolve.alias` config, making includes clean and maintainable.

**vite.config.ts:**

```ts
import { defineConfig } from 'vite';
import { viteConvertPugInHtml } from '@mish.dev/vite-convert-pug-in-html';
import { resolve } from 'path';

export default defineConfig({
  root: 'src',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  plugins: [viteConvertPugInHtml()],
  build: {
    outDir: '../dist',
  },
});
```

**src/pages/about.pug:**

```pug
extends @/templates/_layout.pug

block content
  //- Use the '@' alias to include a component
  include @/components/_header.pug
  h1 About Us
```

## Options

### `pugOptions`

- **Type**: `PugOptions` (from `pug`)
- **Default**: `{}`

An object of options passed directly to `pug.render()`. Use this for advanced Pug features like filters or custom doctypes.

```ts
viteConvertPugInHtml({
  pugOptions: {
    pretty: true, // Make the output HTML readable (default)
  },
}),
```

### `locals`

- **Type**: `Record<string, any>`
- **Default**: `{}`

An object of global variables that will be available in all your Pug templates. This is merged with `pugOptions` before rendering.

## License

[MIT](./LICENSE)
