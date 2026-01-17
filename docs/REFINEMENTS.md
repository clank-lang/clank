# Refinement Types

**Status:** Fully implemented (basic solver; no SMT integration)

Refinement types allow specifying predicates that constrain values beyond their base type. The compiler attempts to prove these predicates statically using a built-in solver, and generates proof obligations when it cannot.

## Syntax

```clank
// Basic refinement type
Int{x > 0}           // Positive integer
Int{x != 0}          // Non-zero integer

// With explicit variable name
Int{n | n > 0}       // Same as above, but variable named 'n'

// Array length refinements
[T]{len(arr) > 0}    // Non-empty array

// Complex predicates
Int{x > 0 && x < 100}  // Bounded integer
```

## Predicates

Predicates are a subset of expressions that the solver can reason about:

| Category | Operators | Examples |
|----------|-----------|----------|
| Arithmetic | `+`, `-`, `*`, `/`, `%` | `x + 1`, `n * 2` |
| Comparison | `==`, `!=`, `<`, `>`, `<=`, `>=` | `x > 0`, `n != 0` |
| Logical | `&&`, `\|\|`, `!` | `x > 0 && x < 10` |
| Function calls | `len()` | `len(arr) > 0` |

## Proof Obligations

When a refined type is expected, the compiler emits a proof obligation:

```clank
fn div(n: Int, d: Int{d != 0}) -> Int { n / d }

fn example() -> Int {
  let x = 10;
  let y = get_input();  // Returns Int (unrefined)
  div(x, y)             // OBLIGATION: prove y != 0
}
```

### Automatic Discharge

The solver automatically discharges trivial obligations:

```clank
div(10, 2)              // Discharged: 2 != 0 is trivially true
div(x, x + 1)           // Requires reasoning: is x + 1 != 0?
```

### Branch Conditions

The solver tracks information from branches:

```clank
fn safe_div(n: Int, d: Int) -> Option[Int] {
  if d != 0 {
    Some(div(n, d))     // Discharged: branch condition proves d != 0
  } else {
    None
  }
}
```

## Solver Capabilities

The built-in constraint solver handles refinement predicates without external SMT solvers. Here's what it can prove:

### Basic Reasoning

| Capability | Example | Notes |
|------------|---------|-------|
| Constant evaluation | `5 > 0` -> true | Direct evaluation |
| Identity comparisons | `x == x` -> true | Reflexivity |
| Logical operators | `true && false` -> false | Boolean logic |

### Arithmetic Reasoning

| Capability | Example | Notes |
|------------|---------|-------|
| Variable definitions | If `m = n + 1` and `n > 0`, proves `m > 1` | Substitution |
| Transitive bounds | `x > 5` implies `x > 0` | Bound propagation |
| Arithmetic expressions | `x > 0` implies `x + 1 > 1` | Symbolic arithmetic |

### Array Length Reasoning

| Capability | Example | Notes |
|------------|---------|-------|
| Length constraints | `len(arr) > 0` proves `0 < len(arr)` | Symmetry |
| Bounds checking | `i >= 0 && i < len(arr)` | Automatic for indexing |

### Negation and De Morgan's Laws

| Capability | Example |
|------------|---------|
| Negation of comparisons | `!(x > 0)` simplifies to `x <= 0` |
| Double negation | `!(!P)` simplifies to `P` |
| De Morgan's Law 1 | `!(a && b)` transforms to `!a \|\| !b` |
| De Morgan's Law 2 | `!(a \|\| b)` transforms to `!a && !b` |

### Enhanced Refutation Detection

The solver can detect when predicates are definitely false (refuted), providing better error messages with counterexamples:

| Capability | Example | Notes |
|------------|---------|-------|
| Transitive bound refutation | Fact: `x > 5`, Goal: `x < 3` → refuted | Detects impossible bounds |
| Contradictory AND detection | `x > 0 && x < 0` → always false | Detects mutually exclusive branches |
| Arithmetic expression refutation | Fact: `x > 0`, Goal: `(x + 1) <= 0` → refuted | Reasons about arithmetic expressions |

**Example: Transitive Bound Refutation**
```clank
fn example(x: Int{x > 5}) -> Unit {
  // The solver knows x > 5
  if x < 3 {           // REFUTED: x > 5 contradicts x < 3
    // unreachable
  }
}
```

**Example: Contradictory AND Detection**
```clank
fn example(x: Int) -> Unit {
  if x > 0 && x < 0 {  // REFUTED: always false
    // unreachable
  }
}
```

**Example: Arithmetic Expression Refutation**
```clank
fn example(x: Int{x > 0}) -> Unit {
  // The solver knows x > 0, which implies x + 1 > 1
  if (x + 1) <= 0 {    // REFUTED: contradicts x > 0
    // unreachable
  }
}
```

