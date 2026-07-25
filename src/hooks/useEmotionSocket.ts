import { useCallback, useEffect, useRef, useState } from "react";
import {
  MockSource,
  WebSerialSource,
  WsSource,
  type DataSource,
  type SourceKind,
} from "../lib/datasource";

export type { SampleMsg, StatusMsg } from "../lib/datasource";
import type { SampleMsg, StatusMsg } from "../lib/datasource";

export interface EmotionState {
  /** 数据通道是否活跃（WS 打开 / 串口已开 / mock 运行中） */
  live: boolean;
  sample: SampleMsg | null;
  status: StatusMsg | null;
  /** 当前数据源 */
  activeSource: SourceKind | null;
  /** 数据源切换中（如等待串口授权） */
  busy: boolean;
  /** 最近一次错误（如浏览器不支持 Web Serial） */
  error: string | null;
  /** 最近 60s 轨迹点（含到达时刻 ms） */
  trail: { v: number; a: number; at: number }[];
  /** 最近 60s 波形序列 */
  hrSeries: number[];
  gsrSeries: number[];
  rmssdSeries: number[];
}

export interface EmotionControls {
  startMock: () => void;
  connectArduino: () => void;
  /** 仅本地开发（import.meta.env.DEV）可用：切到后端 /ws */
  useWs: () => void;
}

const MAX_TRAIL_MS = 60_000;
const MAX_SERIES = 120;

/**
 * 统一数据源订阅：生产构建默认浏览器内 MockSource（绝不请求 /api、不连 /ws）；
 * 本地开发（DEV）默认 WsSource 消费后端推送。组件卸载时清理。
 */
export function useEmotionSocket(): EmotionState & EmotionControls {
  const [state, setState] = useState<EmotionState>({
    live: false,
    sample: null,
    status: null,
    activeSource: null,
    busy: false,
    error: null,
    trail: [],
    hrSeries: [],
    gsrSeries: [],
    rmssdSeries: [],
  });

  const sourceRef = useRef<DataSource | null>(null);
  const trailRef = useRef<EmotionState["trail"]>([]);
  const hrRef = useRef<number[]>([]);
  const gsrRef = useRef<number[]>([]);
  const rmssdRef = useRef<number[]>([]);

  const activate = useCallback(async (kind: SourceKind) => {
    // 停掉旧源、清空缓冲与展示状态
    const prev = sourceRef.current;
    sourceRef.current = null;
    await prev?.stop?.();
    trailRef.current = [];
    hrRef.current = [];
    gsrRef.current = [];
    rmssdRef.current = [];

    const callbacks = {
      onSample(msg: SampleMsg) {
        const now = Date.now();
        trailRef.current.push({ v: msg.valence, a: msg.arousal, at: now });
        const cutoff = now - MAX_TRAIL_MS;
        while (trailRef.current.length && trailRef.current[0].at < cutoff)
          trailRef.current.shift();
        hrRef.current.push(msg.hr);
        gsrRef.current.push(msg.gsr);
        rmssdRef.current.push(msg.rmssd);
        if (hrRef.current.length > MAX_SERIES) hrRef.current.shift();
        if (gsrRef.current.length > MAX_SERIES) gsrRef.current.shift();
        if (rmssdRef.current.length > MAX_SERIES) rmssdRef.current.shift();
        setState((s) => ({
          ...s,
          sample: msg,
          trail: [...trailRef.current],
          hrSeries: [...hrRef.current],
          gsrSeries: [...gsrRef.current],
          rmssdSeries: [...rmssdRef.current],
        }));
      },
      onStatus(msg: StatusMsg) {
        setState((s) => ({ ...s, status: msg }));
      },
      onLive(live: boolean) {
        setState((s) => ({ ...s, live }));
      },
    };

    const source: DataSource =
      kind === "mock"
        ? new MockSource(callbacks)
        : kind === "serial"
          ? new WebSerialSource(callbacks)
          : new WsSource(callbacks);

    sourceRef.current = source;
    setState((s) => ({
      ...s,
      live: false,
      sample: null,
      status: null,
      activeSource: kind,
      busy: true,
      error: null,
      trail: [],
      hrSeries: [],
      gsrSeries: [],
      rmssdSeries: [],
    }));

    try {
      await source.start();
    } catch (e) {
      // 仅当本次激活仍是当前源时才回填错误（避免竞态覆盖新源）
      if (sourceRef.current === source) {
        sourceRef.current = null;
        setState((s) => ({
          ...s,
          activeSource: null,
          error: e instanceof Error ? e.message : String(e),
        }));
      }
    } finally {
      setState((s) => (s.busy ? { ...s, busy: false } : s));
    }
  }, []);

  // 初始数据源：DEV 用本地后端 WS；PROD（线上静态站点）用浏览器内 mock
  useEffect(() => {
    activate(import.meta.env.DEV ? "ws" : "mock");
    return () => {
      const s = sourceRef.current;
      sourceRef.current = null;
      void s?.stop?.();
    };
  }, [activate]);

  return {
    ...state,
    startMock: () => void activate("mock"),
    connectArduino: () => void activate("serial"),
    useWs: () => void activate("ws"),
  };
}

/** 象限判定词（与共享 mapping.core.mjs 阈值一致 ±0.15；UI 为全英文标签） */
export function quadrantLabel(v: number, a: number): string {
  if (Math.abs(v) < 0.15 && Math.abs(a) < 0.15) return "STEADY";
  if (v >= 0 && a >= 0) return "EXCITED";
  if (v < 0 && a >= 0) return "TENSE";
  if (v < 0 && a < 0) return "LOW";
  return "CALM";
}
