/**
 * Clank Runtime
 *
 * Provides runtime support functions for generated JavaScript/TypeScript code.
 */

/**
 * Get TypeScript type definitions for the Clank runtime.
 * These are emitted at the top of .ts files or in a separate .d.ts file.
 */
export function getRuntimeTypes(): string {
  return `// Clank Runtime Types

/** Option type - represents an optional value */
type Option<T> = { tag: "Some"; value: T } | { tag: "None" };

/** Result type - represents success or failure */
type Result<T, E> = { tag: "Ok"; value: T } | { tag: "Err"; error: E };

/** Ordering type - result of comparison */
type Ordering = { tag: "Less" } | { tag: "Equal" } | { tag: "Greater" };

/** Clank runtime interface */
interface ClankRuntime {
  // Option constructors
  Some<T>(value: T): Option<T>;
  None: Option<never>;

  // Result constructors
  Ok<T>(value: T): Result<T, never>;
  Err<E>(error: E): Result<never, E>;

  // Ordering values
  Less: Ordering;
  Equal: Ordering;
  Greater: Ordering;

  // Pattern matching
  match<T, R>(value: T, cases: Record<string, (payload?: unknown) => R>): R;

  // Assertions
  assert(condition: boolean, message?: string): void;
  panic(message: string): never;
  unreachable(): never;

  // Range
  range(start: bigint, end: bigint, inclusive: boolean): bigint[];

  // Array helpers
  len<T>(arr: T[]): bigint;
  is_empty<T>(arr: T[]): boolean;
  push<T>(arr: T[], item: T): T[];
  map<T, U>(arr: T[], fn: (item: T) => U): U[];
  filter<T>(arr: T[], pred: (item: T) => boolean): T[];
  fold<T, U>(arr: T[], init: U, fn: (acc: U, item: T) => U): U;
  get<T>(arr: T[], idx: bigint): Option<T>;
  find<T>(arr: T[], pred: (item: T) => boolean): Option<T>;
  any<T>(arr: T[], pred: (item: T) => boolean): boolean;
  all<T>(arr: T[], pred: (item: T) => boolean): boolean;
  contains<T>(arr: T[], elem: T): boolean;
  concat<T>(a: T[], b: T[]): T[];
  reverse<T>(arr: T[]): T[];
  take<T>(arr: T[], n: bigint): T[];
  drop<T>(arr: T[], n: bigint): T[];
  zip<T, U>(a: T[], b: U[]): [T, U][];

  // String helpers
  str_len(s: string): bigint;
  trim(s: string): string;
  split(s: string, delim: string): string[];
  join(parts: string[], delim: string): string;
  to_string(x: unknown): string;

  // IO helpers
  print(s: string): void;
  println(s: string): void;

  // Math helpers
  abs(n: bigint): bigint;
  min<T>(a: T, b: T): T;
  max<T>(a: T, b: T): T;

  // Type conversion
  int_to_float(n: bigint): number;
  float_to_int(x: number): bigint;
}

declare const __clank: ClankRuntime;
`;
}

/**
 * Get the JavaScript runtime code as a string.
 */
