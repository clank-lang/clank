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
| `obligations` | Proof obligations with solver results |
| `output` | Generated JavaScript (if compilation succeeded) |

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
