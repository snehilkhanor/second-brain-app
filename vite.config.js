import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages serves this repo at https://<user>.github.io/second-brain-app/
// so the app must know it lives under the "/second-brain-app/" sub-path.
const base = "/second-brain-app/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",        // ship updates automatically on next visit
      includeAssets: ["icons/apple-touch-icon.png"],
      manifest: {
        id: base,
        name: "second brain",
        short_name: "brain",
        description: "Your 3D second brain — a fast, append-only capture surface.",
        start_url: base,
        scope: base,
        display: "standalone",
        orientation: "portrait",
        background_color: "#0A0F1C",
        theme_color: "#0A0F1C",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Precache the app shell so it opens offline; the brain data itself is
        // served from the on-device mirror (see repo.js), not the service worker.
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: `${base}index.html`,
        // Cache Google Fonts at runtime so typography survives offline too.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === "https://fonts.googleapis.com",
            handler: "StaleWhileRevalidate",
            options: { cacheName: "google-fonts-stylesheets" },
          },
          {
            urlPattern: ({ url }) => url.origin === "https://fonts.gstatic.com",
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  // 3d-force-graph and our custom node objects must share ONE copy of three,
  // or the custom glowing spheres won't render. Force a single instance.
  resolve: { dedupe: ["three"] },
});
