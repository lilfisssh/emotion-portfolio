/** 原始生理样本（1Hz） */
export interface PhysioSample {
  /** 心率 bpm */
  hr: number;
  /** 皮肤电导 μS（或 ADC 原始值，映射与量纲无关） */
  gsr: number;
  /** HRV RMSSD，ms */
  rmssd: number;
  /** 秒计数（可选，映射不依赖） */
  t?: number;
}

/** 一次映射输出 */
export interface MappedPoint {
  valence: number;
  arousal: number;
  baselineReady: boolean;
}

export interface Mapper {
  push(sample: PhysioSample): MappedPoint;
  reset(): void;
  /** 中文象限标签（阈值 ±0.15） */
  quadrantLabel(point: { valence: number; arousal: number }): string;
}

export function createMapper(): Mapper;
