# Clank Examples

This directory contains example programs demonstrating Clank's features. Clank is an agent-oriented IR and compiler protocol where AST JSON is the canonical representation and `.clank` text is a debug view.

## Quick Start

```bash
# Type check a source file
clank check docs/examples/basic.clank

# Compile to JavaScript
clank compile docs/examples/basic.clank -o dist/

# Get structured JSON output
clank compile docs/examples/basic.clank --emit=json

# Compile from AST JSON (the canonical agent interface)
clank compile docs/examples/ast-input.json --input=ast

# Output AST as JSON
clank compile docs/examples/basic.clank --emit=ast
```

## Source Examples (`.clank`)

Human-readable examples demonstrating language features. While agents primarily work with AST JSON, these are useful for understanding syntax and debugging.

| File | Description | Key Features |
|------|-------------|--------------|
| [`basic.clank`](basic.clank) | Core language features | Functions, generics, arrays, lambdas, loops, mutable variables, Unicode syntax |
| [`data-types.clank`](data-types.clank) | Records and sum types | Record definitions, sum types (enums), Option, Result, pattern matching |
| [`refinements.clank`](refinements.clank) | Refinement types | Type predicates, solver reasoning, guards, assertions, counterexamples |
| [`effects.clank`](effects.clank) | Effect system | IO effect, Err effect, effect propagation, `?` operator |
| [`interop.clank`](interop.clank) | JavaScript interop | External functions, type mappings, runtime validation |

## AST JSON Examples

These are the canonical interface for agents working with Clank.

### Input Examples

| File | Description |
|------|-------------|
| [`ast-input.json`](ast-input.json) | Complete AST JSON program showing all node types: records, sum types, functions, generics, refinements, effects, lambdas, external declarations |

**Compile with:**
```bash
clank compile docs/examples/ast-input.json --input=ast -o dist/
```

### Compiler Output Examples

| File | Description |
|------|-------------|
| [`compile-success.json`](compile-success.json) | Successful compilation with discharged obligations |
| [`compile-with-repairs.json`](compile-with-repairs.json) | Errors with repair candidates (name resolution, mutability) |
| [`refinement-failure.json`](refinement-failure.json) | Refinement failure with counterexample and repair options |

### Agent Workflow Example

| File | Description |
|------|-------------|
| [`agent-workflow.json`](agent-workflow.json) | Complete iterative repair cycle: broken program → compiler response → repair application → success |

## Key Concepts

### Source Fragments in AST JSON

When constructing AST JSON, use `{ "source": "..." }` for any node to include inline Clank source. The parser expands these automatically:

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

Every diagnostic includes `repair_refs` pointing to repair candidates. Repairs are ranked by:

1. **Safety**: `behavior_preserving` > `likely_preserving` > `behavior_changing`
2. **Confidence**: `high` > `medium` > `low`
3. **Kind**: `local_fix` > `refactor` > `semantics_change`

Example repair:
```json
{
  "id": "rc1",
  "title": "Rename 'helo' to 'hello'",
  "confidence": "high",
  "safety": "behavior_changing",
  "edits": [{ "op": "rename_symbol", "node_id": "n5", "old_name": "helo", "new_name": "hello" }],
  "expected_delta": { "diagnostics_resolved": ["d1"] }
}
```

### Counterexamples

When refinements fail, the solver provides concrete counterexamples:

```json
{
  "solverResult": "unknown",
  "counterexample": {
    "x": "-1",
    "_explanation": "x = -1 would violate 'x > 0'",
    "_violated": "x > 0"
  }
}
```

### Node IDs

Every AST node has a stable `id` field for referencing:

```json
{
  "id": "fn_001",
  "kind": "fn",
  "name": "add",
  ...
}
```

Node IDs are:
- **Stable within a session** — Same node keeps same ID across compile iterations
- **Referenced by diagnostics** — Errors point to `primary_node_id`
- **Used in repairs** — Edits reference nodes by ID

## Agent Workflow

```
1. Submit AST → receive CompileResult
2. If status == "success": done
3. Filter repairs: behavior_preserving or likely_preserving only
4. Sort by: confidence → kind → scope
5. Apply top repair
6. Recompile with --input=ast
7. Repeat until success
```

See [`agent-workflow.json`](agent-workflow.json) for a complete example.

## Error Codes

| Range | Category | Examples |
|-------|----------|----------|
| E0xxx | Syntax | Unexpected token, unterminated string |
| E1xxx | Names | Unresolved name, duplicate definition |
| E2xxx | Types | Type mismatch, missing field |
| E3xxx | Refinements | Unprovable refinement, precondition not satisfied |
| E4xxx | Effects | Effect not allowed, unhandled effect |
| E5xxx | Linearity | Linear value not consumed, used multiple times |

## Related Documentation

- [CLI Reference](../CLI.md) — Full command reference
- [AST-JSON Spec](../AST-JSON.md) — Complete AST node schema
- [Repairs Reference](../REPAIRS.md) — Repair system and error codes
- [Refinements Guide](../REFINEMENTS.md) — Refinement type solver
- [Effects Guide](../EFFECTS.md) — Effect system
- [Language Spec](../SPEC.md) — Full language specification
