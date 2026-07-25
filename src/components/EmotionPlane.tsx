import { useEffect, useRef } from "react";
import { reducedMotion } from "../lib/motion";

const C = {
  line: "rgba(20,20,18,0.16)",
  lineHi: "rgba(20,20,18,0.55)",
  tick: "rgba(20,20,18,0.5)",
  ink: "#141412",
  qExcite: "#E0573A",
  qTense: "#7A4FD0",
  qLow: "#3A6FC0",
  qCalm: "#1F9E78",
  qExciteSoft: "#FFA08C",
  qTenseSoft: "#BEA0EB",
  qLowSoft: "#A0BEE6",
  qCalmSoft: "#A0E1C8",
};

function quadSoft(v: number, a: number): string {
  if (a >= 0 && v >= 0) return C.qExciteSoft;
  if (a >= 0 && v < 0) return C.qTenseSoft;
  if (a < 0 && v < 0) return C.qLowSoft;
  return C.qCalmSoft;
}

/** 点阵光晕：规整矩形网格，仅保留圆域内的点，rn∈[0,1] 归一半径 */
const HALO_DOTS = (() => {
  const step = 0.17;
  const dots: { dx: number; dy: number; rn: number; size: number; phase: number }[] = [];
  for (let gx = -6; gx <= 6; gx++) {
    for (let gy = -6; gy <= 6; gy++) {
      const dx = gx * step;
      const dy = gy * step;
      const rn = Math.hypot(dx, dy);
      if (rn > 1 || rn < 0.14) continue; // 中心留给柔芯
      dots.push({
        dx,
        dy,
        rn,
        size: 1.2 + 1.1 * (1 - rn),
        phase: ((gx + gy) * 0.5) % (Math.PI * 2),
      });
    }
  }
  return dots;
})();

interface Props {
  trail: { v: number; a: number; at: number }[];
  baselineReady: boolean;
  baselineRemaining: number | null;
}

/**
 * 情绪平面 v5：无边框融合版。
 * 画布透明，直接浮于粉彩色场之上；无外框、无象限铺底；
 * 十字轴两端渐隐融入背景。
 */
