/**
 * datasource.ts —— 浏览器端数据源抽象
 *
 * 三种源统一回调推送与后端 WS 契约同构的消息：
 *   { type:"sample", t, hr, gsr, rmssd, valence, arousal, mode, baselineReady }
 *   { type:"status", connected, port, mode }
 *
 * - MockSource：浏览器内生成拟真数据（生产/线上默认，无需后端）。
 * - WebSerialSource：Web Serial API 直连 Arduino（115200 baud，按行解析 JSON），
 *   浏览器内用共享 mapper 自算 valence/arousal；不支持时给出友好中文错误。
 * - WsSource：连接 /ws 消费本地后端推送（仅本地全栈开发模式使用）。
 *
 * Mock/WebSerial 源的 valence/arousal 由共享实现 src/lib/mapping.core.mjs 计算，
 * 与后端逐常数一致。
 */

import { createMapper, type Mapper } from "./mapping";
import { createMockStream } from "./mockStream";

export interface SampleMsg {
  type: "sample";
  t: number;
  hr: number;
  gsr: number;
  rmssd: number;
  valence: number;
  arousal: number;
  mode: "serial" | "mock";
  baselineReady: boolean;
}

export interface StatusMsg {
  type: "status";
  connected: boolean;
  port: string | null;
  mode: "serial" | "mock" | "idle";
  baselineReady?: boolean;
}

export type SourceKind = "mock" | "serial" | "ws";

export interface DataSource {
  readonly kind: SourceKind;
  start(): Promise<void> | void;
  stop(): Promise<void> | void;
}

export interface SourceCallbacks {
  onSample(msg: SampleMsg): void;
  onStatus(msg: StatusMsg): void;
  /** 数据通道是否活跃（WS 打开 / 串口已开 / mock 运行中） */
  onLive(live: boolean): void;
}

// ---------- 浏览器内自算 valence/arousal 的公共基类 ----------
abstract class MappedSource implements DataSource {
  abstract readonly kind: SourceKind;
  protected mapper: Mapper = createMapper();
  protected t = 0;

  constructor(protected cb: SourceCallbacks) {}

  abstract start(): Promise<void> | void;
  abstract stop(): Promise<void> | void;

  protected resetMapping() {
    this.mapper.reset();
    this.t = 0;
  }

  protected ingest(raw: { hr: number; gsr: number; rmssd: number }) {
    const mapped = this.mapper.push(raw);
    this.t += 1;
    this.cb.onSample({
      type: "sample",
      t: this.t,
      hr: raw.hr,
      gsr: raw.gsr,
      rmssd: raw.rmssd,
      valence: mapped.valence,
      arousal: mapped.arousal,
      mode: this.kind === "serial" ? "serial" : "mock",
      baselineReady: mapped.baselineReady,
    });
  }
}

// ---------- MockSource：浏览器内拟真发生器 ----------
export class MockSource extends MappedSource {
  readonly kind = "mock" as const;
  private stream = createMockStream((s) => this.ingest(s));

  start() {
    this.resetMapping();
    this.stream.reset();
    this.stream.start();
    this.cb.onStatus({ type: "status", connected: false, port: null, mode: "mock" });
    this.cb.onLive(true);
  }

  stop() {
    this.stream.stop();
    this.cb.onLive(false);
  }
}

// ---------- WebSerialSource：Web Serial 直连 Arduino ----------
interface BrowserSerialPort {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
}
interface BrowserSerial {
  requestPort(): Promise<BrowserSerialPort>;
}

export const SERIAL_UNSUPPORTED_MSG =
  "This browser does not support Web Serial, so it cannot connect to an Arduino directly. Please use Chrome / Edge over HTTPS or localhost — or switch to Mock demo.";

export function isWebSerialSupported(): boolean {
  return !!(navigator as Navigator & { serial?: BrowserSerial }).serial;
}

export class WebSerialSource extends MappedSource {
  readonly kind = "serial" as const;
  private port: BrowserSerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private stopped = false;

  async start() {
    const serial = (navigator as Navigator & { serial?: BrowserSerial }).serial;
    if (!serial) throw new Error(SERIAL_UNSUPPORTED_MSG);

    this.stopped = false;
    const port = await serial.requestPort(); // 用户取消会抛 NotFoundError，向上抛
    await port.open({ baudRate: 115200 });
    if (this.stopped) {
      await port.close().catch(() => {});
      return;
    }
    this.port = port;
    this.resetMapping();
    this.cb.onStatus({ type: "status", connected: true, port: "WebSerial", mode: "serial" });
    this.cb.onLive(true);

    const reader = port.readable?.getReader();
    if (!reader) throw new Error("Serial readable stream unavailable");
    this.reader = reader;

    const dec = new TextDecoder();
    let buf = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          buf += dec.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, idx);
            buf = buf.slice(idx + 1);
            this.handleLine(line);
          }
        }
      }
    } catch {
      // 读取出错（拔线等）：落入下方断线处理
    }
    if (!this.stopped) {
      this.cb.onStatus({ type: "status", connected: false, port: null, mode: "idle" });
      this.cb.onLive(false);
    }
  }

  /** 按行解析 {"hr":..,"gsr":..,"rmssd":..} JSON；坏行跳过不崩溃 */
  private handleLine(line: string) {
    const text = line.trim();
    if (!text || !text.startsWith("{")) return;
    let obj: unknown;
    try {
      obj = JSON.parse(text);
    } catch {
      return; // 坏行跳过
    }
    const o = obj as Record<string, unknown>;
    if (
      typeof o.hr !== "number" ||
      typeof o.gsr !== "number" ||
      typeof o.rmssd !== "number"
    ) {
      return;
    }
    this.ingest({ hr: o.hr, gsr: o.gsr, rmssd: o.rmssd });
  }

  async stop() {
    this.stopped = true;
    try {
      await this.reader?.cancel();
    } catch {}
    try {
      this.reader?.releaseLock();
    } catch {}
    this.reader = null;
    try {
      await this.port?.close();
    } catch {}
    this.port = null;
    this.cb.onStatus({ type: "status", connected: false, port: null, mode: "idle" });
    this.cb.onLive(false);
  }
}

// ---------- WsSource：本地全栈模式，消费后端 /ws 推送 ----------
export class WsSource implements DataSource {
  readonly kind = "ws" as const;
  private ws: WebSocket | null = null;
  private closed = false;
  private retry = 0;
  private timer: number | undefined;

  constructor(private cb: SourceCallbacks) {}

  start() {
    this.closed = false;
    this.retry = 0;
    this.connect();
  }

  private connect() {
    if (this.closed) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;

    ws.onopen = () => {
      this.retry = 0;
      this.cb.onLive(true);
    };
    ws.onmessage = (ev) => {
      let msg: SampleMsg | StatusMsg;
      try {
        msg = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      if (msg.type === "sample") this.cb.onSample(msg);
      else if (msg.type === "status") this.cb.onStatus(msg);
    };
    ws.onclose = () => {
      this.cb.onLive(false);
      if (this.closed) return;
      const delay = Math.min(1000 * 2 ** this.retry, 15_000); // 指数退避 1s→15s
      this.retry += 1;
      this.timer = window.setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => {
      ws.close();
    };
  }

  stop() {
    this.closed = true;
    if (this.timer) window.clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
    this.cb.onLive(false);
  }
}
