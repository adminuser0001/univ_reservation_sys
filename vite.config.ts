/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

/**
 * 本番ビルドにだけ CSP を入れ、アプリから外部への通信をブラウザに禁止させる。
 * 予約データ（個人情報）が端末の外に出ないことを、コードの約束ではなく仕組みで守る。
 * 開発サーバーは HMR のためにインラインスクリプトと WebSocket を使うので対象外。
 */
function contentSecurityPolicy(): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' },
    ],
  };
}

export default defineConfig({
  // どのフォルダに置いても動くよう、相対パスで出力する（GitHub Pages のサブフォルダなど）
  base: './',
  plugins: [
    react(),
    contentSecurityPolicy(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png'],
      manifest: {
        name: '整理券受付',
        short_name: '整理券受付',
        description: '学園祭 教室企画の予約受付。データはこの端末にだけ保存します。',
        lang: 'ja',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#eef1f7',
        theme_color: '#1D2560',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 一度開いたら、フォントとアイコンも含めてオフラインで起動できるようにする
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  build: {
    // 小さいフォントを data: で埋め込むと CSP の font-src 'self' に止められるため、すべてファイルで出す
    assetsInlineLimit: 0,
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: { host: true },
  preview: { host: true },
  test: {
    environment: 'node',
  },
});
