import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { resolveAdminRuntimeConfig } from "./src/lib/runtimeConfig";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const runtimeMode = mode === "production" ? "production" : "development";
  resolveAdminRuntimeConfig(env, runtimeMode);

  const DEV_PROXY_TARGET =
    env.VITE_BACKEND_URL ||
    env.VITE_API_URL ||
    "https://edutu-api.onrender.com";

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": {
          target: DEV_PROXY_TARGET,
          changeOrigin: true,
        },
        "/health": {
          target: DEV_PROXY_TARGET,
          changeOrigin: true,
        },
      },
    },
  };
});
