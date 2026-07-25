/**
 * motion.ts —— prefers-reduced-motion 共享实况开关。
 * 画布 rAF 循环每帧读取 reducedMotion()，装饰性运动（漂移/脉冲/流光/扫环）
 * 冻结，数据性运动（点平滑、颜色插值、波形）保留——与设计简报动效表一致。
 */
const mql = window.matchMedia("(prefers-reduced-motion: reduce)");

export function reducedMotion(): boolean {
  return mql.matches;
}

/** 数值变化过渡的时长：reduced-motion 时瞬时替换（信息不丢，动效取消） */
export function dataTransition(css: string): string {
  return mql.matches ? "none" : css;
}
