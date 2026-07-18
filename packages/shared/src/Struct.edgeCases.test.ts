import { describe, expect, it } from "vite-plus/test";

import type { DeepPartial } from "./Struct.ts";
import { deepMerge } from "./Struct.ts";

// This suite pins the SURPRISING / LOSSY runtime contract of `deepMerge`.
// It complements Struct.test.ts and must never assert behavior the function
// does not have — only what it ACTUALLY does today, so regressions are caught.
//
// Key detail: `deepMerge` recurses only when BOTH sides are `P.isObject`.
// In effect v4 (the installed version), `Predicate.isObject` is
// `typeof v === "object" && v !== null && !Array.isArray(v)`, so it returns
// `true` for plain objects, `Date`, `Map`, and class instances, but `false`
// for arrays, functions, `null`, `undefined`, and primitives.
describe("deepMerge edge cases", () => {
  it("overwrites arrays instead of concatenating them", () => {
    // Intentional quirk documentation: Arrays are NOT `isObject` in effect v4,
    // so the recursion branch is skipped and the patch array is assigned
    // directly (whole-value overwrite).
    const base = { tags: ["a", "b"] };
    const patch = { tags: ["c"] };
    const result = deepMerge(base, patch);
    expect(result).toEqual({ tags: ["c"] });
    expect(Array.isArray(result.tags)).toBe(true);
    expect(result.tags).toEqual(["c"]);
  });

  // KNOWN LIMITATION: deepMerge only skips `undefined` (value === undefined).
  // JSON/null-able sources can silently overwrite with null. Consider changing
  // the guard to value == null if skip-null is desired.
  it("[LIMITATION] null is not skipped (only undefined is)", () => {
    // `null` is not part of DeepPartial<{ a: number }>, but at runtime it flows
    // past the `value === undefined` guard and overwrites. Cast exercises this
    // untyped runtime branch under exactOptionalPropertyTypes.
    const base = { a: 1 };
    const patch = { a: null } as unknown as DeepPartial<{ a: number }>;
    const result = deepMerge(base, patch);
    expect(result).toEqual({ a: null });
    expect(result.a).toBe(null);
  });

  // Regression for bug deepMerge-date-prototype-loss: deepMerge now treats
  // non-plain objects (Date/Map/class instances) as whole-value overwrites,
  // preserving the prototype instead of spreading them to {}.
  it("overwrites Date values whole, preserving the prototype (regression: deepMerge-date-prototype-loss)", () => {
    // @effect-diagnostics-next-line globalDate:off
    const base = { d: new Date(0) };
    // @effect-diagnostics-next-line globalDate:off
    const patch = { d: new Date(1000) };
    const result = deepMerge(base, patch);
    expect(result.d).toBeInstanceOf(Date);
    expect((result.d as Date).getTime()).toBe(1000);
  });

  // Intentional quirk documentation: Functions are NOT `isObject` in effect v4,
  // so the patch function replaces the base one directly. Cast keeps it
  // compiling under DeepPartial.
  it("overwrites function values with the patch function", () => {
    const base = { fn: () => 1 };
    const second = () => 2;
    const patch = { fn: second } as unknown as DeepPartial<{ fn: () => number }>;
    const result = deepMerge(base, patch);
    expect(result.fn).toBe(second);
    expect(result.fn()).toBe(2);
  });

  it("skips nested undefined patch keys (recurses)", () => {
    // The nested undefined patch is supplied through a DeepPartial<T>-typed
    // variable and assigned via property write; under exactOptionalPropertyTypes
    // `undefined` cannot be placed in an optional property without a cast, so
    // `withNestedUndefined` documents that it exercises the runtime
    // `value === undefined` skip on a nested key.
    type Shape = { a: number; nested: { x: number; y: number } };
    const base: Shape = { a: 1, nested: { x: 1, y: 2 } };
    const withNestedUndefined = { y: undefined } as unknown as DeepPartial<Shape["nested"]>;
    const patch = { nested: withNestedUndefined } as unknown as DeepPartial<Shape>;
    const result = deepMerge(base, patch);
    expect(result).toEqual({ a: 1, nested: { x: 1, y: 2 } });
  });

  // Regression for bug deepMerge-primitive-discards-base: deepMerge now throws
  // on a primitive patch instead of discarding the entire base.
  it("throws on a primitive patch instead of discarding the base (regression: deepMerge-primitive-discards-base)", () => {
    const base = { a: 1, b: 2 };
    const patch = 5 as unknown as DeepPartial<{ a: number; b: number }>;
    expect(() => deepMerge(base, patch)).toThrow();
  });
});
