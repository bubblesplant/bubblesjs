export function fn() {
  return "Hello, tsdown!";
}

/** 将有限数值限制在闭区间 [min, max] 内。 */
export function clamp(value: number, min: number, max: number): number {
  if (![value, min, max].every(Number.isFinite) || min > max) {
    throw new RangeError("clamp 需要有限数值，且 min 不能大于 max。");
  }

  return Math.min(max, Math.max(min, value));
}
