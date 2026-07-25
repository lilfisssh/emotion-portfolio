/**
 * mapping.ts —— 前端类型化入口。
 * 实现本体在 mapping.core.mjs（纯 ESM，前后端共享，单一事实来源）。
 */
export { createMapper } from "./mapping.core.mjs";
export type { Mapper, MappedPoint, PhysioSample } from "./mapping.core.mjs";