export default function EmotionPlane({ trail, baselineReady, baselineRemaining }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trailRef = useRef(trail);
  trailRef.current = trail;
  const readyRef = useRef(baselineReady);
  readyRef.current = baselineReady;
  const posRef = useRef({ x: 0, y: 0 });
  // 光标的平滑轨迹历史（拖尾直接用它绘制，保证墨迹永远跟在点后面）
  const histRef = useRef<{ x: number; y: number; at: number }[]>([]);
  // 当前粉彩色（向象限色缓慢插值，变色是渐变而非跳变）
  const colRef = useRef([160, 190, 230]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let size = 0;
    let lastT = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = Math.floor(rect.width);
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const toPx = (v: number, a: number, pad: number) => {
      const half = (size - pad * 2) / 2;
      return { x: pad + half + v * half, y: pad + half - a * half };
    };

    const hexToRgb = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };

    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (!size) return;
      const pad = 64; // 给点阵光晕留出空间，避免贴近边缘时被裁切
      const w = size;
      const mid = w / 2;

      ctx.clearRect(0, 0, w, w);

      // ── 十字轴：两端渐隐，融入色场 ──
      const fadeLen = (w - pad * 2) * 0.12;
      const gx = ctx.createLinearGradient(pad, 0, w - pad, 0);
      gx.addColorStop(0, "rgba(20,20,18,0)");
      gx.addColorStop(fadeLen / (w - pad * 2), C.lineHi);
      gx.addColorStop(1 - fadeLen / (w - pad * 2), C.lineHi);
      gx.addColorStop(1, "rgba(20,20,18,0)");
      ctx.strokeStyle = gx;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad, mid);
      ctx.lineTo(w - pad, mid);
      ctx.stroke();

      const gy = ctx.createLinearGradient(0, pad, 0, w - pad);
      gy.addColorStop(0, "rgba(20,20,18,0)");
      gy.addColorStop(fadeLen / (w - pad * 2), C.lineHi);
      gy.addColorStop(1 - fadeLen / (w - pad * 2), C.lineHi);
      gy.addColorStop(1, "rgba(20,20,18,0)");
      ctx.strokeStyle = gy;
      ctx.beginPath();
      ctx.moveTo(mid, pad);
      ctx.lineTo(mid, w - pad);
      ctx.stroke();

      // ── 刻度 0（原点旁，极简）──
      ctx.fillStyle = C.tick;
      ctx.font = "12px 'JetBrains Mono', Menlo, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("0", mid + 6, mid - 8);

      const t = trailRef.current;
      const ready = readyRef.current;

      if (ready && t.length) {
        const now = Date.now();
        const rm = reducedMotion(); // 冻结装饰性脉冲/流光，保留数据插值

        // ── 当前点平滑（τ≈0.9s 指数滑行）──
        const latest = t[t.length - 1];
        const target = toPx(latest.v, latest.a, pad);
        const pos = posRef.current;
        // 中途载入（基线已就绪）时首帧吸附到目标，避免从左上角滑入
        if (!histRef.current.length && pos.x === 0 && pos.y === 0) {
          pos.x = target.x;
          pos.y = target.y;
        }
        const dt = Math.min(0.1, (now - lastT) / 1000);
        lastT = now;
        const k = 1 - Math.exp(-dt / 0.9);
        pos.x += (target.x - pos.x) * k;
        pos.y += (target.y - pos.y) * k;

        // ── 拖尾：直接记录光标的平滑轨迹，永远跟在点后面 ──
        const hist = histRef.current;
        const lastPt = hist[hist.length - 1];
        if (!lastPt || now - lastPt.at > 60 || Math.hypot(pos.x - lastPt.x, pos.y - lastPt.y) > 0.6) {
          hist.push({ x: pos.x, y: pos.y, at: now });
        }
        while (hist.length && now - hist[0].at > 60000) hist.shift();

        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        const soft = quadSoft(latest.v, latest.a);
        const targetCol = hexToRgb(soft);
        const cur = colRef.current;
        // 颜色插值（dt 归一，约 1.2s 渐变到位）
        const ck = 1 - Math.exp(-dt / 1.2);
        for (let i = 0; i < 3; i++) cur[i] += (targetCol[i] - cur[i]) * ck;
        const [r, g, b] = cur;
        let accS = 0;
        for (let i = 1; i < hist.length; i++) {
          accS += Math.hypot(hist[i].x - hist[i - 1].x, hist[i].y - hist[i - 1].y);
          const age = Math.min(1, (now - hist[i].at) / 60000);
          // 年龄渐隐 + 沿轨迹向头部流动的明暗波（光河；reduced-motion 冻结）
          const flow = rm ? 1 : 0.65 + 0.35 * Math.sin(accS * 0.045 - now / 850);
          const alpha = 0.5 * (1 - age) ** 0.9 * flow;
          if (alpha <= 0.015) continue;
          ctx.strokeStyle = `rgb(${r},${g},${b})`;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(hist[i - 1].x, hist[i - 1].y);
          ctx.lineTo(hist[i].x, hist[i].y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // ── 当前点：柔芯 + 矩形点阵光晕（径向扩散脉冲；reduced-motion 冻结相位）──
        const ph1 = rm ? 0 : (now / 3000) * Math.PI * 2;
        const R = rm ? 46 : 46 + 5 * Math.sin(ph1);
        for (let i = 0; i < HALO_DOTS.length; i++) {
          const d = HALO_DOTS[i];
          // 脉冲从中心一圈圈向外扩散
          const breathe = rm ? 0.7 : 0.55 + 0.45 * Math.sin(ph1 * 2 - d.rn * 4);
          const alpha = 0.5 * (1 - d.rn) ** 1.6 * breathe;
          if (alpha <= 0.02) continue;
          ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
          ctx.beginPath();
          ctx.arc(pos.x + d.dx * R, pos.y + d.dy * R, d.size, 0, Math.PI * 2);
          ctx.fill();
        }
        // 柔芯：纯粉彩，中心凝实向外化开
        const core = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 9);
        core.addColorStop(0, `rgba(${r},${g},${b},1)`);
        core.addColorStop(0.4, `rgba(${r},${g},${b},0.85)`);
        core.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 9, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── 校准中：墨虚线扫环（reduced-motion 时静止环）──
      if (!ready) {
        const now = Date.now();
        ctx.save();
        ctx.translate(mid, mid);
        ctx.rotate(reducedMotion() ? 0 : ((now % 12000) / 12000) * Math.PI * 2);
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 9]);
        ctx.globalAlpha = 0.45;
        ctx.beginPath();
        ctx.arc(0, 0, 46, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;

        ctx.fillStyle = C.ink;
        ctx.beginPath();
        ctx.arc(mid, mid, 4.5, 0, Math.PI * 2);
        ctx.fill();
        posRef.current = { x: mid, y: mid };
        histRef.current = [];
      }
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="relative aspect-square w-full">
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        role="img"
        aria-label="Emotion plane: live valence–arousal position with a 60-second trail"
      />
      {!baselineReady && (
        <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-10">
          <span className="font-mono-num text-xs" style={{ color: C.tick }}>
            Calibrating{baselineRemaining != null ? ` ${baselineRemaining}s` : ""}
          </span>
        </div>
      )}
    </div>
  );
}
