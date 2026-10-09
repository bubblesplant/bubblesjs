import { describe, expect, test } from "vite-plus/test";
import { clamp, fn } from "../src/index.ts";

test("fn", () => {
  expect(fn()).toBe("Hello, tsdown!");
});

describe("clamp", () => {
  test.each([
    [5, 0, 10, 5],
    [-5, 0, 10, 0],
    [15, 0, 10, 10],
    [0, 0, 10, 0],
    [10, 0, 10, 10],
    [8, 3, 3, 3],
    [-2.5, -5, -1, -2.5],
  ])("限制 %s 到 [%s, %s] 得到 %s", (value, min, max, expected) => {
    expect(clamp(value, min, max)).toBe(expected);
  });

  test.each([
    [5, 10, 0],
    [NaN, 0, 10],
    [Infinity, 0, 10],
    [5, -Infinity, 10],
    [5, 0, Infinity],
  ])("拒绝非法输入 (%s, %s, %s)", (value, min, max) => {
    expect(() => clamp(value, min, max)).toThrow(RangeError);
  });
});
