/**
 * mapping.core.mjs —— 生理信号 → Russell 二维情绪平面映射器（共享实现，纯 ESM）
 *
 * 单一事实来源：前端（Vite 直接打包）与后端（CommonJS 动态 import）共用本文件。
 * 任何常数/行为修改必须在此进行，禁止在任一端复制实现。
 *
 * 契约：
 *   createMapper() => {
 *     push(sample) => { valence, arousal, baselineReady },
 *     reset(),
 *     quadrantLabel(point) => 中文标签
 *   }
 *
 * sample = { hr (bpm), gsr (μS), rmssd (ms), t (秒) }
 *
 * 规则：
 * - 基线：连接后前 30 秒静息均值（按 1Hz 样本计数，满 30 个样本即基线就绪）；
 *   基线未满时 baselineReady=false，valence/arousal 输出 0。
 * - Arousal = clamp(0.6 * 归一化(HR 相对基线偏离) + 0.4 * 归一化(GSR 相对基线偏离), -1, 1)。
 * - Valence = clamp(归一化(RMSSD 相对基线偏离), -1, 1)。
 *   注意：RMSSD→valence 是弱代理估算（HRV 与情绪效价的相关性较弱），
 *   仅作演示用途，不具临床意义。
 * - 平滑：对 valence/arousal 输出做 5 样本（≈5 秒）滑动平均。
 * - 映射计算统一用本模块；Arduino 自算的 valence 不采用（仅透传记录）。
 */

const BASELINE_SECONDS = 30; // 基线时长（秒，1Hz 下即样本数）
const SMOOTH_WINDOW = 5; // 输出滑动平均窗口（样本数 ≈ 秒）

// 归一化：相对基线的"相对偏离"（百分比）归一化。
// 校准记录 v1：绝对满量程（HR 30/GSR 1.5/RMSSD 25）过紧，mock 紧张段两轴打满贴边。
// 校准记录 v2：放宽到 HR 45/GSR 3.0/RMSSD 40 后，真实 Arduino 输出 GSR 为 ADC
// 原始值（~200+ 而非 μS 级）、RMSSD 达数百 ms，绝对量程失效，两轴再次钉死 ±1。
// 改为相对基线的百分比偏离后，与传感器单位/量纲无关：ADC 值与物理值同样适用。
// 校准记录 v3：按用户实测常态（HR 83 / GSR 223 ADC / RMSSD 615）收紧量程——
// v2 对该动态范围太宽，紧张段 HR +24% 仅推出 0.36 唤醒度，点趴在中心。
// 现量程：紧张（HR+24%、GSR+45%）→ a≈0.6；放松（RMSSD+30%）→ v≈+0.5；
// GSR 日常噪声 ±22% 经 0.4 权重 + 5s 平滑后抖动 ≈0.1，可接受。
// FLOOR 防止基线过小时分母爆炸。
const HR_REL_SCALE = 0.4; // HR 偏离基线 ±40% ≈ 满量程（83→116 bpm）
const GSR_REL_SCALE = 0.8; // GSR 偏离基线 ±80% ≈ 满量程（223→400 ADC）
const RMSSD_REL_SCALE = 0.6; // RMSSD 偏离基线 ±60% ≈ 满量程（615→±370 ms）
const HR_FLOOR = 20; // bpm，基线过小时的绝对分母下限
const GSR_FLOOR = 0.3; // 基线过小时的绝对分母下限（与 GSR 同单位）
const RMSSD_FLOOR = 20; // ms，基线过小时的绝对分母下限

const W_HR = 0.6;
const W_GSR = 0.4;

// 象限判定阈值：|v| 与 |a| 均小于该值视为"平稳"
const NEUTRAL_THRESHOLD = 0.15;

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function createMapper() {
  let baselineSamples = []; // 基线期收集的原始样本
  let baseline = null; // 基线均值 { hr, gsr, rmssd }，null = 未就绪
  let outWindow = []; // 最近 5 个输出点 { valence, arousal }，用于平滑

  /**
   * 推入一个样本 { hr, gsr, rmssd, t }
   * 返回 { valence, arousal, baselineReady }
   */
  function push(sample) {
    const { hr, gsr, rmssd } = sample;
    if (
      typeof hr !== "number" ||
      typeof gsr !== "number" ||
      typeof rmssd !== "number" ||
      !Number.isFinite(hr) ||
      !Number.isFinite(gsr) ||
      !Number.isFinite(rmssd)
    ) {
      // 坏样本不污染状态
      return currentOutput();
    }

    if (!baseline) {
      baselineSamples.push({ hr, gsr, rmssd });
      if (baselineSamples.length >= BASELINE_SECONDS) {
        baseline = {
          hr: mean(baselineSamples.map((s) => s.hr)),
          gsr: mean(baselineSamples.map((s) => s.gsr)),
          rmssd: mean(baselineSamples.map((s) => s.rmssd)),
        };
        baselineSamples = [];
      }
      return { valence: 0, arousal: 0, baselineReady: false };
    }

    // 相对基线的相对偏离（百分比），按各自满量程比例归一化，分母带下限保护
    const devHr =
      (hr - baseline.hr) / Math.max(Math.abs(baseline.hr) * HR_REL_SCALE, HR_FLOOR);
    const devGsr =
      (gsr - baseline.gsr) / Math.max(Math.abs(baseline.gsr) * GSR_REL_SCALE, GSR_FLOOR);
    const devRmssd =
      (rmssd - baseline.rmssd) /
      Math.max(Math.abs(baseline.rmssd) * RMSSD_REL_SCALE, RMSSD_FLOOR);

    const arousal = clamp(W_HR * devHr + W_GSR * devGsr, -1, 1);
    const valence = clamp(devRmssd, -1, 1);

    // 5 样本滑动平均平滑输出
    outWindow.push({ valence, arousal });
    if (outWindow.length > SMOOTH_WINDOW) outWindow.shift();

    return {
      valence: mean(outWindow.map((p) => p.valence)),
      arousal: mean(outWindow.map((p) => p.arousal)),
      baselineReady: true,
    };
  }

  function currentOutput() {
    return baseline
      ? { valence: 0, arousal: 0, baselineReady: true }
      : { valence: 0, arousal: 0, baselineReady: false };
  }

  /** 重置基线与平滑窗口（切换数据源 / 重连串口时调用） */
  function reset() {
    baselineSamples = [];
    baseline = null;
    outWindow = [];
  }

  /**
   * 象限标签（Russell 平面，阈值 ±0.15）：
   * 右上(高唤醒+积极)=兴奋/愉悦；左上=紧张/焦虑；左下=低落/疲倦；右下=放松/平静；
   * 两轴均接近 0 = 平稳。
   * @param {{valence:number, arousal:number}} point
   * @returns {string} 中文标签
   */
  function quadrantLabel(point) {
    const { valence, arousal } = point;
    if (Math.abs(valence) < NEUTRAL_THRESHOLD && Math.abs(arousal) < NEUTRAL_THRESHOLD) {
      return "平稳";
    }
    if (valence >= 0 && arousal >= 0) return "兴奋/愉悦";
    if (valence < 0 && arousal >= 0) return "紧张/焦虑";
    if (valence < 0 && arousal < 0) return "低落/疲倦";
    return "放松/平静";
  }

  return { push, reset, quadrantLabel };
}
