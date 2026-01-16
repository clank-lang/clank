# Clank Implementation Roadmap

**Version:** 0.1.0
**Target Runtime:** Bun

---

## Current Status

### Completed ✅

| Component | Status | Tests | Notes |
|-----------|--------|-------|-------|
| **Lexer** | ✅ Complete | 40+ tests | Unicode + ASCII, all operators |
| **Parser** | ✅ Complete | 100+ tests | Full AST, all expressions/statements |
| **Type Checker** | ✅ Complete | 50+ tests | Bidirectional, HM inference, generics |
| **Code Generator** | ✅ Complete | 30+ tests | JavaScript output, runtime helpers |
| **Diagnostics** | ✅ Complete | - | Structured JSON, error codes |
| **CLI** | ✅ Complete | - | compile, check, run commands |
| **Refinement Basics** | ✅ Complete | 48 tests | Parsing, context, basic solver |
| **AST-as-JSON** | ✅ Complete | 28 tests | Bidirectional, source fragments |
| **Arithmetic Reasoning** | ✅ Complete | 22 tests | Variable definitions, arithmetic proofs |
| **Array Length Reasoning** | ✅ Complete | 16 tests | Bounds checking, len() constraints |
| **Better Hints** | ✅ Complete | 13 tests | Actionable hints for unprovable obligations |
| **Effect Enforcement** | ✅ Complete | 16 tests | IO/Err effect tracking and checking |
| **Repair Generation** | ✅ Complete | 17 tests | Machine-actionable patches for common errors |

**Total: 369 passing tests**

### Planned 📋

| Component | Priority | Notes |
|-----------|----------|-------|
| **Linear Types** | Low | Static checking only |
| **REPL** | Low | Interactive mode |
| **Watch Mode** | Low | Dev experience |

### Feature Gating Principles

Features move from Planned to In Progress only when:

1. **Repair patterns defined** — At least one canonical repair pattern exists for the feature's error cases
2. **Deterministic repairs possible** — No heuristic or speculative repairs required
3. **Solver coverage adequate** — The feature won't produce frequent `unknown` results without counterexamples

Features that cannot meet these criteria should remain in Planned status. Partial implementations that degrade the agent experience are worse than no implementation.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        clank-compiler                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────┐   ┌────────┐   ┌───────────────┐   ┌───────────┐  │
│  │  Lexer  │ → │ Parser │ → │  Type Checker │ → │  Codegen  │  │
│  │   ✅    │   │   ✅   │   │      ✅       │   │    ✅     │  │
│  └─────────┘   └────────┘   └───────────────┘   └───────────┘  │
│                                    │                            │
│                             ┌──────┴──────┐                     │
│                             │   Solver    │                     │
│                             │     ✅      │                     │
│                             └─────────────┘                     │
├─────────────────────────────────────────────────────────────────┤
│                          Output                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ JavaScript  │  │  AST JSON   │  │ Structured JSON Report  │ │
│  │     ✅      │  │     ✅      │  │          ✅             │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
clank/
├── src/
│   ├── index.ts              # Main entry point
│   ├── cli.ts                # Command-line interface ✅
│   ├── lexer/                # Tokenization ✅
│   ├── parser/               # Recursive descent parser ✅
│   ├── types/                # Type checker ✅
│   │   ├── checker.ts        # Bidirectional type checker
│   │   ├── types.ts          # Internal type representation
│   │   ├── context.ts        # Type environment/scopes
│   │   ├── unify.ts          # Unification algorithm
│   │   ├── convert.ts        # AST TypeExpr → semantic Type
│   │   └── builtins.ts       # Built-in function signatures
│   ├── refinements/          # Refinement type checking ✅
│   │   ├── solver.ts         # Constraint solver (arithmetic reasoning)
│   │   ├── extract.ts        # AST → predicate extraction
│   │   ├── context.ts        # Refinement fact + definition tracking
│   │   └── hints.ts          # Hint generation for unprovable obligations
│   ├── codegen/              # JavaScript generation ✅
│   ├── diagnostics/          # Structured error output ✅
│   │   ├── diagnostic.ts     # Diagnostic and repair types
│   │   ├── codes.ts          # Error code registry
│   │   ├── collector.ts      # Diagnostic collection
│   │   ├── formatter.ts      # JSON and pretty-print output
│   │   └── repairs.ts        # Repair candidate generation ✅
│   ├── ast-json/             # AST-as-JSON for agents ✅
│   └── utils/                # Shared utilities ✅
│       └── similarity.ts     # Levenshtein distance for suggestions ✅
├── tests/                    # 369 passing tests
└── docs/
    ├── SPEC.md               # Language specification
    └── ROADMAP.md            # This file