## Return Type Refinements

Functions can have refined return types using the `result` variable. The syntax requires parentheses:

```clank
// Syntax: fn name() -> (Type{result predicate}) { body }

fn always_positive() -> (Int{result > 0}) {
  42  // Discharged: 42 > 0
}

fn pass_through(n: Int{n > 0}) -> (Int{result > 0}) {
  n  // Discharged: n > 0 from parameter
}

fn increment(n: Int{n >= 0}) -> (Int{result > 0}) {
  n + 1  // Discharged: n >= 0 implies n + 1 >= 1 > 0
}
```

The solver substitutes the return expression for `result` and proves the predicate.

## Counterexamples

When refinement predicates fail, the compiler generates **counterexamples** showing concrete variable assignments that violate the predicate.

### Counterexample Structure

```typescript
interface Counterexample {
  // Variable assignments that cause the predicate to fail
  x: string;           // e.g., "5"
  y: string;           // e.g., "-3"

  // Metadata (prefixed with _)
  _explanation: string;     // Human-readable explanation
  _violated?: string;       // The predicate that was violated
  _contradicts?: string;    // The fact that contradicts the predicate
}
```

### Types of Counterexamples

**1. Refuted (Definite)** - When the solver proves a predicate is definitely false:

```json
{
  "solverResult": "refuted",
  "counterexample": {
    "x": "6",
    "_explanation": "Predicate 'x <= 5' contradicts known fact 'x > 5'",
    "_violated": "x <= 5",
    "_contradicts": "x > 5 (from: parameter refinement)"
  }
}
```

**2. Unknown with Candidate** - When the solver can't prove a predicate but can suggest values:

```json
{
  "solverResult": "unknown",
  "counterexample": {
    "x": "0",
    "_explanation": "Possible counterexample: these values might violate 'x > 0'"
  }
}
```

### When Counterexamples Are Generated

| Solver Result | Counterexample Type | Description |
|---------------|---------------------|-------------|
| `discharged` | None | Predicate was proven true |
| `refuted` | Definite | Predicate contradicts known facts |
| `unknown` | Candidate (optional) | Suggested values that might violate predicate |

## Pre/Post Conditions

Functions can have preconditions and postconditions:

```clank
fn binary_search[T: Ord](arr: [T], target: T) -> Option[Int{i < len(arr)}]
  pre is_sorted(arr)
  post match result {
    Some(i) -> arr[i] == target,
    None -> !contains(arr, target)
  }
{
  // implementation
}
```

**Note:** Pre/post conditions are parsed but full verification is future work. Currently, they are documented but not enforced by the solver.

## Solver Limitations

The built-in solver cannot prove:

| Limitation | Example | Workaround |
|------------|---------|------------|
| Complex arithmetic | `x * x >= 0` | Add assertion or guard |
| Nonlinear constraints | `x * y > 0` | Split into cases |
| Quantified predicates | `forall i. arr[i] > 0` | Use array invariants |
| Recursive properties | List length after append | Trust or assert |

When the solver returns `unknown`, it provides hints for how to help the proof:

```json
{
  "obligation": "x != 0",
  "status": "unknown",
  "hints": [
    { "strategy": "guard", "template": "if x != 0 { ... }", "confidence": "high" },
    { "strategy": "refine_param", "template": "x: Int{x != 0}", "confidence": "medium" },
    { "strategy": "assert", "template": "assert x != 0", "confidence": "medium" }
  ]
}
```

## Programmatic API

```typescript
import { solve } from "./refinements/solver";
import { RefinementContext } from "./refinements/context";

// Create context with known facts
const ctx = new RefinementContext();
ctx.addFact(predicate, "source description");

// Solve a predicate
const result = solve(goal, ctx);

if (result.status === "discharged") {
  // Predicate proven true
} else if (result.status === "refuted") {
  // Predicate proven false
  console.log("Counterexample:", result.counterexample);
} else {
  // Unknown - couldn't prove or disprove
  console.log("Reason:", result.reason);
  if (result.candidate_counterexample) {
    console.log("Candidate:", result.candidate_counterexample);
  }
}
```

## Future Work

- **SMT solver integration** (Z3) for complex proofs
- **Proof caching** for repeated obligations
- **Tactics language** for guiding proofs
- **Full pre/post condition verification**

## See Also

- [Repairs](REPAIRS.md) - Repair strategies for refinement failures
- [Diagnostics](REPAIRS.md#error-codes) - Error codes E3001-E3004
- [Language Spec](SPEC.md#7-refinement-types) - Full refinement type specification
