# vite-convert-pug-in-html

A Vite plugin to seamlessly integrate [Pug](https://pugjs.org/) for multi-page applications (MPA), on-the-fly development server compilation, and component templating.

This plugin provides a zero-config-friendly experience for developers who prefer Pug for its clean and concise syntax while building projects with Vite.

## Features

- **🚀 Multi-Page Application (MPA) Support**: Effortlessly configure multiple Pug files as entry points for your production build.
- **⚡️ On-the-Fly Dev Server**: Intercepts requests to `.html` files and serves the compiled content from corresponding `.pug` files instantly.
- **🔄 Hot Module Replacement (HMR)**: Full-page reloads on any `.pug` file change for a smooth development workflow.
- **🧩 Vite Alias Support**: Use Vite aliases from your `resolve.alias` config directly in Pug `include` or `extends` statements.
- **📦 Asset Handling**: Automatically replace placeholder script and stylesheet paths in your HTML during the production build.
- **🧩 Import as String**: Import `.pug` files directly into your JavaScript/TypeScript as compiled HTML strings.
- **🔧 Extensible**: Pass custom options directly to the Pug compiler.

## Installation

```bash
npm install @mish.dev/vite-convert-pug-in-html -D
```

This plugin relies on your project's version of Pug. The internal dependency `node-html-parser` will be installed automatically.

## Usage

Add the plugin to your `vite.config.ts` file.

### Basic MPA Setup

For a typical multi-page application, specify your entry points in the `pages` option. The key is the name of the output HTML file (e.g., `index`), and the value is the path to the source Pug file.

**Project Structure:**

```
.
├── src/
│   ├── index.pug
│   ├── main.ts
│   └── pages/
│       └── about.pug
└── vite.config.ts
```

**vite.config.ts:**

```ts
import { defineConfig } from 'vite';
import { viteConvertPugInHtml } from '@mish.dev/vite-convert-pug-in-html';

export default defineConfig({
  plugins: [
    viteConvertPugInHtml({
      pages: {
        // will generate dist/index.html
        index: 'src/index.pug',
        // will generate dist/about.html
        about: 'src/pages/about.pug',
      },
    }),
  ],
});
```

Now, when you run `vite build`, the plugin will generate `dist/index.html` and `dist/pages/about/index.html`. In the dev server, you can access these pages at `/` and `/about`.

### Vite Alias Support

The plugin automatically picks up aliases from your Vite config's resolve.alias option. This allows for cleaner and more maintainable paths in your Pug include and extends directives.

**vite.config.ts:**

```ts
import { defineConfig } from 'vite';
import { viteConvertPugInHtml } from '@mish.dev/vite-convert-pug-in-html';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // Set '@' as an alias for the 'src' directory
      '@': resolve(__dirname, 'src'),
    },
  },
  plugins: [
    viteConvertPugInHtml({
      pages: {
        index: 'src/index.pug',
      },
    }),
  ],
});
```

**src/index.pug:**

```pug
doctype html
html
  body
    //- Use the '@' alias to include a component
    include @/components/header.pug

    h1 Main Page

    include @/components/footer.pug
```

### Handling Assets (CSS & JS) in Production

Vite generates assets with hashed filenames for caching. This plugin can automatically update the `href` and `src` attributes in your final HTML.

**src/index.pug:**

```pug
doctype html
html
  head
    // This href will be replaced during build
    link(rel="stylesheet" href="/style.css")
  body
    h1 Main Page
    // This src will be replaced during build
    script(src="/main.js" type="module")
```

**vite.config.ts:**

```ts
import { defineConfig } from 'vite';
import { viteConvertPugInHtml } from '@mish.dev/vite-convert-pug-in-html';

export default defineConfig({
  plugins: [
    viteConvertPugInHtml({
      pages: {
        index: 'src/index.pug',
      },
      // This option is used ONLY for the build process
      replacement: {
        // The value should match the output key from `build.rollupOptions.input`
        // if you are bundling your script.
        script: '/scripts/main.js',
        css: 'style.css',
      },
    }),
  ],
  build: {
    rollupOptions: {
      // Ensure Vite bundles your main script and CSS
      input: {
        main: 'scripts/main.ts',
      },
    },
  },
});
```

_Note: The plugin will find the first `<link rel="stylesheet">` and `<script src="...">` and replace their paths. For more complex scenarios, consider using the `pugOptions` to inject variables._

### Import as HTML String

You can import .pug files directly into your code, which is useful for component templates.

**src/template.pug:**

```pug
.card
  h3= title
  p= content
```

**src/main.ts:**

```typescript
// Note: This import will be a pre-compiled HTML string with empty variables.
import templateString from './template.pug';

// If you need to render with data on the client, you'll need the 'pug' package
import { compile } from 'pug';

// templateString will contain the compiled HTML string:
// "<div class="card"><h3></h3><p></p></div>"
console.log(templateString);

// To inject data, compile the template string into a function
const compiledTemplate = compile('include /path/to/template.pug'); // Or compile the imported string
const finalHtml = compiledTemplate({ title: 'Hello', content: 'World' });
document.body.innerHTML = finalHtml;
```

## Options

### `pages`

- **Type**: `Record<string, string>`
- **Default**: `{}`

An object defining the MPA entry points for the build.

- The **key** is the name of the output HTML file (without the `.html` extension).
- The **value** is the path to the source `.pug` file, relative to the project root.

### `replacement`

- **Type**: `{ css?: string; script?: string; }`
- **Default**: `{}`

An object to specify the final paths for your CSS and JavaScript assets in the production build.

- `css`: The plugin will find the first `<link rel="stylesheet">` and replace its `href` attribute with this value.
- `script`: The plugin will find the first `<script>` with a `src` attribute and replace its `src` with this value.

### `pugOptions`

- **Type**: `PugOptions`
- **Default**: `{}`

An object of options to be passed directly to `pug.render()`. This allows you to use any of Pug's features, like filters, custom doctypes, or passing data via the `locals` property.

**Example:**

```ts
viteConvertPugInHtml({
  pages: {
    index: 'src/index.pug',
  },
  pugOptions: {
    pretty: true, // Make the output HTML readable
    locals: {
      // This data will be available in your .pug files
      title: 'My Awesome Website',
      user: { name: 'Alex' },
    },
  },
}),
```

**src/index.pug:**

```pug
doctype html
html
  head
    //- The title variable comes from pugOptions.locals
    title= title
  body
    //- The user variable is also available
    if user
      h1 Welcome, #{user.name}!
    else
      h1 Welcome, Guest!
```

## License

[MIT](./LICENSE)
