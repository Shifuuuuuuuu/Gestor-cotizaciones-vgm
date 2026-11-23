import { offlineShell } from "./server/offlineShell";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), tailwindcss(), offlineShell()],
    server: {
      proxy: {
        "/api": `http://127.0.0.1:${process.env.PORT ?? env.PORT ?? 3001}`,
      },
    },
  };
});