```

---

## Constraint Solver

### Current Capabilities
- ✅ Constant evaluation (`5 > 0` → true)
- ✅ Identity comparisons (`x == x`, `x <= x`)
- ✅ Logical operators (and, or, not)
- ✅ Fact-based proving from context
- ✅ Transitive comparisons (`x > 5` implies `x > 0`)
- ✅ Contradiction detection
- ✅ Variable definition tracking (`let m = n + 1`)
- ✅ Arithmetic reasoning (`n > 0` implies `n + 1 > 1`)
- ✅ Nested arithmetic simplification (`(x + 1) + 1` → `x + 2`)
- ✅ Parameter refinement facts (function parameters' refinements available in body)
- ✅ Array length reasoning (`len(arr) > 0` proves `0 < len(arr)`)
- ✅ Array bounds checking (automatic bounds obligations for `arr[i]`)

### Example: Arithmetic Reasoning
```clank
fn example(n: Int{n > 0}) -> Int {
  let m = n + 1
  // Solver proves: m > 0 (because n > 0 implies n + 1 > 1 > 0)
  requires_positive(m)  // ✅ Discharged
}
```

### Example: Array Length Reasoning
```clank
fn first[T](arr: [T]{len(arr) > 0}) -> T {
  arr[0]  // ✅ Discharged: 0 >= 0 && 0 < len(arr)
}

fn safe_access[T](arr: [T], i: Int{i >= 0 && i < len(arr)}) -> T {
  arr[i]  // ✅ Discharged: bounds check from parameter refinement
}
```

### Planned Enhancements

**1. Return Type Result Variables**
```clank
fn abs(n: Int) -> Int{result >= 0} {
  if n >= 0 {
    n  // Context knows: n >= 0, should prove: n >= 0 ✓
  } else {
    -n  // Context knows: n < 0, should prove: -n >= 0
  }
}
```

**2. Better Hints for Unprovable Obligations** ✅ Done
```json
{
  "obligation": "x != 0",
  "status": "unknown",
  "hints": [
    { "strategy": "guard", "template": "if x != 0 { ... }", "confidence": "high" },
    { "strategy": "refine_param", "template": "x: Int{x != 0}", "confidence": "medium" },
    { "strategy": "assert", "template": "assert x != 0", "confidence": "medium" },
    { "strategy": "info", "description": "x: type: Int; no constraints", "confidence": "low" }
  ]
}
```

**3. Negation and De Morgan's Laws**
```clank
// Should understand:
// !(a && b) ↔ !a || !b
// !(a || b) ↔ !a && !b
// !(x > 0) ↔ x <= 0
```

### Implementation Approach

1. ~~**Add symbolic arithmetic** - Track expressions like `n + 1`, substitute and simplify~~ ✅ Done
2. ~~**Add length tracking** - Map array variables to length constraints~~ ✅ Done
3. ~~**Improve fact collection** - Gather facts from if/match branches automatically~~ ✅ Done (branch conditions)
4. ~~**Add hint generation** - Suggest fixes for unprovable obligations~~ ✅ Done
5. **Add counterexample generation** - Show concrete values that violate predicates

---

## Repair Engine

The repair engine generates machine-actionable patches that agents can apply directly to fix compiler errors. Each repair includes confidence levels, safety classification, and PatchOps.

### Implemented Repairs ✅

| Error Code | Error | Repair | Safety | Confidence |
|------------|-------|--------|--------|------------|
| E1001 | UnresolvedName | `rename_symbol` to similar name | behavior_changing | high/medium |
| E2004 | UnknownField | `rename_field` to similar field | behavior_changing | high/medium |
| E2013 | ImmutableAssign | `replace_node` adding `mut` | behavior_preserving | high |
| E4001 | EffectNotAllowed | `widen_effect` adding effect | likely_preserving | medium |
| E4002 | UnhandledEffect | `widen_effect` adding Err | likely_preserving | medium |

### Example Output

```json
{
  "repairs": [{
    "id": "rc1",
    "title": "Rename 'helo' to 'hello'",
    "confidence": "high",
    "safety": "behavior_changing",
    "edits": [{
      "op": "rename_symbol",
      "node_id": "n5",
      "old_name": "helo",
      "new_name": "hello"
    }],
    "expected_delta": { "diagnostics_resolved": ["d1"] },
    "rationale": "'helo' is not defined. Did you mean 'hello'?"
  }]
}
```

### Planned Repairs 📋

| Error Code | Error | Repair Strategy | Priority |
|------------|-------|-----------------|----------|
| E1005 | UnresolvedType | Suggest similar type names | High |
| E2001 | TypeMismatch | Insert type conversion/annotation | Medium |
| E2002 | ArityMismatch | Add/remove placeholder arguments | Medium |
| E2003 | MissingField | Insert field with placeholder value | Medium |
| E2015 | NonExhaustiveMatch | Add missing match arms | High |
| E3001 | UnprovableRefinement | Convert hints to repairs | Medium |
| W0001 | UnusedVariable | Prefix with underscore | Low |

### PatchOp Types

```typescript
type PatchOp =
  | { op: "replace_node"; node_id: string; new_node: unknown }
  | { op: "insert_before"; target_id: string; new_statement: unknown }
  | { op: "insert_after"; target_id: string; new_statement: unknown }
  | { op: "delete_node"; node_id: string }
  | { op: "widen_effect"; fn_id: string; add_effects: string[] }
  | { op: "rename_symbol"; node_id: string; old_name: string; new_name: string }
  | { op: "rename_field"; node_id: string; old_name: string; new_name: string }
  // ... more ops for future repairs
