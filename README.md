# Emotional Weather · Arduino Emotion Detection

Arduino PPG heart rate (MAX30102) + GSR skin conductance (Grove GSR) → Russell's
circumplex (valence × arousal) real-time visualization.

Frontend: React + Vite + Tailwind. Local full-stack mode adds an Express +
WebSocket + serialport Node backend.

## Live site

https://lilfisssh.github.io/emotion-portfolio/

## Local development

```bash
npm install
npm run dev   # starts Vite frontend + Node backend (port 8100) together
```

In dev mode the control bar defaults to "Local backend (WS)"; you can also
switch to Mock demo or Connect Arduino in the browser.

## Online (no backend) notes

GitHub Pages serves a static build — no Node backend:

- **Mock demo**: starts automatically; realistic 1 Hz data generated in the
  browser (90 s loop script).
- **Connect Arduino**: direct connection via Web Serial API (Chrome / Edge,
  115200 baud, one JSON line per sample: `{"hr":72.5,"gsr":1.23,"rmssd":45.0}`).
- The emotion-mapping algorithm is a single shared implementation
  (`src/lib/mapping.core.mjs`) used by both browser and backend.

## Hardware

Sensors: **MAX30102** (heart rate / HRV, I2C 0x57) + **Grove GSR** (skin
conductance, analog A0) on an Arduino Uno. Firmware, parts list, wiring and
debugging notes live in [`hardware/`](hardware/README.md)
(中文版本: [`hardware/README_cn_ver.md`](hardware/README_cn_ver.md)).

## Deployment

Every push to `main` is built and published to Pages by GitHub Actions
(`.github/workflows/deploy.yml`).

---

中文说明见 [README_cn_ver.md](README_cn_ver.md)。
