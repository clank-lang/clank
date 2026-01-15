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

**Total: 290 passing tests**

### In Progress 🔄

| Component | Status | Notes |
|-----------|--------|-------|
| **Effect Tracking** | 🔄 Parsed | Syntax works, enforcement not complete |

### Planned 📋

| Component | Priority | Notes |
|-----------|----------|-------|
| **Array Length Reasoning** | High | Bounds checking, len() constraints |
| **Better Hints** | Medium | Suggest fixes for unprovable obligations |
| **Effect Enforcement** | Medium | IO/Async/Err checking |
| **Linear Types** | Low | Static checking only |
| **REPL** | Low | Interactive mode |
| **Watch Mode** | Low | Dev experience |

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
│   │   └── context.ts        # Refinement fact + definition tracking
│   ├── codegen/              # JavaScript generation ✅
│   ├── diagnostics/          # Structured error output ✅
│   ├── ast-json/             # AST-as-JSON for agents ✅
│   └── utils/                # Shared utilities ✅
├── tests/                    # 290 passing tests
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

### Example: Arithmetic Reasoning
```clank
fn example(n: Int{n > 0}) -> Int {
  let m = n + 1
  // Solver proves: m > 0 (because n > 0 implies n + 1 > 1 > 0)
  requires_positive(m)  // ✅ Discharged
}
```

### Planned Enhancements

**1. Array Length Reasoning**
```clank
fn first[T](arr: [T]{len(arr) > 0}) -> T {
  arr[0]  // Should prove: 0 < len(arr)
}

fn safe_access[T](arr: [T], i: Int{i >= 0 && i < len(arr)}) -> T {
  arr[i]  // Should prove: bounds check satisfied
}
```

**3. Branch Condition Integration**
```clank
fn abs(n: Int) -> Int{result >= 0} {
  if n >= 0 {
    n  // Context knows: n >= 0, should prove: n >= 0 ✓
  } else {
    -n  // Context knows: n < 0, should prove: -n >= 0
  }
}
```

**4. Better Hints for Unprovable Obligations**
```json
{
  "obligation": "x != 0",
  "status": "unknown",
  "hints": [
    "Add a guard: if x != 0 { ... }",
    "Strengthen parameter type: x: Int{x != 0}",
    "Known facts: x: Int (no constraints)"
  ]
}
```

**5. Negation and De Morgan's Laws**
```clank
// Should understand:
// !(a && b) ↔ !a || !b
// !(a || b) ↔ !a && !b
// !(x > 0) ↔ x <= 0
```

### Implementation Approach

1. ~~**Add symbolic arithmetic** - Track expressions like `n + 1`, substitute and simplify~~ ✅ Done
2. **Add length tracking** - Map array variables to length constraints
3. ~~**Improve fact collection** - Gather facts from if/match branches automatically~~ ✅ Done (branch conditions)
4. **Add hint generation** - Suggest fixes for unprovable obligations
5. **Add counterexample generation** - Show concrete values that violate predicates

---

## Future Phases

### Effect System (Post-Solver)
- Parse effect annotations (done)
- Infer effects within functions
- Check effect signatures
- Generate appropriate async code

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

The MVP is complete when:

1. ✅ **Compiles valid Clank to working JS** - Example programs run correctly
2. ✅ **Rejects invalid programs with good errors** - Type mismatches caught
3. ✅ **Refinement obligations work** - Arithmetic reasoning, trivial ones discharged, others reported
4. 📋 **Effect tracking works** - IO/Err effects tracked and checked
5. ✅ **Structured output complete** - JSON output matches spec
6. ✅ **Agent API works** - AST-as-JSON bidirectional conversion

---

*Last updated: January 2025*
