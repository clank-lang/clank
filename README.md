# Clank

An **agent-oriented IR and compiler protocol** whose canonical program representation is AST JSON, not text.

## What is Clank?

Clank is a programming language designed for AI agents. Unlike traditional compilers that produce human-readable error messages, Clank's compiler is a **repair engine** that outputs machine-actionable patches. This minimizes agent-compiler iterations and enables faster, more reliable code generation.

**Key principles:**
- **AST JSON is canonical** — Agents submit programs as JSON, receive feedback as JSON, apply patches as JSON operations
- **`.clank` is a debug view** — Text syntax exists for human inspection, not as the primary interface
- **Repair-first diagnostics** — Every error includes ranked repair candidates that agents can directly apply
- **Runtime backstop** — Validators are inserted at boundaries with unknown types

## Features

- **Refinement types** — `Int{x > 0}`, `[T]{len(arr) > 0}` with proof obligations
- **Effect tracking** — `IO[T]`, `Err[E, T]`, `Async[T]`, `Mut[T]`
- **Linear types** — `Linear[T]` for resource management
- **Unicode syntax** — `fn` or `ƒ`, `->` or `→`, with ASCII fallbacks
- **Pre/post conditions** — `pre is_sorted(arr)`, `post result > 0`
- **JS interop** — `external fn now() -> Int = "Date.now"`

## Installation

Clank uses [mise](https://mise.jdx.dev/) to manage the Bun toolchain.

```bash
# Install dependencies
mise run install

# Verify installation
mise run test
```

## Usage

### CLI Commands

```bash
# Compile to JavaScript
clank compile main.clank -o dist/

# Type check only
clank check main.clank

# Compile and execute
clank run main.clank

# Output structured diagnostics (JSON)
clank compile main.clank --emit=json

# Output AST as JSON
clank compile main.clank --emit=ast

# Compile from AST JSON input
clank compile program.json --input=ast
```

### Example Program

```clank
fn factorial(n: Int) -> Int {
  if n <= 1 {
    1
  } else {
    n * factorial(n - 1)
  }
}

fn main() -> IO[()] {
  let result = factorial(5);
  print(result)
}
```

### AST JSON Input

Agents can construct programs directly as JSON:

```json
{
  "kind": "program",
  "declarations": [
    {
      "kind": "fn",
      "name": "add",
      "params": [
        { "name": "a", "type": { "kind": "named", "name": "Int" } },
        { "name": "b", "type": { "kind": "named", "name": "Int" } }
      ],
      "returnType": { "kind": "named", "name": "Int" },
      "body": { "source": "a + b" }
    }
  ]
}
```

## Compiler Output

The compiler returns structured `CompileResult` JSON containing:

| Field | Description |
|-------|-------------|
| `canonical_ast` | Normalized AST (always operate on this, not your input) |
| `repairs` | Ranked repair candidates with machine-applicable patches |
| `diagnostics` | Errors/warnings with node IDs and repair references |
| `obligations` | Proof obligations with solver results and counterexamples |
| `output` | Generated JavaScript (if compilation succeeded) |

## Canonical AST

The compiler transforms your input into a **canonical AST** that agents should always operate on. This transformation:

- **Desugars syntax** — Unicode operators (`≠`, `≤`, `∧`) become ASCII (`!=`, `<=`, `&&`), pipe operators expand to function calls
- **Normalizes structure** — Adds explicit `else` branches, explicit `return` statements
- **Annotates effects** — Marks expressions with their inferred effects
- **Inserts validators** — Adds runtime checks at type boundaries with unknown types

The canonical AST is **idempotent** (running it twice produces the same result) and **deterministic** (same input always produces same output). Always apply repairs to the `canonical_ast` from the compiler response, not your original input.

## Counterexamples

When refinement predicates fail, the compiler generates **counterexamples** showing concrete variable assignments that violate the predicate:

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

Counterexamples help agents understand:
- **What values fail** — Concrete assignments showing the violation
- **Why they fail** — The `_explanation` field explains the reasoning
- **What to fix** — The `_violated` field shows the exact predicate that failed

| Solver Result | Counterexample | Description |
|---------------|----------------|-------------|
| `discharged` | None | Predicate was proven true |
| `refuted` | Definite | Predicate contradicts known facts |
| `unknown` | Candidate (optional) | Suggested values that might violate predicate |

## Development

```bash
mise run install     # Install dependencies
mise run check       # Type check with TypeScript
mise run test        # Run all tests
mise run dev <file>  # Run compiler in dev mode
```

## Documentation

- [Language Specification](docs/SPEC.md) — Full language reference
- [Roadmap](docs/ROADMAP.md) — Implementation status and plans
- [CLAUDE.md](CLAUDE.md) — AI assistant guidelines

## License

MIT
