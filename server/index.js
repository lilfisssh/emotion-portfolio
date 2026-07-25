/**
 * server/index.js —— 情绪检测后端（Express REST + WebSocket 推送）
 *
 * 端口固定 8100。默认启动即进入 mock 模式（无硬件也有数据流）。
 *
 * REST：
 *   GET  /api/ports      → [{ path, manufacturer }]（serialport 列出；失败返回 []）
 *   GET  /api/status     → { connected, port, mode, baselineReady, uptimeSec }
 *   POST /api/connect    { path } → 连接串口（115200 baud），切 serial 模式（同时停 mock）
 *   POST /api/disconnect → 断开串口
 *   POST /api/mock       { enabled } → 开关 mock 数据源（开 mock 时断开串口）
 *
 * WebSocket /ws：
 *   客户端连接即推送 { type:"status", connected, port, mode }
 *   每个样本推送 { type:"sample", t, hr, gsr, rmssd, valence, arousal, mode, baselineReady }
 *   状态变化时广播 status
 *
 * 串口按行解析，同时兼容两种格式：
 *   1) JSON 行：{"hr":72.5,"gsr":1.23,"rmssd":45.0}
 *   2) CSV 行（用户 Arduino 实际格式）：hr,gsr,rmssd[,valence]
 *      例如 "72.5,1.23,45.0,0.6"；第 4 个数字为 Arduino 端估算欢愉度，
 *      解析后仅透传记录为 sample.arduinoValence，valence 仍由后端 mapping.js 计算。
 *   字段缺失沿用上一帧值；坏行丢弃不崩溃；断线自动广播 status(connected:false)。
 */

const http = require("http");
const path = require("path");
const { pathToFileURL } = require("url");
const express = require("express");
const { WebSocketServer } = require("ws");
const { createMockSource } = require("./lib/mock");

// 映射实现为前后端共享的单一事实来源：src/lib/mapping.core.mjs（纯 ESM）。
// 本文件是 CommonJS，无法直接 require ESM，用动态 import 加载同一份实现，
// 禁止在 server 内复制映射逻辑。

async function main() {
const { createMapper } = await import(
  pathToFileURL(path.join(__dirname, "../src/lib/mapping.core.mjs")).href
);

// serialport 含原生模块，加载失败时优雅降级（/api/ports 返回 []，串口功能不可用）
let SerialPort = null;
let ReadlineParser = null;
try {
  ({ SerialPort } = require("serialport"));
  ({ ReadlineParser } = require("@serialport/parser-readline"));
} catch (e) {
  try {
    // serialport v12+ 把 parser 合进主包
    ({ SerialPort, ReadlineParser } = require("serialport"));
  } catch (e2) {
    console.warn("[server] serialport 不可用，串口功能降级：", e2.message);
  }
}

const PORT = 8100;
const startedAt = Date.now();

const app = express();
app.use(express.json());

// ---------------- 全局状态 ----------------
const state = {
  mode: "mock", // "mock" | "serial" | "idle"
  connected: false, // 串口是否连接
  port: null, // 当前串口路径
  baselineReady: false,
};

let mapper = createMapper();
let serialPort = null;
let lastFrame = null; // 上一帧串口数据（字段缺失时沿用）
let sampleT = 0; // 样本计数（秒）
let lastMapped = { valence: 0, arousal: 0, baselineReady: false }; // 最近一次有效映射输出

// ---------------- WebSocket ----------------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.warn(`[server] 端口 ${PORT} 已被占用，复用现有后端实例，此后端进程退出`);
    process.exit(0);
  }
  throw err;
});

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

function statusPayload() {
  return {
    type: "status",
    connected: state.connected,
    port: state.port,
    mode: state.mode,
  };
}

function broadcastStatus() {
  broadcast(statusPayload());
}

wss.on("connection", (ws) => {
  ws.send(JSON.stringify(statusPayload()));
});

// ---------------- 样本处理 ----------------
// 无接触哨兵帧（Arduino 手指离开传感器时输出 hr=0 / gsr=0 / rmssd=-1）：
// 不喂给 mapper——否则 30s 基线会建立在全零数据上，之后任何真实读数
// 都被算成巨大正偏离，情绪点永远钉在 (+1,+1)。原始值照常广播（signalOk:false），
// 前端可据此显示"无信号"，valence/arousal 沿用最近一次有效输出。
function isSignalOk(s) {
  return s.hr > 0 && s.gsr > 0 && s.rmssd > 0;
}

function handleSample(sample) {
  sampleT += 1;
  const signalOk = isSignalOk(sample);
  if (signalOk) lastMapped = mapper.push(sample);
  state.baselineReady = lastMapped.baselineReady;
  broadcast({
    type: "sample",
    t: sampleT,
    hr: sample.hr,
    gsr: sample.gsr,
    rmssd: sample.rmssd,
    signalOk,
    // Arduino 自算 valence 仅透传记录（如有），不参与映射
    ...(sample.arduinoValence !== undefined ? { arduinoValence: sample.arduinoValence } : {}),
    valence: lastMapped.valence,
    arousal: lastMapped.arousal,
    mode: state.mode,
    baselineReady: lastMapped.baselineReady,
  });
}

// ---------------- mock 数据源 ----------------
const mock = createMockSource((s) => handleSample(s));

function startMock() {
  closeSerial(); // 开 mock 时断开串口
  mapper.reset();
  lastMapped = { valence: 0, arousal: 0, baselineReady: false };
  sampleT = 0;
  state.mode = "mock";
  state.baselineReady = false;
  mock.reset();
  mock.start();
  broadcastStatus();
}

function stopMock() {
  mock.stop();
  if (state.mode === "mock") state.mode = "idle";
  broadcastStatus();
}

