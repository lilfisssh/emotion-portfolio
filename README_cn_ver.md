# 情绪气象站 · Emotional Weather

Arduino PPG 心率（MAX30102）+ GSR 皮肤电（Grove GSR）→ Russell 二维情绪平面
（valence × arousal）实时展示。
前端 React + Vite + Tailwind；本地全栈模式附带 Express + WebSocket + serialport Node 后端。

## 线上地址

https://lilfisssh.github.io/emotion-portfolio/

## 本地开发

```bash
npm install
npm run dev   # 同时拉起 Vite 前端与 Node 后端（端口 8100）
```

本地开发默认走「Local backend (WS)」模式；控制条可切换 Mock demo / Connect Arduino。

## 线上（无后端）说明

GitHub Pages 为纯静态站点，不包含 Node 后端：

- **Mock demo**：默认自动开始，浏览器内生成拟真数据（1Hz，90s 循环剧本）。
- **Connect Arduino**：通过 Web Serial API 直连（需 Chrome / Edge，115200 baud，
  Arduino 按行输出 `{"hr":72.5,"gsr":1.23,"rmssd":45.0}` JSON）。
- 情绪映射算法为前后端共享实现（`src/lib/mapping.core.mjs`），两端行为一致。

## 硬件

传感器：**MAX30102**（心率/HRV，I2C 地址 0x57）+ **Grove GSR**（皮肤电，模拟口 A0），
主控 Arduino Uno。固件、选品、接线与调试笔记见
[`hardware/README_cn_ver.md`](hardware/README_cn_ver.md)
（English: [`hardware/README.md`](hardware/README.md)）。

## 部署

推送到 `main` 分支即由 GitHub Actions（`.github/workflows/deploy.yml`）自动构建并发布到 Pages。
