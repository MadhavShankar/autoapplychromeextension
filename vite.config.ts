import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync } from 'fs';

// ═══════════════════════════════════════════════════════════════
// WisOwl Auto-Apply · Production Vite Configuration
// Builds: popup (standard), background (ES module), content (IIFE)
// ═══════════════════════════════════════════════════════════════

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';

  return {
    define: {
      __WISOOWL_DEV__: JSON.stringify(isDev),
    },
    build: {
      emptyOutDir: true,
      outDir: 'dist',
      minify: isDev ? false : 'terser',
      sourcemap: isDev,
      terserOptions: isDev
        ? undefined
        : {
            compress: {
              drop_console: false, // keep console for production debugging
              drop_debugger: true,
            },
            mangle: {
              reserved: ['chrome'],
            },
          },
      rollupOptions: {
        input: {
          popup: resolve(__dirname, 'popup/index.html'),
        },
        output: {
          entryFileNames: 'popup/[name].js',
          chunkFileNames: 'popup/assets/[name]-[hash].js',
          assetFileNames: ({ name }) => {
            if (name?.endsWith('.css')) return 'popup/[name][extname]';
            return 'popup/assets/[name]-[hash][extname]';
          },
        },
      },
    },
    plugins: [
      // Build background worker as ES module bundle
      extensionLibPlugin({
        entry: resolve(__dirname, 'background/worker.ts'),
        outDir: 'dist',
        fileName: 'background.js',
        format: 'es',
      }),
      // Build content script as IIFE bundle (required for chrome.scripting.executeScript)
      extensionLibPlugin({
        entry: resolve(__dirname, 'content/form-agent.ts'),
        outDir: 'dist/content',
        fileName: 'form-agent.js',
        format: 'iife',
      }),
      // Copy static assets after build
      copyAssetsPlugin(),
    ],
  };
});

// ── Plugin: build library entry as separate bundle ──

interface LibOptions {
  entry: string;
  outDir: string;
  fileName: string;
  format: 'es' | 'iife';
}

function extensionLibPlugin(options: LibOptions) {
  return {
    name: `extension-lib-${options.fileName}`,
    async writeBundle() {
      const { build } = await import('vite');
      await build({
        configFile: false,
        build: {
          emptyOutDir: false,
          outDir: options.outDir,
          lib: {
            entry: options.entry,
            name: options.format === 'iife' ? 'WisOwlContent' : undefined,
            formats: [options.format],
            fileName: () => options.fileName,
          },
          rollupOptions: {
            output: {
              inlineDynamicImports: true,
            },
          },
          minify: true,
          sourcemap: false,
        },
      });
    },
  };
}

// ── Plugin: copy manifest + icons ──

function copyAssetsPlugin() {
  return {
    name: 'copy-extension-assets',
    closeBundle() {
      try {
        // Ensure icons directory exists
        mkdirSync(resolve(__dirname, 'dist/icons'), { recursive: true });

        // Copy manifest
        copyFileSync(
          resolve(__dirname, 'public/manifest.json'),
          resolve(__dirname, 'dist/manifest.json')
        );

        // Copy placeholder icons if real ones don't exist
        const iconSizes = [16, 48, 128];
        for (const size of iconSizes) {
          const src = resolve(__dirname, `icons/icon${size}.png`);
          const dest = resolve(__dirname, `dist/icons/icon${size}.png`);
          try {
            copyFileSync(src, dest);
          } catch {
            // icon missing — extension will still load but show default icon
          }
        }
      } catch (err) {
        console.warn('[Extension Build] Asset copy failed:', err);
      }
    },
  };
}
