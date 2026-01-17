# AST-as-JSON (Agent API)

**Status:** Fully implemented

The compiler supports bidirectional AST to JSON conversion, enabling agents to:
1. **Read** the AST structure of existing code (`--emit=ast`)
2. **Generate** code by constructing JSON AST directly (`--input=ast`)
3. **Transform** code by reading AST, modifying it, and compiling back

## When to Use AST-as-JSON

| Use Case | Approach |
|----------|----------|
| Generate simple code | Write Clank source directly |
| Generate complex/dynamic code | Construct JSON AST |
| Analyze existing code structure | Use `--emit=ast` |
| Code transformation/refactoring | Read AST -> modify -> compile |
| Template-based generation | Mix AST nodes with source fragments |

## CLI Flags

```bash
# Output AST as JSON (instead of JavaScript)
clank compile main.clank --emit=ast > ast.json

# Compile from JSON AST input
clank compile program.json --input=ast -o dist/

# Round-trip: source -> AST -> JavaScript
clank compile main.clank --emit=ast | clank compile --input=ast -o dist/
```

## JSON Schema Overview

Every AST node has a `kind` field that identifies its type. Spans are optional on input (the compiler synthesizes them).

### Program Structure

```json
{
  "kind": "program",
  "declarations": [...]
}
```

### Function Declaration

```json
{
  "kind": "fn",
  "name": "add",
  "params": [
    { "name": "a", "type": { "kind": "named", "name": "Int" } },
    { "name": "b", "type": { "kind": "named", "name": "Int" } }
  ],
  "returnType": { "kind": "named", "name": "Int" },
  "body": { "kind": "block", "statements": [], "expr": {...} }
}
```

### External Function Declaration (JS Interop)

```json
{
  "kind": "externalFn",
  "name": "console_log",
  "params": [{ "name": "msg", "type": { "kind": "named", "name": "String" } }],
  "returnType": { "kind": "named", "name": "Unit" },
  "jsName": "console.log"
}
```

### Effect Type

```json
{
  "kind": "effect",
  "effects": [{ "kind": "named", "name": "IO" }],
  "resultType": { "kind": "named", "name": "String" }
}
```

## Node Types

### Declarations

| Kind | Description | Fields |
|------|-------------|--------|
| `fn` | Function declaration | `name`, `params`, `returnType`, `body`, `typeParams?`, `precondition?`, `postcondition?` |
| `externalFn` | External JS function | `name`, `params`, `returnType`, `jsName`, `typeParams?` |
| `rec` | Record type | `name`, `fields`, `typeParams?` |
| `sum` | Sum type (tagged union) | `name`, `variants`, `typeParams?` |
| `typeAlias` | Type alias | `name`, `type`, `typeParams?` |
| `use` | Import statement | `path`, `items?`, `alias?`, `isExternal?` |
| `mod` | Module declaration | `name` |

### Expressions

| Kind | Description | Fields |
|------|-------------|--------|
| `literal` | Literal value | `value` |
| `ident` | Variable reference | `name` |
| `binary` | Binary operation | `op`, `left`, `right` |
| `unary` | Unary operation | `op`, `operand` |
| `call` | Function call | `callee`, `args` |
| `if` | Conditional | `condition`, `thenBranch`, `elseBranch?` |
| `match` | Pattern matching | `scrutinee`, `arms` |
| `block` | Block expression | `statements`, `expr?` |
| `array` | Array literal | `elements` |
| `tuple` | Tuple literal | `elements` |
| `record` | Record literal | `fields` |
| `lambda` | Lambda expression | `params`, `body` |
| `field` | Field access | `object`, `field` |
| `index` | Array index | `object`, `index` |
| `range` | Range expression | `start`, `end`, `inclusive?` |
| `propagate` | Error propagation (`?`) | `expr` |

### Statements

| Kind | Description | Fields |
|------|-------------|--------|
| `let` | Variable binding | `pattern`, `init`, `type?`, `mutable?` |
| `assign` | Assignment | `target`, `value` |
| `expr` | Expression statement | `expr` |
| `for` | For loop | `pattern`, `iterable`, `body` |
| `while` | While loop | `condition`, `body` |
| `loop` | Infinite loop | `body` |
| `return` | Return statement | `value?` |
| `break` | Break statement | - |
| `continue` | Continue statement | - |
| `assert` | Assertion | `condition`, `message?` |

### Types

| Kind | Description | Fields |
|------|-------------|--------|
| `named` | Named type | `name`, `args?` |
| `array` | Array type | `element` |
| `tuple` | Tuple type | `elements` |
| `function` | Function type | `params`, `returnType` |
| `refined` | Refinement type | `base`, `predicate`, `varName?` |
| `effect` | Effect type | `effects`, `resultType` |
| `recordType` | Anonymous record | `fields`, `isOpen?` |

### Patterns

| Kind | Description | Fields |
|------|-------------|--------|
| `wildcard` | Wildcard (`_`) | - |
| `ident` | Variable binding | `name` |
| `literal` | Literal match | `value` |
| `tuple` | Tuple destructure | `elements` |
| `record` | Record destructure | `fields` |
| `variant` | Sum type match | `name`, `payload?` |

