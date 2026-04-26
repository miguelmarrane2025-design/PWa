import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png", "icons/*.png"],
      manifest: {
        name: "BotSquad",
        short_name: "BotSquad",
        description: "AI platform with 37 specialized skills",
        theme_color: "#4f6ef7",
        background_color: "#030712",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
          { src: "/icons/icon-180.png", sizes: "180x180", type: "image/png" }
        ],
        shortcuts: [
          { name: "Chat", url: "/chat", icons: [{ src: "/icons/icon-96.png", sizes: "96x96" }] },
          { name: "Skills", url: "/skills", icons: [{ src: "/icons/icon-96.png", sizes: "96x96" }] },
          { name: "Audio", url: "/audio", icons: [{ src: "/icons/icon-96.png", sizes: "96x96" }] }
        ]
      },
      workbox: {
        runtimeCaching: [
          {
            // Match API calls regardless of origin (cross-origin to backend server)
            urlPattern: ({ url }) => {
              const apiBase = import.meta.env?.VITE_API_URL || "http://localhost:4000";
              const apiPaths = ["/auth", "/chat", "/skills", "/memory", "/audio", "/video", "/drive", "/settings"];
              // Same-origin dev proxy OR cross-origin production
              return apiPaths.some(p => url.pathname.startsWith(p)) ||
                     (apiBase && url.href.startsWith(apiBase) && apiPaths.some(p => url.pathname.startsWith(p)));
            },
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 10,
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /\.(js|css|woff2?|png|svg|ico)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "static-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 }
            }
          }
        ],
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"]
      },
      devOptions: { enabled: false }
    })
  ],
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: [
      "botsquad.online",
      "www.botsquad.online",
      "api.botsquad.online",
      "161.97.78.124"
    ],
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL || "http://localhost:4000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    allowedHosts: [
      "botsquad.online",
      "www.botsquad.online",
      "api.botsquad.online",
      "161.97.78.124"
    ]
  },
  build: { outDir: "dist", sourcemap: false },
});
