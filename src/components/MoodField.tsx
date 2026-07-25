import { useEffect, useRef } from "react";
import { reducedMotion } from "../lib/motion";

/** 四象限粉彩光源（RGB）——浅色色场 */
const QUAD = {
  excite: [255, 160, 140], // 右上 兴奋：珊瑚
  tense: [190, 160, 235],  // 左上 焦虑：薰衣草紫
  low: [160, 190, 230],    // 左下 低落：粉末蓝
  calm: [160, 225, 200],   // 右下 平静：薄荷
};

function quadColor(v: number, a: number): number[] {
  if (a >= 0 && v >= 0) return QUAD.excite;
  if (a >= 0 && v < 0) return QUAD.tense;
  if (a < 0 && v < 0) return QUAD.low;
  return QUAD.calm;
}

interface Props {
  point: { v: number; a: number } | null;
}

/**
 * 情绪气候场：整页浅色活体背景。
 * 瓷白底上 4 个粉彩光团慢速漂移，颜色向当前象限插值（0.02/帧），
 * 唤醒度决定光团浓度与脉动。CSS blur(80px) 融成白昼极光。
 */
export default function MoodField({ point }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointRef = useRef(point);
  pointRef.current = point;
  const colRef = useRef([160, 190, 230]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;

    const resize = () => {
      w = Math.floor(window.innerWidth / 6);
      h = Math.floor(window.innerHeight / 6);
      canvas.width = w;
      canvas.height = h;
    };
    resize();
    window.addEventListener("resize", resize);

    const blobs = [
      { fx: 0.9, fy: 0.7, px: 0.0, py: 1.3, r: 0.6, w: 1.0 },
      { fx: 0.6, fy: 1.1, px: 2.1, py: 0.4, r: 0.5, w: 0.8 },
      { fx: 1.3, fy: 0.5, px: 4.2, py: 2.6, r: 0.55, w: 0.7 },
      { fx: 0.4, fy: 0.9, px: 5.5, py: 3.8, r: 0.45, w: 0.55 },
    ];

    const draw = (tms: number) => {
      raf = requestAnimationFrame(draw);
      if (!w || !h) return;
      // reduced-motion：冻结漂移/脉动（装饰），保留象限颜色插值（数据）
      const t = reducedMotion() ? 0 : tms / 1000;

      const p = pointRef.current;
      const target = p ? quadColor(p.v, p.a) : [200, 205, 220];
      const cur = colRef.current;
      for (let i = 0; i < 3; i++) cur[i] += (target[i] - cur[i]) * 0.02;

      // 唤醒度 → 光团浓度（高唤醒更饱和，低唤醒更薄）
      const energy = p ? 0.5 + 0.5 * Math.abs(p.a) : 0.45;
      const drift = p ? p.v * 0.12 : 0;

      ctx.fillStyle = "#fafaf7";
      ctx.fillRect(0, 0, w, h);

      for (let i = 0; i < blobs.length; i++) {
        const b = blobs[i];
        const bx = (0.5 + 0.45 * Math.sin(t * b.fx * 0.11 + b.px) + drift) * w;
        const by = (0.5 + 0.45 * Math.cos(t * b.fy * 0.09 + b.py)) * h;
        const br = b.r * Math.max(w, h) * (0.85 + 0.15 * Math.sin(t * 0.23 + i));
        const pulse = energy * b.w * (0.8 + 0.2 * Math.sin(t * 0.5 + i * 1.7));
        // 光团间色相微调形成层次
        const shift = i % 2 === 0 ? 1 : -1;
        const rC = Math.min(255, Math.max(0, cur[0] + shift * 14 * i));
        const gC = Math.min(255, Math.max(0, cur[1] - shift * 8 * i));
        const bC = Math.min(255, Math.max(0, cur[2] + shift * 16));
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        g.addColorStop(0, `rgba(${rC | 0},${gC | 0},${bC | 0},${0.5 * pulse})`);
        g.addColorStop(1, "rgba(250,250,247,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas id="mood-field" ref={canvasRef} aria-hidden="true" />;
}