// ---------------- 串口 ----------------
function closeSerial() {
  if (serialPort) {
    try {
      serialPort.close();
    } catch (_) {}
    serialPort = null;
  }
  if (state.connected) {
    state.connected = false;
    state.port = null;
    if (state.mode === "serial") state.mode = "idle";
    broadcastStatus();
  }
}

function connectSerial(path) {
  if (!SerialPort || !ReadlineParser) {
    throw new Error("serialport 不可用（原生模块未安装）");
  }
  stopMock(); // 切 serial 模式前停 mock
  closeSerial();

  return new Promise((resolve, reject) => {
    const sp = new SerialPort({ path, baudRate: 115200 }, (err) => {
      if (err) return reject(err);
      serialPort = sp;
      mapper.reset();
      lastMapped = { valence: 0, arousal: 0, baselineReady: false };
      sampleT = 0;
      lastFrame = null;
      state.mode = "serial";
      state.connected = true;
      state.port = path;
      state.baselineReady = false;
      broadcastStatus();

      const parser = sp.pipe(new ReadlineParser({ delimiter: "\n" }));
      parser.on("data", (line) => {
        const sample = parseSerialLine(line);
        if (sample) handleSample(sample);
      });
      sp.on("close", () => {
        // 断线自动广播 status(connected:false)
        if (serialPort === sp) {
          serialPort = null;
          state.connected = false;
          state.port = null;
          if (state.mode === "serial") state.mode = "idle";
          broadcastStatus();
        }
      });
      sp.on("error", () => {});
      resolve();
    });
  });
}

/**
 * 解析一行串口数据，兼容 JSON 行与 CSV 行两种格式。
 * 字段缺失沿用上一帧值；坏行返回 null（丢弃不崩溃）。
 */
function parseSerialLine(line) {
  const text = String(line).trim();
  if (!text) return null;

  // 1) JSON 行：{"hr":72.5,"gsr":1.23,"rmssd":45.0}
  if (text.startsWith("{")) {
    try {
      const obj = JSON.parse(text);
      const hr = typeof obj.hr === "number" ? obj.hr : lastFrame?.hr;
      const gsr = typeof obj.gsr === "number" ? obj.gsr : lastFrame?.gsr;
      const rmssd = typeof obj.rmssd === "number" ? obj.rmssd : lastFrame?.rmssd;
      if (hr === undefined || gsr === undefined || rmssd === undefined) return null;
      const sample = { hr, gsr, rmssd };
      if (typeof obj.valence === "number") sample.arduinoValence = obj.valence;
      lastFrame = sample;
      return sample;
    } catch (_) {
      return null; // 坏 JSON 行丢弃
    }
  }

  // 2) CSV 行：hr,gsr,rmssd[,valence]，如 "72.5,1.23,45.0,0.6"
  const parts = text.split(",").map((p) => p.trim());
  if (parts.length >= 3) {
    const nums = parts.map((p) => (p === "" ? NaN : Number(p)));
    const hr = Number.isFinite(nums[0]) ? nums[0] : lastFrame?.hr;
    const gsr = Number.isFinite(nums[1]) ? nums[1] : lastFrame?.gsr;
    const rmssd = Number.isFinite(nums[2]) ? nums[2] : lastFrame?.rmssd;
    if (hr === undefined || gsr === undefined || rmssd === undefined) return null;
    const sample = { hr, gsr, rmssd };
    // 第 4 个数字：Arduino 端估算欢愉度，仅透传记录
    if (parts.length >= 4 && Number.isFinite(nums[3])) {
      sample.arduinoValence = nums[3];
    }
    lastFrame = sample;
    return sample;
  }

  return null; // 无法识别的行丢弃
}

// ---------------- REST ----------------
app.get("/api/ports", async (_req, res) => {
  if (!SerialPort) return res.json([]);
  try {
    const ports = await SerialPort.list();
    res.json(ports.map((p) => ({ path: p.path, manufacturer: p.manufacturer || null })));
  } catch (e) {
    res.json([]); // 失败不崩溃
  }
});

app.get("/api/status", (_req, res) => {
  res.json({
    connected: state.connected,
    port: state.port,
    mode: state.mode,
    baselineReady: state.baselineReady,
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
  });
});

app.post("/api/connect", async (req, res) => {
  const { path } = req.body || {};
  if (!path || typeof path !== "string") {
    return res.status(400).json({ error: "缺少 path 参数" });
  }
  try {
    await connectSerial(path);
    res.json({ ok: true, connected: true, port: path, mode: state.mode });
  } catch (e) {
    // 连接失败：自动回落 mock 模式，避免停留在无数据的 idle 状态
    startMock();
    res.status(500).json({ ok: false, error: String(e.message || e), mode: state.mode });
  }
});

app.post("/api/disconnect", (_req, res) => {
  closeSerial();
  res.json({ ok: true, connected: false, mode: state.mode });
});

app.post("/api/mock", (req, res) => {
  const { enabled } = req.body || {};
  if (enabled) {
    startMock();
  } else {
    stopMock();
  }
  res.json({ ok: true, mode: state.mode, mockRunning: mock.isRunning() });
});

// ---------------- 启动 ----------------
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    // 已有后端实例在跑（比如常驻的 mock 后端）：静默复用，不拖垮同进程启动的 Vite
    console.warn(`[server] 端口 ${PORT} 已被占用，复用现有后端实例，此后端进程退出`);
    process.exit(0);
  }
  throw err;
});
server.listen(PORT, () => {
  console.log(`[server] REST + WS listening on http://localhost:${PORT} (ws path: /ws)`);
  // 默认启动即进入 mock 模式
  startMock();
  console.log("[server] mock 模式已启动（1Hz 拟真数据）");
});
}

main().catch((e) => {
  console.error("[server] 启动失败：", e);
  process.exit(1);
});
