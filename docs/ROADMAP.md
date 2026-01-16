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
| **Repair Generation** | ✅ Complete | 22 tests | Machine-actionable patches for 12 error codes |
| **Canonical AST** | ✅ Complete | 98 tests | 4-phase transformation, validator insertion |
| **Counterexamples** | ✅ Complete | 54 tests | Concrete violations for refinement failures |
| **De Morgan's Laws** | ✅ Complete | 17 tests | Negation, double negation, De Morgan's |
| **Return Type Refinements** | ✅ Complete | 10 tests | Result variable substitution |
| **TypeScript Output** | ✅ Complete | 48 tests | Type annotations, snapshot suite, runtime types |

**Total: 601 passing tests**

### In Progress 🚧

| Component | Priority | Notes |
|-----------|----------|-------|
| **Repair Evaluation Suite** | High | End-to-end repair testing, metrics tracking |
| **Repair Compatibility** | High | Batch-safe repairs with conflict detection |

### Planned 📋

| Component | Priority | Notes |
|-----------|----------|-------|
| **Linear Types** | Low | Static checking only |
| **REPL** | Low | Interactive mode |
| **Watch Mode** | Low | Dev experience |
| **LSP** | Low | Language server protocol |

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
│   │   ├── hints.ts          # Hint generation for unprovable obligations
│   │   └── counterexample.ts # Counterexample generation ✅
│   ├── canonical/            # Canonical AST transformation ✅
│   │   ├── transformer.ts    # 4-phase transformation pipeline
│   │   ├── desugar.ts        # Unicode → ASCII, pipe expansion
│   │   ├── normalize.ts      # Explicit else, return statements
│   │   ├── effects.ts        # Effect annotation pass
│   │   └── validators.ts     # Runtime check insertion
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
├── tests/                    # 601 passing tests
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

### Solver Enhancements

**1. Return Type Result Variables** ✅ Done
```clank
// Note: Refined return types must be wrapped in parentheses to disambiguate from function body
fn abs(n: Int) -> (Int{result >= 0}) {
  if n >= 0 {
    n  // Context knows: n >= 0, proves: result >= 0 ✓
  } else {
    0 - n  // Context knows: n < 0, needs to prove: result >= 0
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

**3. Negation and De Morgan's Laws** ✅ Done
```clank
// The solver now understands:
// !(a && b) ↔ !a || !b   (De Morgan's Law)
// !(a || b) ↔ !a && !b   (De Morgan's Law)
// !(x > 0) ↔ x <= 0      (Negation of comparisons)
// !(!P) ↔ P              (Double negation elimination)
```

### Implementation Approach

1. ~~**Add symbolic arithmetic** - Track expressions like `n + 1`, substitute and simplify~~ ✅ Done
2. ~~**Add length tracking** - Map array variables to length constraints~~ ✅ Done
3. ~~**Improve fact collection** - Gather facts from if/match branches automatically~~ ✅ Done (branch conditions)
4. ~~**Add hint generation** - Suggest fixes for unprovable obligations~~ ✅ Done
5. ~~**Add counterexample generation** - Show concrete values that violate predicates~~ ✅ Done

---

## Repair Engine

The repair engine generates machine-actionable patches that agents can apply directly to fix compiler errors. Each repair includes confidence levels, safety classification, and PatchOps.

### Implemented Repairs ✅

| Error Code | Error | Repair | Safety | Confidence |
|------------|-------|--------|--------|------------|
| E1001 | UnresolvedName | `rename_symbol` to similar name | behavior_changing | high/medium |
| E1005 | UnresolvedType | `rename_symbol` to similar type | behavior_changing | high/medium |
| E2001 | TypeMismatch | `wrap` with type conversion | behavior_changing | high/medium |
| E2002 | ArityMismatch | `replace_node` add/remove args | behavior_changing | medium |
| E2003 | MissingField | `replace_node` add field | behavior_changing | high |
| E2004 | UnknownField | `rename_field` to similar field | behavior_changing | high/medium |
| E2013 | ImmutableAssign | `replace_node` adding `mut` | behavior_preserving | high |
| E2015 | NonExhaustiveMatch | `replace_node` add wildcard arm | likely_preserving | medium |
| E3001 | UnprovableRefinement | `wrap`/`insert_before` from hints | likely_preserving | high/medium |
| E4001 | EffectNotAllowed | `widen_effect` adding effect | likely_preserving | medium |
| E4002 | UnhandledEffect | `widen_effect` adding Err | likely_preserving | medium |
| W0001 | UnusedVariable | `replace_node` prefix underscore | behavior_preserving | high |

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

### PatchOp Types

```typescript
type PatchOp =
  | { op: "replace_node"; node_id: string; new_node: unknown }
  | { op: "insert_before"; target_id: string; new_statement: unknown }
  | { op: "insert_after"; target_id: string; new_statement: unknown }
  | { op: "wrap"; node_id: string; wrapper: unknown; hole_ref: string }
  | { op: "delete_node"; node_id: string }
  | { op: "widen_effect"; fn_id: string; add_effects: string[] }
  | { op: "rename_symbol"; node_id: string; old_name: string; new_name: string }
  | { op: "rename_field"; node_id: string; old_name: string; new_name: string }
