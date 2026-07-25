import type { StatusMsg, SampleMsg } from "../hooks/useEmotionSocket";
import type { SourceKind } from "../lib/datasource";

interface Props {
  status: StatusMsg | null;
  sample: SampleMsg | null;
  live: boolean;
  activeSource: SourceKind | null;
  busy: boolean;
  error: string | null;
  onStartMock: () => void;
  onConnectArduino: () => void;
  /** 仅本地开发（DEV）传入：切到后端 /ws */
  onUseWs?: () => void;
}

const btnBase =
  "h-9 shrink-0 border px-4 text-xs font-medium transition-colors disabled:opacity-40";

/**
 * 连接控制条（sticky）：状态灯 + 模式文字 + 数据源切换。
 * 线上（无后端）：「模拟演示」（默认自动开始）/「连接 Arduino」（Web Serial 直连）。
 * 本地开发（import.meta.env.DEV）：额外保留「本地后端 (WS)」入口。
 */
export default function ControlBar({
  status,
  sample,
  live,
  activeSource,
  busy,
  error,
  onStartMock,
  onConnectArduino,
  onUseWs,
}: Props) {
  const mode = sample?.mode ?? status?.mode ?? "idle";
  const baselineReady = sample?.baselineReady ?? status?.baselineReady ?? false;
  const running = activeSource !== null && (mode === "mock" || status?.connected || live);
  const calibrating = running && !baselineReady;
  const calibRemaining = calibrating && sample ? Math.max(0, 30 - sample.t) : null;

  // 状态灯
  let dotColor = "rgba(20,20,18,0.3)";
  let dotCls = "";
  let modeText = "Disconnected";
  if (calibrating) {
    dotColor = "#141412";
    dotCls = "calib-blink";
    modeText = `Calibrating${calibRemaining != null ? ` ${calibRemaining}s` : ""}`;
  } else if (mode === "serial") {
    dotColor = "#E0573A";
    dotCls = "live-pulse";
    modeText = "Live serial · Web Serial";
  } else if (mode === "mock") {
    dotColor = "#3A6FC0";
    modeText = activeSource === "ws" ? "Mock demo · backend" : "Mock demo";
  } else if (activeSource === "ws" && live) {
    dotColor = "#3A6FC0";
    modeText = "Backend live";
  }

  const activeBtn = { background: "var(--ink)", color: "#FAFAF7", borderColor: "var(--ink)" };
  const idleBtn = { borderColor: "var(--line-hi)", color: "var(--ink-2)" };

  return (
    <div className="control-bar sticky top-0 z-40 border-b" style={{ borderColor: "var(--line)" }}>
      <div className="mx-auto flex min-h-14 max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-1 px-6 py-1.5">
        {/* 左：状态灯 + 模式 */}
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`inline-block h-2 w-2 shrink-0 rounded-full ${dotCls}`}
            style={{ background: dotColor }}
          />
          <span className="truncate text-sm" style={{ color: "var(--ink-2)" }} aria-live="polite">
            {modeText}
          </span>
          {activeSource === "ws" && !live && (
            <span className="font-mono-num text-xs" style={{ color: "var(--ink-3)" }}>
              WS reconnecting…
            </span>
          )}
          {error && (
            <span role="alert" className="truncate text-xs" style={{ color: "var(--q-tense-ink)" }}>
              {error}
            </span>
          )}
        </div>

        <div className="mx-2 hidden h-5 w-px sm:block" style={{ background: "var(--line)" }} />

        {/* 右：数据源切换 */}
        <div className="flex min-w-0 items-center gap-2">
          <button
            disabled={busy || activeSource === "mock"}
            onClick={onStartMock}
            className={btnBase}
            style={activeSource === "mock" ? activeBtn : idleBtn}
          >
            Mock demo
          </button>
          <button
            disabled={busy || activeSource === "serial"}
            onClick={onConnectArduino}
            className={btnBase}
            style={activeSource === "serial" ? activeBtn : idleBtn}
          >
            Connect Arduino
          </button>
          {onUseWs && (
            <button
              disabled={busy || activeSource === "ws"}
              onClick={onUseWs}
              className={btnBase}
              style={activeSource === "ws" ? activeBtn : idleBtn}
              title="Dev mode: connect to the local backend at localhost:8100"
            >
              Local backend (WS)
            </button>
          )}
        </div>

        <div className="flex-1" />
      </div>
    </div>
  );
}
