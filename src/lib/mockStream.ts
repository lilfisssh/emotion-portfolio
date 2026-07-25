/**
 * mockStream.ts —— 浏览器端拟真生理数据发生器（移植自 server/lib/mock.js，逻辑一致）
 *
 * 1Hz（setInterval 1000ms）推送样本，循环剧本（默认每周期 90 秒）：
 *   0–30s   静息基线：HR ~68、GSR ~1.2、RMSSD ~45
 *   30–60s  紧张：HR 84、GSR 1.75、RMSSD 25
 *   60–90s  恢复放松：HR 64、GSR 0.9、RMSSD 60
 * 阶段间用余弦平滑过渡（无阶跃跳变），叠加高斯噪声与呼吸性慢波动。
 */

export interface MockSample {
  hr: number;
  gsr: number;
  rmssd: number;
}

export interface MockStream {
  start(): void;
  stop(): void;
  reset(): void;
  isRunning(): boolean;
}

// 各阶段目标值（与 server/lib/mock.js 保持一致）
const PHASES = [
  { dur: 30, hr: 68, gsr: 1.2, rmssd: 45 }, // 静息基线
  { dur: 30, hr: 84, gsr: 1.75, rmssd: 25 }, // 紧张
  { dur: 30, hr: 64, gsr: 0.9, rmssd: 60 }, // 恢复放松
];

// 阶段过渡时长（秒），在阶段边界做余弦平滑过渡
const TRANSITION = 6;

function gauss(): number {
  // Box-Muller 高斯噪声
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function smoothstep(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return 0.5 - 0.5 * Math.cos(Math.PI * t);
}

/**
 * 创建 mock 数据流
 * @param onSample 每秒回调
 * @param opts cycleSec 可缩短周期用于加速自测
 */
export function createMockStream(
  onSample: (sample: MockSample) => void,
  opts: { cycleSec?: number } = {},
): MockStream {
  const scale = opts.cycleSec ? opts.cycleSec / 90 : 1;
  const phases = PHASES.map((p) => ({ ...p, dur: Math.max(2, Math.round(p.dur * scale)) }));
  const transition = Math.max(1, Math.round(TRANSITION * scale));
  const total = phases.reduce((a, p) => a + p.dur, 0);

  let t = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  // 第 t 秒的目标值（含阶段间平滑过渡）
  function targetAt(sec: number): MockSample {
    const s = sec % total;
    let acc = 0;
    for (let i = 0; i < phases.length; i++) {
      const p = phases[i];
      if (s < acc + p.dur) {
        // 阶段开头 transition 秒从上一阶段平滑过渡（保证每段平台期完整，尤其基线段）
        const prev = phases[(i - 1 + phases.length) % phases.length];
        const elapsed = s - acc;
        if (i > 0 && elapsed < transition) {
          const k = smoothstep(elapsed / transition);
          return {
            hr: prev.hr + (p.hr - prev.hr) * k,
            gsr: prev.gsr + (p.gsr - prev.gsr) * k,
            rmssd: prev.rmssd + (p.rmssd - prev.rmssd) * k,
          };
        }
        return { hr: p.hr, gsr: p.gsr, rmssd: p.rmssd };
      }
      acc += p.dur;
    }
    const last = phases[phases.length - 1];
    return { hr: last.hr, gsr: last.gsr, rmssd: last.rmssd };
  }

  function tick() {
    const tgt = targetAt(t);
    // 慢波动（模拟呼吸性窦性心律不齐）+ 高斯噪声
    const slow = Math.sin((t / 7) * Math.PI * 2);
    const sample: MockSample = {
      hr: Math.max(45, tgt.hr + slow * 1.5 + gauss() * 1.5),
      gsr: Math.max(0.1, tgt.gsr + slow * 0.05 + gauss() * 0.05),
      rmssd: Math.max(5, tgt.rmssd + slow * 3 + gauss() * 2.5),
    };
    t += 1;
    onSample(sample);
  }

  return {
    start() {
      if (timer) return;
      timer = setInterval(tick, 1000);
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    reset() {
      t = 0;
    },
    isRunning() {
      return !!timer;
    },
  };
}