```

---

## Repair Quality Evaluation Suite

**Status:** 📋 Planned
**Gate:** Required before declaring repair engine complete

Repair ranking must be a **tested contract**, not emergent behavior. This milestone introduces an end-to-end evaluation framework that validates repairs are mechanically applicable and achieve their claimed effects.

### Test Framework

Each test case follows this flow:

```
1. Compile failing input → collect diagnostics, obligations, holes
2. Select top-ranked repair
3. Apply repair to canonical_ast via PatchOp
4. Recompile patched AST
5. Assert:
   - Repair was mechanically applicable (no parse/apply errors)
   - expected_delta was achieved (diagnostics_resolved actually resolved)
   - No new errors introduced (monotonic progress)
```

### Ranking Invariants

The suite enforces ranking quality through regression tests:

| Invariant | Description |
|-----------|-------------|
| **High-confidence first** | `behavior_preserving` + `high` confidence repairs appear in top results |
| **Quality over quantity** | Prefer 1-2 high-quality repairs over 5+ low-signal candidates |
| **Deterministic ordering** | Same input always produces same repair ranking |
| **No false positives** | Repairs claiming `high` confidence must succeed when applied |

### Tracked Metrics

These metrics are computed over a benchmark set and tracked over time:

| Metric | Definition | Target |
|--------|------------|--------|
| **Top-1 applicability rate** | % of cases where top repair applies without error | > 95% |
| **Top-1 success rate** | % of cases where top repair achieves its expected_delta | > 90% |
| **Mean iterations-to-success** | Average compile cycles to reach `status: success` | < 3 |
| **Manual edit frequency** | % of cases requiring manual edits (no suitable repair) | < 10% |
| **Repair precision** | Repairs emitted that actually help / total repairs emitted | > 80% |

### Benchmark Set

The benchmark includes:
- Common typos (variable names, field names, type names)
- Missing mutability annotations
- Effect violations (IO in pure functions, unhandled Err)
- Arity mismatches (too few/many arguments)
- Refinement violations with available guards
- Cascading errors (one root cause, multiple diagnostics)

### Implementation Approach

1. Create `tests/evaluation/` directory for end-to-end repair tests
2. Implement `applyPatchOp()` function that applies PatchOps to AST
3. Add metric collection and reporting infrastructure
4. Establish baseline metrics on current implementation
5. Add CI job that fails on metric regression

---

## Repair Compatibility Metadata

**Status:** 📋 Planned
**Gate:** Required for batch repair application

Enable agents to safely apply multiple repairs in a single iteration when those repairs are known to be compatible. This reduces iterations-to-success without sacrificing determinism.

### Schema Extension

```typescript
interface RepairCandidate {
  // ... existing fields ...

