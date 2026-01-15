/**
 * Clank Runtime
 *
 * Provides runtime support functions for generated JavaScript code.
 */

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
