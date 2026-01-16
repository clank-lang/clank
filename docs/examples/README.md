# Clank Examples

This directory contains example programs and JSON files demonstrating Clank's features.

## Source Examples (`.clank`)

| File | Description |
|------|-------------|
| [`basic.clank`](basic.clank) | Core language features: functions, generics, arrays, lambdas, mutable variables |
| [`refinements.clank`](refinements.clank) | Refinement types: constrained values, array bounds, arithmetic reasoning |
| [`effects.clank`](effects.clank) | Effect system: IO, Err, effect propagation |
| [`data-types.clank`](data-types.clank) | Records, sum types, Option, Result, pattern matching |
| [`interop.clank`](interop.clank) | JavaScript interop: external functions and modules |

## JSON Examples

### AST Input

| File | Description |
|------|-------------|
| [`ast-input.json`](ast-input.json) | Example AST JSON that agents can submit directly |

Compile with:
```bash
clank compile ast-input.json --input=ast -o dist/
```

### Compiler Output

| File | Description |
|------|-------------|
| [`compile-success.json`](compile-success.json) | Successful compilation with discharged obligations |
| [`compile-with-repairs.json`](compile-with-repairs.json) | Compilation errors with repair candidates |
| [`refinement-failure.json`](refinement-failure.json) | Refinement failure with counterexample and hints |

These show the structure of `CompileResult` that the compiler returns with `--emit=json`.

## Running Examples

```bash
# Type check a source file
clank check docs/examples/basic.clank

# Compile to JavaScript
clank compile docs/examples/basic.clank -o dist/

# Get structured JSON output
clank compile docs/examples/basic.clank --emit=json

# Compile from AST JSON
clank compile docs/examples/ast-input.json --input=ast

# Output AST as JSON
clank compile docs/examples/basic.clank --emit=ast
```

## Key Concepts

### Source Fragments in AST JSON

When constructing AST JSON, you can use `{ "source": "..." }` for any node to include inline Clank source:

```json
{
  "kind": "fn",
  "name": "factorial",
  "params": [{ "name": "n", "type": { "kind": "named", "name": "Int" } }],
  "returnType": { "kind": "named", "name": "Int" },
  "body": { "source": "if n <= 1 { 1 } else { n * factorial(n - 1) }" }
}
```

This is useful for mixing structured AST with complex expressions.

### Repair Candidates

Every diagnostic includes `repair_refs` pointing to repair candidates:

```json
{
  "diagnostics": [{ "id": "d1", "code": "E1001", "repair_refs": ["rc1"] }],
  "repairs": [{
    "id": "rc1",
    "title": "Rename 'helo' to 'hello'",
    "confidence": "high",
    "safety": "behavior_changing",
    "edits": [{ "op": "rename_symbol", "node_id": "n5", "old_name": "helo", "new_name": "hello" }],
    "expected_delta": { "diagnostics_resolved": ["d1"] }
  }]
}
```

### Counterexamples

When refinements fail, the solver provides concrete counterexamples:

```json
{
  "solverResult": "unknown",
  "counterexample": {
    "x": "-1",
    "_explanation": "Possible counterexample: x = -1 would violate 'x > 0'",
    "_violated": "x > 0"
  }
}
```

This helps agents understand why a refinement couldn't be proven and what values would fail.
