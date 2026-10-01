/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Production builds get a strict Content-Security-Policy meta tag: everything from our own
// origin, plus the one Supabase project the build points at. No third parties (brief req. 7).
// Dev builds skip it because Vite's HMR client needs inline scripts.
function csp(supabaseUrl: string): Plugin {
  return {
    name: 'deck-csp',
    apply: 'build',
    transformIndexHtml(html) {
      const api = supabaseUrl ? new URL(supabaseUrl) : null;
      const connect = ["'self'"];
      if (api) connect.push(api.origin, `${api.protocol === 'https:' ? 'wss' : 'ws'}://${api.host}`);
      const policy = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        `connect-src ${connect.join(' ')}`,
        "worker-src 'self'",
        "manifest-src 'self'",
        "media-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ');
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [
      react(),
      csp(env.VITE_SUPABASE_URL ?? ''),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: false,
        includeAssets: ['icons/*.png', 'art/**/*'],
        manifest: {
          name: 'The Deck',
          short_name: 'The Deck',
          description: 'Our family home base.',
          display: 'standalone',
          orientation: 'any',
          start_url: '/',
          scope: '/',
          background_color: '#15122E',
          theme_color: '#0A0818',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
          navigateFallback: '/index.html',
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    server: {
      host: '0.0.0.0',
      port: 3997,
      strictPort: true,
      allowedHosts: ['.ts.net'],
    },
    test: {
      include: ['src/**/*.test.{ts,tsx}'],
    },
    preview: {
      host: '0.0.0.0',
      port: 3997,
      strictPort: true,
    },
  };
});