export function getRuntimeCode(): string {
  return `// Clank Runtime
const __clank = {
  // Option type constructors
  Some: (value) => ({ tag: "Some", value }),
  None: Object.freeze({ tag: "None" }),

  // Result type constructors
  Ok: (value) => ({ tag: "Ok", value }),
  Err: (error) => ({ tag: "Err", error }),

  // Ordering type values
  Less: Object.freeze({ tag: "Less" }),
  Equal: Object.freeze({ tag: "Equal" }),
  Greater: Object.freeze({ tag: "Greater" }),

  // Pattern matching helper
  match: (value, cases) => {
    const handler = cases[value.tag];
    if (handler) {
      if (value.tag === "Some" || value.tag === "Ok") {
        return handler(value.value);
      } else if (value.tag === "Err") {
        return handler(value.error);
      } else {
        return handler();
      }
    }
    if (cases._) {
      return cases._(value);
    }
    throw new Error(\`Unhandled variant: \${value.tag}\`);
  },

  // Assertion helper
  assert: (condition, message) => {
    if (!condition) {
      throw new Error(message ?? "Assertion failed");
    }
  },

  // Panic helper
  panic: (message) => {
    throw new Error(message);
  },

  // Unreachable helper
  unreachable: () => {
    throw new Error("Unreachable code executed");
  },

  // Range helper (creates array from start to end)
  range: (start, end, inclusive) => {
    const result = [];
    const endVal = inclusive ? end + 1n : end;
    for (let i = start; i < endVal; i++) {
      result.push(i);
    }
    return result;
  },

  // Array helpers
  len: (arr) => BigInt(arr.length),
  is_empty: (arr) => arr.length === 0,
  push: (arr, item) => [...arr, item],
  map: (arr, fn) => arr.map(fn),
  filter: (arr, pred) => arr.filter(pred),
  fold: (arr, init, fn) => arr.reduce(fn, init),
  get: (arr, idx) => idx >= 0n && idx < BigInt(arr.length) ? { tag: "Some", value: arr[Number(idx)] } : { tag: "None" },
  find: (arr, pred) => { const x = arr.find(pred); return x !== undefined ? { tag: "Some", value: x } : { tag: "None" }; },
  any: (arr, pred) => arr.some(pred),
  all: (arr, pred) => arr.every(pred),
  contains: (arr, elem) => arr.includes(elem),
  concat: (a, b) => [...a, ...b],
  reverse: (arr) => [...arr].reverse(),
  take: (arr, n) => arr.slice(0, Number(n)),
  drop: (arr, n) => arr.slice(Number(n)),
  zip: (a, b) => a.slice(0, Math.min(a.length, b.length)).map((x, i) => [x, b[i]]),

  // String helpers
  str_len: (s) => BigInt(s.length),
  trim: (s) => s.trim(),
  split: (s, delim) => s.split(delim),
  join: (parts, delim) => parts.join(delim),
  to_string: (x) => String(x),

  // IO helpers
  print: (s) => { process.stdout.write(s); },
  println: (s) => { console.log(s); },

  // Math helpers
  abs: (n) => n < 0n ? -n : n,
  min: (a, b) => a < b ? a : b,
  max: (a, b) => a > b ? a : b,

  // Type conversion
  int_to_float: (n) => Number(n),
  float_to_int: (x) => BigInt(Math.trunc(x)),
};
`;
}

/**
 * Get TypeScript runtime code (with type annotations).
 */
export function getRuntimeCodeTS(): string {
  return `// Clank Runtime
${getRuntimeTypes()}

const __clank: ClankRuntime = {
  // Option type constructors
  Some: <T>(value: T): Option<T> => ({ tag: "Some", value }),
  None: Object.freeze({ tag: "None" }) as Option<never>,

  // Result type constructors
  Ok: <T>(value: T): Result<T, never> => ({ tag: "Ok", value }),
  Err: <E>(error: E): Result<never, E> => ({ tag: "Err", error }),

  // Ordering type values
  Less: Object.freeze({ tag: "Less" }) as Ordering,
  Equal: Object.freeze({ tag: "Equal" }) as Ordering,
  Greater: Object.freeze({ tag: "Greater" }) as Ordering,

  // Pattern matching helper
  match: <T, R>(value: T, cases: Record<string, (payload?: unknown) => R>): R => {
    const v = value as { tag: string; value?: unknown; error?: unknown };
    const handler = cases[v.tag];
    if (handler) {
      if (v.tag === "Some" || v.tag === "Ok") {
        return handler(v.value);
      } else if (v.tag === "Err") {
        return handler(v.error);
      } else {
        return handler();
      }
    }
    if (cases._) {
      return cases._(value);
    }
    throw new Error(\`Unhandled variant: \${v.tag}\`);
  },

  // Assertion helper
  assert: (condition: boolean, message?: string): void => {
    if (!condition) {
      throw new Error(message ?? "Assertion failed");
    }
  },

  // Panic helper
  panic: (message: string): never => {
    throw new Error(message);
  },

  // Unreachable helper
  unreachable: (): never => {
    throw new Error("Unreachable code executed");
  },

  // Range helper
  range: (start: bigint, end: bigint, inclusive: boolean): bigint[] => {
    const result: bigint[] = [];
    const endVal = inclusive ? end + 1n : end;
    for (let i = start; i < endVal; i++) {
      result.push(i);
    }
    return result;
  },

  // Array helpers
  len: <T>(arr: T[]): bigint => BigInt(arr.length),
  is_empty: <T>(arr: T[]): boolean => arr.length === 0,
  push: <T>(arr: T[], item: T): T[] => [...arr, item],
  map: <T, U>(arr: T[], fn: (item: T) => U): U[] => arr.map(fn),
  filter: <T>(arr: T[], pred: (item: T) => boolean): T[] => arr.filter(pred),
  fold: <T, U>(arr: T[], init: U, fn: (acc: U, item: T) => U): U => arr.reduce(fn, init),
  get: <T>(arr: T[], idx: bigint): Option<T> => idx >= 0n && idx < BigInt(arr.length) ? { tag: "Some", value: arr[Number(idx)] } : { tag: "None" },
  find: <T>(arr: T[], pred: (item: T) => boolean): Option<T> => { const x = arr.find(pred); return x !== undefined ? { tag: "Some", value: x } : { tag: "None" }; },
  any: <T>(arr: T[], pred: (item: T) => boolean): boolean => arr.some(pred),
  all: <T>(arr: T[], pred: (item: T) => boolean): boolean => arr.every(pred),
  contains: <T>(arr: T[], elem: T): boolean => arr.includes(elem),
  concat: <T>(a: T[], b: T[]): T[] => [...a, ...b],
  reverse: <T>(arr: T[]): T[] => [...arr].reverse(),
  take: <T>(arr: T[], n: bigint): T[] => arr.slice(0, Number(n)),
  drop: <T>(arr: T[], n: bigint): T[] => arr.slice(Number(n)),
  zip: <T, U>(a: T[], b: U[]): [T, U][] => a.slice(0, Math.min(a.length, b.length)).map((x, i): [T, U] => [x, b[i]]),

  // String helpers
  str_len: (s: string): bigint => BigInt(s.length),
  trim: (s: string): string => s.trim(),
  split: (s: string, delim: string): string[] => s.split(delim),
  join: (parts: string[], delim: string): string => parts.join(delim),
  to_string: (x: unknown): string => String(x),

  // IO helpers
  print: (s: string): void => { process.stdout.write(s); },
  println: (s: string): void => { console.log(s); },

  // Math helpers
  abs: (n: bigint): bigint => n < 0n ? -n : n,
  min: <T>(a: T, b: T): T => a < b ? a : b,
  max: <T>(a: T, b: T): T => a > b ? a : b,

  // Type conversion
  int_to_float: (n: bigint): number => Number(n),
  float_to_int: (x: number): bigint => BigInt(Math.trunc(x)),
};
`;
}

