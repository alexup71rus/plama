// Plugins
import Components from 'unplugin-vue-components/vite';
import Vue from '@vitejs/plugin-vue';
import Vuetify, { transformAssetUrls } from 'vite-plugin-vuetify';
import Fonts from 'unplugin-fonts/vite';
import VueRouter from 'unplugin-vue-router/vite';
import csp from 'vite-plugin-csp';

// Utilities
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    VueRouter({
      dts: 'src/typed-router.d.ts',
    }),
    Vue({
      template: { transformAssetUrls },
    }),
    // svgLoader(),
    // https://github.com/vuetifyjs/vuetify-loader/tree/master/packages/vite-plugin#readme
    Vuetify({
      autoImport: true,
      styles: {
        configFile: 'src/styles/settings.scss',
      },
    }),
    Components({
      dts: 'src/components.d.ts',
    }),
    Fonts({
      fontsource: {
        families: [
          {
            name: 'Roboto',
            weights: [400, 500, 700],
            styles: ['normal'],
          },
        ],
      },
    }),
    csp({
      policies: {
        'default-src': ["'self'"],
        'connect-src': ["'self'", 'http://localhost:3001', 'ws://localhost:3001', 'ws://localhost:3002'],
        'font-src': ["'self'", 'data:'],
        'img-src': ["'self'", 'data:', 'blob:'],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
      },
    }),
  ],
  optimizeDeps: {
    exclude: [
      'vuetify',
      'vue-router',
      'unplugin-vue-router/runtime',
      'unplugin-vue-router/data-loaders',
      'unplugin-vue-router/data-loaders/basic',
    ],
  },
  define: { 'process.env': {} },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    extensions: [
      '.js',
      '.json',
      '.jsx',
      '.mjs',
      '.ts',
      '.tsx',
      '.vue',
    ],
  },
  server: {
    port: 3002,
  },
  css: {
    preprocessorOptions: {
      sass: {
        api: 'modern-compiler',
      },
      scss: {
        api: 'modern-compiler',
      },
    },
  },
  build: {
    minify: 'esbuild',
    terserOptions: {
      compress: { drop_console: true },
    },
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks: {
          vuetify: ['vuetify'],
          vendor: ['vue', 'vue-router'],
        },
      },
    },
    assetsInclude: ['**/*.woff', '**/*.woff2'],
  }
});
