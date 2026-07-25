import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite 配置：/api 与 /ws 代理到本地 Node 后端（端口 8100）
export default defineConfig({
  // GitHub Pages 项目页部署路径：https://lilfisssh.github.io/emotion-portfolio/
  base: "/emotion-portfolio/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8100",
        changeOrigin: true,
      },
      "/ws": {
        target: "http://localhost:8100",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
