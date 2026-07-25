# 情绪气象站 · Emotional Weather

Arduino PPG 心率 + GSR 皮肤电 → Russell 二维情绪平面（valence × arousal）实时展示。
前端 React + Vite + Tailwind；本地全栈模式附带 Express + WebSocket + serialport Node 后端。

## 线上地址

https://lilfisssh.github.io/emotion-portfolio/

## 本地开发

```bash
npm install
npm run dev   # 同时拉起 Vite 前端与 Node 后端（端口 8100）
```

本地开发默认走「本地后端 (WS)」模式；控制条可切换模拟演示 / 连接 Arduino。

## 线上（无后端）说明

GitHub Pages 为纯静态站点，不包含 Node 后端：

- **模拟演示**：默认自动开始，浏览器内生成拟真数据（1Hz，90s 循环剧本）。
- **连接 Arduino**：通过 Web Serial API 直连（需 Chrome / Edge，115200 baud，
  Arduino 按行输出 `{"hr":72.5,"gsr":1.23,"rmssd":45.0}` JSON）。
- 情绪映射算法为前后端共享实现（`src/lib/mapping.core.mjs`），两端行为一致。

## 部署

推送到 `main` 分支即由 GitHub Actions（`.github/workflows/deploy.yml`）自动构建并发布到 Pages。
