/**
 * dev.mjs —— 单命令同时拉起 Vite 前端与 Node 后端。
 * 命令行参数（如 --port / --host）全部透传给 Vite，
 * 兼容 Kimi Work 预览系统动态分配端口的启动方式。
 *
 * 后端守护：后端进程退出（含 EADDRINUSE "复用现有实例"的静默退出）后，
 * 主动探测 8100 是否真的有人在服务；没有则自动重启后端。
 * 防止"复用了一个后来死掉的实例"导致页面 /api 500、WS 永断。
 */
import { spawn } from "node:child_process";

const viteArgs = process.argv.slice(2);
// 预览系统常以 PORT 环境变量指定端口
if (process.env.PORT && !viteArgs.includes("--port")) {
  viteArgs.push("--port", process.env.PORT);
}

let shuttingDown = false;
let backend = null;
let respawnTimer = null;

function probe8100() {
  return fetch("http://localhost:8100/api/status", { signal: AbortSignal.timeout(1500) })
    .then((r) => r.ok)
    .catch(() => false);
}

function startBackend() {
  if (shuttingDown) return;
  backend = spawn("node", ["server/index.js"], { stdio: "inherit", shell: true });
  backend.on("exit", (code) => {
    if (shuttingDown) return;
    if (code && code !== 0) {
      // 真崩溃：保持旧行为，整体退出让错误可见
      shutdown(code);
      return;
    }
    // exit 0：多半是 EADDRINUSE 静默复用。800ms 后探测 8100 是否真有服务，
    // 没人服务就自己重启补上。
    respawnTimer = setTimeout(async () => {
      if (shuttingDown) return;
      const alive = await probe8100();
      if (!alive && !shuttingDown) startBackend();
    }, 800);
  });
}

const vite = spawn("npx", ["vite", ...viteArgs], { stdio: "inherit", shell: true });
vite.on("exit", (code) => {
  if (!shuttingDown && code && code !== 0) shutdown(code);
});
startBackend();

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (respawnTimer) clearTimeout(respawnTimer);
  for (const p of [vite, backend]) {
    try {
      p?.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
