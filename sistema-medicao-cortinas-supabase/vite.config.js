import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // Ícones e o manifest.webmanifest são gerados a partir daqui — nada
      // de editar/criar esses arquivos à mão em public/.
      manifest: {
        name: "Cortinas Miriam Rios",
        short_name: "Miriam Rios",
        description: "Sistema de gerenciamento de clientes — medições, produção e instalação de cortinas e persianas.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#070B14",
        theme_color: "#070B14",
        lang: "pt-BR",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Só a casca do app (HTML/JS/CSS/ícones) fica em cache, pra abrir
        // rápido e funcionar como app instalado. Chamadas pro Supabase
        // (dados de pedidos, login, etc.) NUNCA passam por cache — sempre
        // busca ao vivo, pra ninguém nunca ver dado desatualizado/errado.
        globPatterns: ["**/*.{js,css,html,png,ico,svg,webmanifest}"],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin.includes("supabase.co"),
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
  server: {
    // host: true expõe o servidor de desenvolvimento na rede local, então
    // dá pra abrir pelo celular usando o IP do computador (ex.: 192.168.x.x:5173).
    host: true,
    port: 5173,
  },
});
