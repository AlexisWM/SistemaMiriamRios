import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // host: true expõe o servidor de desenvolvimento na rede local, então
    // dá pra abrir pelo celular usando o IP do computador (ex.: 192.168.x.x:5173).
    host: true,
    port: 5173,
  },
});
