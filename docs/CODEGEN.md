# Code Generation

**Status:** Fully implemented

The compiler generates JavaScript or TypeScript from a type-checked Clank AST. TypeScript output includes full type annotations and runtime type definitions.

## CLI Usage

```bash
# Compile to JavaScript (default)
clank compile main.clank -o dist/

# Compile to TypeScript
clank compile main.clank -o dist/ --ts

# Output to stdout
clank compile main.clank --emit=js
```

## Type Mapping

| Clank Type | TypeScript Type | Notes |
|------------|-----------------|-------|
| `Int`, `Int64`, `Nat` | `bigint` | Arbitrary precision integers |
| `Int32` | `bigint` | 32-bit integers (still bigint in JS) |
| `Float` | `number` | IEEE 754 double |
| `Bool` | `boolean` | |
| `Str`, `String` | `string` | |
| `Unit` | `void` | |
| `[T]` (array) | `T[]` | |
| `(A, B, C)` (tuple) | `[A, B, C]` | |
| `{ a: A, b: B }` (record) | `{ a: A; b: B }` | |
| `(A) -> B` (function) | `(arg0: A) => B` | |
| `Option[T]` | `T \| null` | |
| `Result[T, E]` | `{ ok: true; value: T } \| { ok: false; error: E }` | |
| Refinement types | Base type | Predicates are erased |
| Effect types | Result type | Effects are erased |

## Data Type Compilation

### Record Types

```clank
rec Point { x: Int, y: Int }
```

Compiles to:

```typescript
interface Point {
  x: bigint;
  y: bigint;
}

function Point(x: bigint, y: bigint): Point {
  return { x, y };
}
```

### Sum Types

```clank
sum Option[T] { Some(T), None }
```

Compiles to:

```typescript
type Option<T> = { tag: "Some"; value: T } | { tag: "None" };

function Some<T>(value: T): Option<T> {
  return { tag: "Some", value };
}

const None: Option<never> = Object.freeze({ tag: "None" });
```

## Runtime Helpers

Generated code uses a `__clank` runtime object that provides standard library functions. The runtime is automatically included at the top of generated files.

### Runtime Types

```typescript
type Option<T> = { tag: "Some"; value: T } | { tag: "None" };
type Result<T, E> = { tag: "Ok"; value: T } | { tag: "Err"; error: E };
type Ordering = { tag: "Less" } | { tag: "Equal" } | { tag: "Greater" };
```

### Available Runtime Functions

| Category | Functions |
|----------|-----------|
| **Constructors** | `Some(value)`, `None`, `Ok(value)`, `Err(error)`, `Less`, `Equal`, `Greater` |
| **Pattern matching** | `match(value, cases)` |
| **Assertions** | `assert(condition, message?)`, `panic(message)`, `unreachable()` |
| **Arrays** | `len(arr)`, `is_empty(arr)`, `push(arr, item)`, `map(arr, fn)`, `filter(arr, pred)`, `fold(arr, init, fn)`, `get(arr, idx)`, `find(arr, pred)`, `any(arr, pred)`, `all(arr, pred)`, `contains(arr, elem)`, `concat(a, b)`, `reverse(arr)`, `take(arr, n)`, `drop(arr, n)`, `zip(a, b)` |
| **Strings** | `str_len(s)`, `trim(s)`, `split(s, delim)`, `join(parts, delim)`, `to_string(x)` |
| **IO** | `print(s)`, `println(s)` |
| **Math** | `abs(n)`, `min(a, b)`, `max(a, b)` |
| **Conversion** | `int_to_float(n)`, `float_to_int(x)` |
| **Iteration** | `range(start, end, inclusive)` |

### Pattern Matching

The `match` helper handles tagged union matching:

```typescript
// Clank
match value {
  Some(x) -> use(x),
  None -> default_value
}

// Generated TypeScript
__clank.match(value, {
  Some: (x) => use(x),
  None: () => default_value
});
```

## Emit Options

### Programmatic API

```typescript
import { emit, CodeEmitter } from "./codegen";

// Simple usage
const result = emit(program);

// With options
const result = emit(program, {
  typescript: true,       // Emit TypeScript (default: false)
  includeRuntime: true,   // Include __clank runtime (default: true)
  minimalRuntime: false,  // Use minimal runtime (default: false)
  indent: "  ",           // Indentation string (default: "  ")
  sourceMap: false,       // Add source map comment (default: false)
  typeInfo: typeInfo,     // Type info from checker (for TS output)
});

console.log(result.code);
```

### EmitOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `typescript` | `boolean` | `false` | Emit TypeScript instead of JavaScript |
| `includeRuntime` | `boolean` | `true` | Include `__clank` runtime in output |
| `minimalRuntime` | `boolean` | `false` | Use smaller runtime with fewer functions |
| `indent` | `string` | `"  "` | Indentation string |
| `sourceMap` | `boolean` | `false` | Add source map comment |
| `typeInfo` | `TypeInfo` | - | Type information from type checker |

## Output Quality Standards

The generated code follows these quality standards:

| Aspect | Requirement |
|--------|-------------|
| **Async/await** | Use `async`/`await`, not Promise chaining |
| **Variable declarations** | `const` by default, `let` only when mutation required |
| **Naming** | Consistent conventions matching source names |
| **Temporaries** | Avoid unnecessary temporary variables |
| **Formatting** | Deterministic formatting |

### Reserved Word Handling

JavaScript reserved words in Clank identifiers are mangled with an underscore suffix:

```clank
fn delete(x: Int) -> Int { x }
```

Compiles to:

```typescript
function delete_(x: bigint): bigint {
  return x;
}
```

## Example: Complete Program

**Input (Clank):**

```clank
rec Point { x: Int, y: Int }

fn distance_sq(p: Point) -> Int {
  p.x * p.x + p.y * p.y
}

fn main() -> IO[Unit] {
  let p = Point(3, 4);
  println(to_string(distance_sq(p)))
}
```

**Output (TypeScript):**

```typescript
// Clank Runtime Types
type Option<T> = { tag: "Some"; value: T } | { tag: "None" };
type Result<T, E> = { tag: "Ok"; value: T } | { tag: "Err"; error: E };
// ... (full runtime)

interface Point {
  x: bigint;
  y: bigint;
}

function Point(x: bigint, y: bigint): Point {
  return { x, y };
}

function distance_sq(p: Point): bigint {
  return (p.x * p.x + p.y * p.y);
}

function main(): void {
  const p = Point(3n, 4n);
  __clank.println(__clank.to_string(distance_sq(p)));
}
```

## Minimal Runtime

For smaller output, use `minimalRuntime: true`. The minimal runtime includes only essential functions:
- `Some`, `None`, `Ok`, `Err`
- `match`
- `assert`, `panic`, `unreachable`

Other functions must be provided by the host environment.

## See Also

- [CLI Reference](CLI.md) - Command-line flags for code generation
- [Effects](EFFECTS.md) - Effect tracking and compilation
- [Golden Tests](../tests/golden/) - TypeScript output snapshots