## Source Fragments (Hybrid Authoring)

Any AST node can be replaced with a source string using `{ "source": "..." }`. This is useful for:
- Complex expressions that are easier to write as source code
- Mixing generated structure with hand-written logic

```json
{
  "kind": "program",
  "declarations": [
    {
      "kind": "fn",
      "name": "greet",
      "params": [{ "name": "name", "type": { "source": "String" } }],
      "returnType": { "kind": "named", "name": "String" },
      "body": { "source": "{ \"Hello, \" ++ name }" }
    }
  ]
}
```

### Supported Contexts

| Context | Example | Notes |
|---------|---------|-------|
| Types | `{ "source": "Int" }` | Any type expression |
| Expressions | `{ "source": "x + 1" }` | Any expression |
| Patterns | `{ "source": "Ok(x)" }` | Any pattern |
| Statements | `{ "source": "let x = 1;" }` | Must be complete statement |
| Declarations | `{ "source": "fn foo() -> Int { 42 }" }` | Must be complete declaration |
| Function body | `{ "source": "{ x + 1 }" }` | Must include braces for block |

### Important Constraints

- Function bodies must be wrapped in braces: `{ "source": "{ expr }" }`, not `{ "source": "expr" }`
- Statements must include terminators (semicolons) where required
- Source fragments are parsed in isolation, so they must be syntactically complete
- Source fragments are converted to structured AST on input; the `canonical_ast` in `CompileResult` never contains source fragments

## Literal Values

Integer literals use strings (JSON doesn't support BigInt):

```json
{ "kind": "literal", "value": { "kind": "int", "value": "42" } }
{ "kind": "literal", "value": { "kind": "int", "value": "42", "suffix": "i64" } }
{ "kind": "literal", "value": { "kind": "float", "value": 3.14 } }
{ "kind": "literal", "value": { "kind": "string", "value": "hello" } }
{ "kind": "literal", "value": { "kind": "bool", "value": true } }
{ "kind": "literal", "value": { "kind": "unit" } }
```

Integer suffixes: `"i32"`, `"i64"`, or `null` (default arbitrary precision).

## Spans

Source spans are optional on input. The compiler synthesizes them automatically for nodes without spans.

```json
{
  "kind": "ident",
  "name": "x",
  "span": {
    "file": "main.clank",
    "start": { "line": 1, "column": 5, "offset": 4 },
    "end": { "line": 1, "column": 6, "offset": 5 }
  }
}
```

## Example: Generate a Function

```json
{
  "kind": "program",
  "declarations": [
    {
      "kind": "fn",
      "name": "factorial",
      "params": [{ "name": "n", "type": { "kind": "named", "name": "Int" } }],
      "returnType": { "kind": "named", "name": "Int" },
      "body": {
        "kind": "block",
        "statements": [],
        "expr": {
          "kind": "if",
          "condition": {
            "kind": "binary",
            "op": "<=",
            "left": { "kind": "ident", "name": "n" },
            "right": { "kind": "literal", "value": { "kind": "int", "value": "1" } }
          },
          "thenBranch": {
            "kind": "block",
            "statements": [],
            "expr": { "kind": "literal", "value": { "kind": "int", "value": "1" } }
          },
          "elseBranch": {
            "kind": "block",
            "statements": [],
            "expr": { "source": "n * factorial(n - 1)" }
          }
        }
      }
    }
  ]
}
```

## Deserialization Errors

When JSON input is invalid, the compiler returns structured errors with JSON paths:

```json
{
  "ok": false,
  "errors": [
    { "path": "$.declarations[0].params[0]", "message": "Missing required field: type" }
  ]
}
```

Error messages include:
- JSON parse errors
- Missing required fields
- Unknown node kinds
- Source fragment parse errors

## Serialization Options

When outputting AST (`--emit=ast`), the compiler uses these defaults:
- `includeSpans: true` - Include source location spans
- `pretty: true` - Human-readable indentation

### Programmatic API

```typescript
import { serializeProgram, deserializeProgram } from "./ast-json";

// AST -> JSON string
const json = serializeProgram(program, {
  pretty: true,      // Default: false (compact)
  includeSpans: true // Default: true
});

// JSON string -> AST
const result = deserializeProgram(json);
if (result.ok) {
  const program = result.value;
} else {
  console.error(result.errors);
}

// Also accepts parsed JSON object
const result2 = deserializeProgram({ kind: "program", declarations: [] });
```

### SerializeOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `includeSpans` | `boolean` | `true` | Include source location spans in output |
| `pretty` | `boolean` | `false` | Pretty-print JSON with indentation |

### DeserializeResult

```typescript
interface DeserializeResult<T> {
  ok: boolean;
  value: T | undefined;
  errors: DeserializeError[];
}

interface DeserializeError {
  message: string;
  path: string; // JSON path, e.g., "$.declarations[0].params[0]"
}
```

## See Also

- [CLI Reference](CLI.md) - Command-line interface documentation
- [Compiler Output](REPAIRS.md#compiler-output) - CompileResult schema
- [Examples](examples/ast-input.json) - Example AST JSON input