/**
 * Get a minimal runtime for small programs.
 */
export function getMinimalRuntimeCode(): string {
  return `// Clank Runtime (minimal)
const __clank = {
  Some: (v) => ({ tag: "Some", value: v }),
  None: { tag: "None" },
  Ok: (v) => ({ tag: "Ok", value: v }),
  Err: (e) => ({ tag: "Err", error: e }),
  match: (v, c) => c[v.tag]?.(v.value ?? v.error) ?? c._?.(v),
  assert: (c, m) => { if (!c) throw new Error(m ?? "Assertion failed"); },
  panic: (m) => { throw new Error(m); },
  range: (s, e, i) => { const r = []; for (let x = s; x < (i ? e + 1n : e); x++) r.push(x); return r; },
  len: (a) => BigInt(a.length),
  println: (s) => console.log(s),
};
`;
}

/**
 * Get minimal runtime with TypeScript annotations.
 */
export function getMinimalRuntimeCodeTS(): string {
  return `// Clank Runtime (minimal)
${getRuntimeTypes()}

const __clank: Pick<ClankRuntime, "Some" | "None" | "Ok" | "Err" | "match" | "assert" | "panic" | "range" | "len" | "println"> = {
  Some: <T>(v: T): Option<T> => ({ tag: "Some", value: v }),
  None: { tag: "None" } as Option<never>,
  Ok: <T>(v: T): Result<T, never> => ({ tag: "Ok", value: v }),
  Err: <E>(e: E): Result<never, E> => ({ tag: "Err", error: e }),
  match: <T, R>(v: T, c: Record<string, (p?: unknown) => R>): R => c[(v as { tag: string }).tag]?.((v as { value?: unknown; error?: unknown }).value ?? (v as { error?: unknown }).error) ?? c._?.(v) as R,
  assert: (c: boolean, m?: string): void => { if (!c) throw new Error(m ?? "Assertion failed"); },
  panic: (m: string): never => { throw new Error(m); },
  range: (s: bigint, e: bigint, i: boolean): bigint[] => { const r: bigint[] = []; for (let x = s; x < (i ? e + 1n : e); x++) r.push(x); return r; },
  len: <T>(a: T[]): bigint => BigInt(a.length),
  println: (s: string): void => { console.log(s); },
};
`;
}