  // Compatibility metadata
  compatibility?: {
    // Repairs that cannot be applied together with this one
    conflicts_with?: string[];  // repair IDs

    // Repairs that must be applied before this one
    requires?: string[];  // repair IDs

    // Repairs with the same batch_key commute and can be applied together
    batch_key?: string;
  };
}
```

### Compatibility Rules

Initial implementation uses conservative rules to avoid false positives:

| Rule | Description |
|------|-------------|
| **Disjoint nodes** | Repairs touching different `node_id`s are compatible |
| **Same diagnostic** | Multiple repairs for same diagnostic conflict |
| **Cascading fixes** | Child repairs `require` parent repairs |
| **Effect widening** | Multiple `widen_effect` on same function conflict |
| **Rename commutes** | `rename_symbol` repairs with disjoint targets share `batch_key` |

### Batch Application

When applying a compatible batch:

```
1. Sort repairs by dependency order (requires)
2. Filter to repairs with matching batch_key or no conflicts
3. Apply all repairs to canonical_ast
4. Recompile once
5. Assert: combined expected_delta achieved
6. Assert: monotonic reduction in problem set
```

### Test Cases

```typescript
describe("repair compatibility", () => {
  test("disjoint renames can be batched", () => {
    // Two typos in different variables
    // Both repairs should have same batch_key
    // Applying both should fix both diagnostics
  });

  test("same-node repairs conflict", () => {
    // Two different fixes for same error
    // Should have conflicts_with references
    // Only one should be applied
  });

  test("cascading repairs have requires", () => {
    // Fix that enables another fix
    // Child repair requires parent
    // Applying in wrong order fails
  });
});
```

### Success Criteria

- Batch application reduces mean iterations by 20%+
- No false compatibility (batched repairs that break)
- Deterministic batch selection (same input → same batch)

---

## TypeScript Output Contract

**Status:** ✅ Mostly Complete
**Gate:** Required before 1.0 release

TypeScript output quality is an **API contract**, not an implementation detail. This milestone establishes golden snapshot testing and style invariants that make readability a correctness requirement.

### Golden Snapshot Suite

Location: `tests/golden/`

```
tests/golden/
├── inputs/           # Canonical AST JSON inputs
│   ├── basic-fn.json
│   ├── generics.json
│   ├── effects.json
│   └── ...
├── outputs/          # Approved TypeScript outputs
│   ├── basic-fn.ts
│   ├── generics.ts
│   ├── effects.ts
│   └── ...
└── golden.test.ts    # Snapshot comparison tests
```

Test flow:
```typescript
for (const input of goldenInputs) {
  const result = compile(input, { format: true });
  const expected = readGoldenOutput(input.name);
  expect(result.output).toBe(expected);
}
```

### Style Invariants

Automated checks enforce these invariants:

| Invariant | Rule |
|-----------|------|
| **Stable async/await** | Async functions always use `async`/`await`, never raw Promises |
| **No unnecessary temporaries** | Don't emit `const _tmp = x; return _tmp;` |
| **Predictable naming** | Generated names follow pattern: `_clank_<purpose>_<id>` |
| **Const by default** | Use `const` unless mutation is required |
| **No inline runtime** | Runtime helpers imported from `@clank/runtime`, never inlined |
| **Minimal parentheses** | Only emit parens when precedence requires them |
| **Consistent formatting** | Output is deterministically formatted (same AST → same text) |

### Runtime Isolation

All compiler-specific runtime behavior lives in `@clank/runtime`:

```typescript
// Generated code imports helpers
import { assertRefinement, matchExhaustive } from "@clank/runtime";

// NOT inlined:
// function assertRefinement(val, pred, msg) { ... }
```

### Change Policy

Changes to codegen output are **contract changes**:

1. **Intentional updates** — Run `bun test:golden --update` to regenerate
2. **Review as API change** — Golden diffs require explicit approval
3. **Document rationale** — Commit message explains why output changed
4. **No incidental changes** — Refactors must not change golden outputs

### Representative Inputs

The golden suite covers:

| Category | Examples |
|----------|----------|
| **Basic** | Functions, let bindings, literals, operators |
| **Control flow** | If/else, match, loops, early return |
| **Types** | Generics, refinements, records, sum types |
| **Effects** | IO functions, error propagation, async |
| **Interop** | External functions, external modules |
| **Edge cases** | Nested expressions, unicode identifiers, large literals |

### Metrics

| Metric | Target |
|--------|--------|
| **Stability** | 0 unintentional golden changes per release |
| **Readability** | Output passable as human-written code |
| **Size** | No more than 20% overhead vs hand-written equivalent |

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

### Repair Engine Criteria

7. ✅ **Repair candidates emitted** - Diagnostics have `repair_refs` linking to repairs
8. ✅ **Patches are machine-applicable** - `PatchOp` can be applied without parsing
9. ✅ **Canonical AST returned** - `canonical_ast` in every `CompileResult`
10. ✅ **Node IDs stable** - References work across compile iterations
11. ✅ **Counterexamples preferred** - Solver provides concrete violations when possible

### Repair Quality Criteria (In Progress)

12. ✅ **Safety classification** - Every repair has `safety: behavior_preserving | likely_preserving | behavior_changing`
13. ✅ **Scope tracking** - Every repair includes `node_count` and `crosses_function`
14. ✅ **Deterministic patterns** - Repairs are recipe-based, not heuristic
15. ✅ **Expected delta required** - Every repair specifies what it resolves
16. ✅ **Quality over quantity** - Fewer high-confidence repairs preferred over many low-confidence
17. 📋 **Repair evaluation suite** - End-to-end tests validate repairs are applicable and achieve claimed deltas
18. 📋 **Repair compatibility metadata** - Batch-safe repairs with `conflicts_with`, `requires`, `batch_key`

### TypeScript Output Quality Criteria

19. ✅ **Idiomatic output** - Generated code looks human-written
20. ✅ **Stable output contract** - Consistent async/await, const, naming conventions
21. ✅ **Runtime helpers isolated** - Compiler-specific behavior in `__clank` runtime
22. ✅ **Golden snapshot suite** - Approved outputs prevent style regressions
23. 📋 **Clean by default** - Debug mode optional, clean mode primary

---

*Last updated: January 2026*