```

---

## Future Phases

### Effect System ✅ Complete
- ✅ Parse effect annotations
- ✅ Track effects on function types
- ✅ Check effect compatibility at call sites
- ✅ IO effect for print/println
- ✅ Err effect for error propagation (?)

### Linear Types (Post-Effects)
- Parse `Linear[T]` annotations
- Track resource usage statically
- Error on double-use or non-consumption
- No runtime enforcement

### Developer Experience
- REPL implementation
- Watch mode for development
- Source maps for debugging
- Language server protocol (LSP)

---

## Success Metrics

### Primary Metric: Minimize Agent↔Compiler Iterations

The north star is reducing the number of compile cycles an agent needs to produce correct, executable TypeScript. This is measured by:

- **Repair suggestion quality** — How often can agents apply compiler-suggested patches directly?
- **Convergence rate** — How many iterations from initial submission to `status: success`?
- **Patch applicability** — Are repairs machine-applicable without agent interpretation?

### MVP Completion Criteria

1. ✅ **Compiles valid Clank to working JS** - Example programs run correctly
2. ✅ **Rejects invalid programs with good errors** - Type mismatches caught
3. ✅ **Refinement obligations work** - Arithmetic reasoning, trivial ones discharged, others reported
4. ✅ **Effect tracking works** - IO/Err effects tracked and checked
5. ✅ **Structured output complete** - JSON output matches spec
6. ✅ **Agent API works** - AST-as-JSON bidirectional conversion

### Repair Engine Criteria (In Progress)

7. ✅ **Repair candidates emitted** - Diagnostics have `repair_refs` linking to repairs
8. ✅ **Patches are machine-applicable** - `PatchOp` can be applied without parsing
9. 📋 **Canonical AST returned** - `canonical_ast` in every `CompileResult`
10. ✅ **Node IDs stable** - References work across compile iterations
11. 📋 **Counterexamples preferred** - Solver provides concrete violations when possible

### Repair Quality Criteria (In Progress)

12. ✅ **Safety classification** - Every repair has `safety: behavior_preserving | likely_preserving | behavior_changing`
13. ✅ **Scope tracking** - Every repair includes `node_count` and `crosses_function`
14. ✅ **Deterministic patterns** - Repairs are recipe-based, not heuristic
15. ✅ **Expected delta required** - Every repair specifies what it resolves
16. ✅ **Quality over quantity** - Fewer high-confidence repairs preferred over many low-confidence
17. ✅ **Repair evaluation suite** - Tests validate repairs are applicable and effective

### TypeScript Output Quality Criteria (In Progress)

18. 📋 **Idiomatic output** - Generated code looks human-written
19. 📋 **Stable output contract** - Consistent async/await, const, naming conventions
20. 📋 **Runtime helpers isolated** - Compiler-specific behavior in `@clank/runtime`
21. 📋 **Snapshot suite** - Golden outputs prevent style regressions
22. 📋 **Clean by default** - Debug mode optional, clean mode primary

---

*Last updated: January 2026*
