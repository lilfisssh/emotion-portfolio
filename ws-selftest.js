// 自检脚本：连接 ws://localhost:8100/ws 观察 70 秒
// 打印：连接即时的 status、前 3 条 sample、静息段/紧张段代表样本、
// valence/arousal 范围校验、紧张段 arousal 最大值。
const WebSocket = require("ws");

const ws = new WebSocket("ws://localhost:8100/ws");
let sampleCount = 0;
let restSample = null; // 静息段代表（t≈20，基线未满）
let restReadySample = null; // 基线刚就绪后（t≈35，仍在静息尾/过渡）
let stressSamples = []; // 紧张段样本 t 45-60
let minV = 1, maxV = -1, minA = 1, maxA = -1;
let maxStressArousal = -1, maxStressPoint = null;
let outOfRange = 0;
const startTime = Date.now();

ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === "status") {
    console.log("[status]", JSON.stringify(msg));
    return;
  }
  if (msg.type !== "sample") return;
  sampleCount++;
  if (sampleCount <= 3) console.log(`[first-${sampleCount}]`, JSON.stringify(msg));

  if (msg.valence < -1 || msg.valence > 1 || msg.arousal < -1 || msg.arousal > 1) outOfRange++;
  minV = Math.min(minV, msg.valence); maxV = Math.max(maxV, msg.valence);
  minA = Math.min(minA, msg.arousal); maxA = Math.max(maxA, msg.arousal);

  if (msg.t === 20) restSample = msg;
  if (msg.t === 35) restReadySample = msg;
  if (msg.t >= 45 && msg.t <= 62) {
    stressSamples.push(msg);
    if (msg.arousal > maxStressArousal) { maxStressArousal = msg.arousal; maxStressPoint = msg; }
  }
});

ws.on("open", () => console.log("[ws] connected"));

setTimeout(() => {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n===== ${elapsed}s 观察总结 =====`);
  console.log("样本总数:", sampleCount, "（≈1Hz）");
  console.log("越界样本数:", outOfRange);
  console.log(`valence 范围: [${minV.toFixed(3)}, ${maxV.toFixed(3)}]`);
  console.log(`arousal 范围: [${minA.toFixed(3)}, ${maxA.toFixed(3)}]`);
  console.log("\n[静息段样本 t=20]", JSON.stringify(restSample));
  console.log("[基线就绪后静息样本 t=35]", JSON.stringify(restReadySample));
  console.log("\n[紧张段 arousal 峰值样本]", JSON.stringify(maxStressPoint));
  const late = stressSamples.filter(s => s.t >= 55);
  if (late.length) {
    const avgA = late.reduce((a,s)=>a+s.arousal,0)/late.length;
    const avgV = late.reduce((a,s)=>a+s.valence,0)/late.length;
    console.log(`[紧张段 t55-62 平均] valence=${avgV.toFixed(3)} arousal=${avgA.toFixed(3)}`);
  }
  ws.close();
  process.exit(0);
}, 70000);
