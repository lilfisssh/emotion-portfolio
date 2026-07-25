import { useEffect, useRef } from "react";

interface Props {
  series: number[];
  color?: string;
  height?: number;
}

/**
 * 60s 滚动迷你波形：Canvas 手绘折线，signal 色 2px，无填充。
 * 数据从右缘进入，随 rAF 连续重绘。
 */
export default function Waveform({ series, color = "#141412", height = 56 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const seriesRef = useRef(series);
  seriesRef.current = series;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let w = 0;
    let h = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.floor(rect.width);
      h = Math.floor(rect.height);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (!w || !h) return;
      ctx.clearRect(0, 0, w, h);

      // 基线：细墨线
      ctx.strokeStyle = "rgba(20,20,18,0.14)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h - 1);
      ctx.lineTo(w, h - 1);
      ctx.stroke();

      const s = seriesRef.current;
      if (s.length < 2) return;
      // 明确取最近 60 个样本（≈60s@1Hz），宽满画布
      const view = s.length > 60 ? s.slice(-60) : s;
      let min = Infinity;
      let max = -Infinity;
      for (const v of view) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const span = max - min || 1;
      const pad = 4;
      const yOf = (v: number) => pad + (1 - (v - min) / span) * (h - pad * 2);

      // 柔化：中点二次贝塞尔平滑 + 细线 + 降透明，避免生硬折线感
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      const xOf = (i: number) => w - ((view.length - 1 - i) / 59) * w;
      ctx.moveTo(xOf(0), yOf(view[0]));
      for (let i = 1; i < view.length - 1; i++) {
        const xc = (xOf(i) + xOf(i + 1)) / 2;
        const yc = (yOf(view[i]) + yOf(view[i + 1])) / 2;
        ctx.quadraticCurveTo(xOf(i), yOf(view[i]), xc, yc);
      }
      ctx.lineTo(xOf(view.length - 1), yOf(view[view.length - 1]));
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [color]);

  return <canvas ref={canvasRef} className="w-full" style={{ height }} aria-hidden="true" />;
}
