import type { CSSProperties } from "react";
import ControlBar from "./components/ControlBar";
import EmotionPlane from "./components/EmotionPlane";
import MoodField from "./components/MoodField";
import Waveform from "./components/Waveform";
import { useEmotionSocket, quadrantLabel } from "./hooks/useEmotionSocket";
import { dataTransition } from "./lib/motion";

const T = {
  line: "var(--line)",
  ink: "var(--ink)",
  ink2: "var(--ink-2)",
  ink3: "var(--ink-3)",
};

function quadInk(v: number, a: number): string {
  if (a >= 0 && v >= 0) return "var(--q-excite-ink)";
  if (a >= 0 && v < 0) return "var(--q-tense-ink)";
  if (a < 0 && v < 0) return "var(--q-low-ink)";
  return "var(--q-calm-ink)";
}

function Eyebrow({ n, en }: { n: string; en: string }) {
  return (
    <div
      className="font-mono-num text-[12px] font-medium"
      style={{ color: T.ink3, letterSpacing: "0.18em" }}
    >
      {n} — {en}
    </div>
  );
}

export default function App() {
  const {
    live,
    sample,
    status,
    trail,
    hrSeries,
    gsrSeries,
    rmssdSeries,
    activeSource,
    busy,
    error,
    startMock,
    connectArduino,
    useWs,
  } = useEmotionSocket();

  const v = sample?.valence ?? 0;
  const a = sample?.arousal ?? 0;
  const label = sample ? quadrantLabel(v, a) : "—";
  const calibrating = sample ? !sample.baselineReady : false;
  const calibRemaining = calibrating && sample ? Math.max(0, 30 - sample.t) : null;
  const qc = quadInk(v, a);
  // 无样本时不用象限色渲染"—"（最空的状态不该穿最激动的颜色）
  const word = calibrating ? "SENSING" : sample ? label : live ? "SENSING" : "OFFLINE";
  const wordColor = sample ? qc : T.ink3;

  const signals = [
    { name: "Heart Rate", unit: "bpm", value: sample?.hr ?? null, digits: 0, series: hrSeries, color: "#E0573A" },
    { name: "Skin Conduct.", unit: "μS", value: sample?.gsr ?? null, digits: 2, series: gsrSeries, color: "#1F9E78" },
    { name: "HRV · RMSSD", unit: "ms", value: sample?.rmssd ?? null, digits: 1, series: rmssdSeries, color: "#3A6FC0" },
  ];

  return (
    <div className="void-grain min-h-screen" style={{ background: "var(--porcelain)" }}>
      <MoodField point={sample && !calibrating ? { v, a } : null} />

      <div className="above-field">
        <ControlBar
          status={status}
          sample={sample}
          live={live}
          activeSource={activeSource}
          busy={busy}
          error={error}
          onStartMock={startMock}
          onConnectArduino={connectArduino}
          onUseWs={import.meta.env.DEV ? useWs : undefined}
        />

        {/* ── At a glance: title + live data + signals + borderless plane ── */}
        <header className="mx-auto grid max-w-[1280px] grid-cols-1 gap-10 px-6 pb-16 pt-12 lg:grid-cols-12 lg:gap-6 lg:pt-16">
          {/* Left: title + live readings + raw signals */}
          <div className="flex flex-col lg:col-span-5">
            <div className="reveal flex items-baseline justify-between gap-6">
              <Eyebrow n="EMOTIONAL WEATHER" en="REAL-TIME BIO-SIGNAL" />
              <span className="font-mono-num text-[12px]" style={{ color: T.ink3 }}>
                {live ? "● LIVE" : "○ OFFLINE"}
              </span>
            </div>

            <h1
              className="font-black-display reveal reveal-d1 mt-8 uppercase leading-[0.92]"
              style={{ fontSize: "clamp(44px, 5.8vw, 80px)", color: T.ink, letterSpacing: "0.01em" }}
            >
              Emotional
              <br />
              <span style={{ color: qc, transition: dataTransition("color 1.2s ease") }}>Weather</span>
            </h1>
            <p className="font-accent reveal reveal-d2 mt-5" style={{ fontSize: 19, color: T.ink2 }}>
              your body is quietly repainting this sky.
            </p>
            <p className="font-display reveal reveal-d2 mt-2 font-medium" style={{ fontSize: 14, color: T.ink3 }}>
              PPG heart rate × GSR skin conductance × Russell's circumplex
            </p>

            {/* Current mood: oversized word, same color as the plane point */}
            <div className="reveal reveal-d3 mt-10">
              <div className="font-mono-num text-[12px]" style={{ color: T.ink3, letterSpacing: "0.18em" }}>
                RIGHT NOW
              </div>
              <div
                key={word}
                className="mood-word mt-1 leading-none"
                style={{ fontSize: "clamp(56px, 6vw, 84px)", color: wordColor, transition: dataTransition("color 1.2s ease") }}
                aria-label={word}
                role="status"
              >
                {word.split("").map((ch, i) => {
                  // 伪随机粒子抖动：情绪越激动，字母晃得越开
                  const seed = (ch.charCodeAt(0) * 7 + i * 13) % 10;
                  const r1 = Math.sin(seed * 12.9898) * 0.5 + Math.sin(i * 3.7) * 0.5;
                  const r2 = Math.cos(seed * 78.233) * 0.5 + Math.cos(i * 2.3) * 0.5;
                  const amp = 1.5 + Math.abs(a) * 5;
                  const rot = r2 * (0.6 + Math.abs(a) * 2.4);
                  return (
                    <span
                      key={i}
                      aria-hidden="true"
                      style={{
                        display: "inline-block",
                        transform: `translate(${(r1 * amp).toFixed(1)}px, ${(r2 * amp * 0.7).toFixed(1)}px) rotate(${rot.toFixed(2)}deg)`,
                        transition: dataTransition("transform 1.2s ease"),
                      }}
                    >
                      <span className="mood-letter" style={{ "--i": i } as CSSProperties}>
                        {ch}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Raw signals: compact rows, hairline separators, no boxes */}
            <div className="mt-8">
              {signals.map((s) => (
                <div
                  key={s.name}
                  className="flex items-center gap-4 border-t py-3"
                  style={{ borderColor: T.line }}
                >
                  <div className="w-24 shrink-0 text-xs" style={{ color: T.ink3 }}>
                    {s.name}
                  </div>
                  <div className="flex w-28 shrink-0 items-baseline gap-1">
                    <span className="font-mono-num text-2xl font-medium" style={{ color: T.ink }}>
                      {s.value == null ? "--" : s.value.toFixed(s.digits)}
                    </span>
                    <span className="text-[11px]" style={{ color: T.ink3 }}>{s.unit}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <Waveform series={s.series} height={32} color={s.color} />
                  </div>
                </div>
              ))}
              {/* Valence / Arousal: right under the raw data */}
              <div className="flex gap-10 border-t py-4" style={{ borderColor: T.line }}>
                <div>
                  <div className="font-mono-num text-[11px]" style={{ color: T.ink3 }}>VALENCE</div>
                  <div className="font-mono-num mt-1 text-2xl" style={{ color: T.ink }}>
                    {calibrating ? "--" : v.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="font-mono-num text-[11px]" style={{ color: T.ink3 }}>AROUSAL</div>
                  <div className="font-mono-num mt-1 text-2xl" style={{ color: T.ink }}>
                    {calibrating ? "--" : a.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: borderless emotion plane blending into the field */}
          <div className="relative lg:col-span-7">
            <EmotionPlane
              trail={trail}
              baselineReady={!calibrating}
              baselineRemaining={calibRemaining}
            />
            <div className="pointer-events-none absolute bottom-1 left-0 right-0 flex justify-between font-mono-num text-[11px]" style={{ color: T.ink3 }}>
              <span>Valence →</span>
              <span>↑ Arousal</span>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1280px] px-6">
          {/* ── Method ── */}
          <section className="border-t py-20 md:py-24" style={{ borderColor: T.line }}>
            <Eyebrow n="METHOD" en="MAPPING & ARCHITECTURE" />
            <h2
              className="font-black-display mt-4 uppercase leading-[1]"
              style={{ fontSize: "clamp(28px, 4vw, 44px)", color: T.ink }}
            >
              How it works
            </h2>

            <div className="mt-10 grid grid-cols-1 gap-12 lg:grid-cols-2">
              <div>
                <h3 className="font-display text-xl font-bold" style={{ color: T.ink }}>
                  Signal → emotion coordinates
                </h3>
                <dl className="mt-5 space-y-5 text-[15px] leading-[1.8]" style={{ color: T.ink2 }}>
                  <div>
                    <dt className="font-mono-num text-xs" style={{ color: T.ink3, letterSpacing: "0.14em" }}>AROUSAL</dt>
                    <dd className="mt-1">
                      Weighted, baseline-normalized deviation of HR and GSR:
                      <span className="font-mono-num" style={{ color: T.ink }}> 0.6 × HR + 0.4 × GSR</span>,
                      mapped to [-1, 1].
                    </dd>
                  </div>
                  <div>
                    <dt className="font-mono-num text-xs" style={{ color: T.ink3, letterSpacing: "0.14em" }}>VALENCE</dt>
                    <dd className="mt-1">
                      Baseline-normalized RMSSD (heart-rate variability), mapped to [-1, 1].
                    </dd>
                    <dd
                      className="mt-2 text-sm"
                      style={{ color: "var(--q-tense-ink)" }}
                    >
                      <span className="font-mono-num text-[11px]" style={{ letterSpacing: "0.14em" }}>
                        NOTE ·{" "}
                      </span>
                      HRV is a weak proxy for valence — this is a demo,
                      not a clinical measurement.
                    </dd>
                  </div>
                  <div>
                    <dt className="font-mono-num text-xs" style={{ color: T.ink3, letterSpacing: "0.14em" }}>BASELINE & SMOOTHING</dt>
                    <dd className="mt-1">
                      The first 30 seconds after connect set the resting baseline;
                      output is smoothed with a 5-second sliding window.
                      All mapping runs on the backend — the page only renders.
                    </dd>
                  </div>
                </dl>
              </div>

              <div>
                <h3 className="font-display text-xl font-bold" style={{ color: T.ink }}>
                  Architecture
                </h3>
                <svg viewBox="0 0 520 150" className="mt-5 w-full" fill="none">
                  {[
                    { x: 0, label: "Arduino", sub: "PPG + GSR" },
                    { x: 190, label: "Backend", sub: "Node · :8100" },
                    { x: 380, label: "This page", sub: "React · live" },
                  ].map((n) => (
                    <g key={n.label}>
                      <rect x={n.x} y={40} width={140} height={64} stroke="rgba(20,20,18,0.3)" strokeWidth={1} fill="rgba(255,255,255,0.55)" />
                      <text x={n.x + 70} y={68} textAnchor="middle" fill="#141412" fontSize={14} fontFamily="Inter, sans-serif">
                        {n.label}
                      </text>
                      <text x={n.x + 70} y={88} textAnchor="middle" fill="rgba(20,20,18,0.45)" fontSize={11} fontFamily="JetBrains Mono, monospace">
                        {n.sub}
                      </text>
                    </g>
                  ))}
                  <g stroke="#141412" strokeWidth={1.5}>
                    <path d="M142 72h44" />
                    <path d="M186 72l-8-4v8z" fill="#141412" stroke="none" />
                    <path d="M332 72h44" />
                    <path d="M376 72l-8-4v8z" fill="#141412" stroke="none" />
                  </g>
                  <text x={164} y={60} textAnchor="middle" fill="rgba(20,20,18,0.45)" fontSize={10} fontFamily="JetBrains Mono, monospace">
                    serial 115200
                  </text>
                  <text x={354} y="60" textAnchor="middle" fill="rgba(20,20,18,0.45)" fontSize={10} fontFamily="JetBrains Mono, monospace">
                    WS /ws
                  </text>
                </svg>
                <ul className="mt-5 space-y-2 text-sm leading-[1.8]" style={{ color: T.ink2 }}>
                  <li className="flex gap-2">
                    <span style={{ color: T.ink3 }}>·</span>
                    Arduino prints one JSON per line:
                    <code className="font-mono-num text-xs" style={{ color: T.ink }}>{"{\"hr\":72.5,\"gsr\":1.23,\"rmssd\":45.0}"}</code>
                  </li>
                  <li className="flex gap-2">
                    <span style={{ color: T.ink3 }}>·</span>
                    WebSocket pushes a sample + emotion point every second;
                    a built-in mock generator covers no-hardware demos.
                  </li>
                  <li className="flex gap-2">
                    <span style={{ color: T.ink3 }}>·</span>
                    Auto-reconnect with backoff; trail and waveforms keep the last 60 seconds.
                  </li>
                </ul>
              </div>
            </div>
          </section>
        </main>

        <footer className="border-t py-10" style={{ borderColor: T.line }}>
          <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-6 font-mono-num text-xs" style={{ color: T.ink3 }}>
            <span>EMOTIONAL WEATHER · Arduino + PPG + GSR</span>
            <span>valence is a weak HRV proxy · demo only</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
