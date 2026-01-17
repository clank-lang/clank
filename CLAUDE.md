# Clank

## Project Overview

Clank is an **agent-oriented IR and compiler protocol** whose canonical program representation is **AST JSON**, not `.clank` text.

The compiler is a **repair engine** that minimizes agent-to-compiler iterations by providing machine-actionable repair patches. The `.clank` text syntax exists for human debugging and inspection only.

**Key principles:**
- AST JSON is canonical; `.clank` is a debug view
- Every diagnostic includes repair candidates (patches) that agents can apply directly
- The compiler returns a canonical AST reflecting desugaring and normalization
- Runtime validators are inserted at boundaries with unknown types

**Status:** Implementation substantially complete. See [ROADMAP.md](docs/ROADMAP.md) for planned features.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         clank-compiler                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────┐   ┌────────┐   ┌───────────────┐   ┌───────────┐  │
│  │  Lexer  │ → │ Parser │ → │  Type Checker │ → │  Codegen  │  │
│  └─────────┘   └────────┘   └───────────────┘   └───────────┘  │
│                                    │                            │
│                             ┌──────┴──────┐                     │
│                             │   Solver    │                     │
│                             │ (refinements)│                     │
│                             └─────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
clank/
├── src/
│   ├── index.ts              # Main entry point
│   ├── cli.ts                # Command-line interface
│   ├── lexer/                # Tokenization (Unicode + ASCII)
│   ├── parser/               # Recursive descent parser
│   ├── types/                # Bidirectional type checker
│   ├── refinements/          # Refinement type solver
│   ├── codegen/              # JavaScript/TypeScript code generation
│   ├── diagnostics/          # Structured errors with repair candidates
│   ├── ast-json/             # AST-as-JSON for agents
│   ├── canonical/            # AST canonicalization transforms
│   └── utils/                # Shared utilities
├── tests/
│   ├── lexer/                # Lexer tests
│   ├── parser/               # Parser tests
│   ├── types/                # Type checker tests
│   ├── codegen/              # Code generation tests
│   ├── refinements/          # Refinement tests
│   └── golden/               # Golden integration tests (CRITICAL)
├── docs/                     # Feature documentation
└── .mise.toml                # Bun toolchain config
```

## Feature Documentation

Detailed documentation lives in `docs/`. Refer to these when working on specific features:

| Topic | File | Description |
|-------|------|-------------|
| **CLI** | [docs/CLI.md](docs/CLI.md) | Commands, flags, and emit formats |
| **AST-JSON** | [docs/AST-JSON.md](docs/AST-JSON.md) | Agent API, JSON schema, source fragments |
| **Code Generation** | [docs/CODEGEN.md](docs/CODEGEN.md) | TypeScript output, type mapping, runtime |
| **Refinements** | [docs/REFINEMENTS.md](docs/REFINEMENTS.md) | Refinement types, solver capabilities, counterexamples |
| **Effects** | [docs/EFFECTS.md](docs/EFFECTS.md) | Effect tracking (IO, Err, Async, Mut) |
| **Repairs** | [docs/REPAIRS.md](docs/REPAIRS.md) | Repair system, agent strategy, error codes |
| **Language Spec** | [docs/SPEC.md](docs/SPEC.md) | Full language specification |
| **Roadmap** | [docs/ROADMAP.md](docs/ROADMAP.md) | Planned features and milestones |

## Quick Reference

### CLI Commands

```bash
clank compile main.clank -o dist/       # Compile to JavaScript
clank compile main.clank -o dist/ --ts  # Compile to TypeScript
clank check main.clank                  # Type check only
clank run main.clank                    # Compile and execute
clank compile main.clank --emit=json    # Structured diagnostics
clank compile main.clank --emit=ast     # Output AST as JSON
clank compile prog.json --input=ast     # Compile from AST JSON
```

See [docs/CLI.md](docs/CLI.md) for full CLI reference.

### Compiler Output

The compiler produces structured JSON `CompileResult`:
- `canonical_ast` — Normalized AST (always operate on this)
- `repairs` — Ranked repair candidates with machine-applicable patches
- `diagnostics` — Errors/warnings with `repair_refs`
- `obligations` — Proof obligations with solver results
- `output` — Generated JS/TS (if successful)

Error code pattern: E0xxx (syntax), E1xxx (names), E2xxx (types), E3xxx (refinements), E4xxx (effects), E5xxx (linearity).

See [docs/REPAIRS.md](docs/REPAIRS.md) for full error code reference and repair strategy.

### Key Language Features

| Feature | Status | Documentation |
|---------|--------|---------------|
| Refinement types | Implemented | [docs/REFINEMENTS.md](docs/REFINEMENTS.md) |
| Effect tracking | Implemented | [docs/EFFECTS.md](docs/EFFECTS.md) |
| TypeScript output | Implemented | [docs/CODEGEN.md](docs/CODEGEN.md) |
| AST-JSON API | Implemented | [docs/AST-JSON.md](docs/AST-JSON.md) |
| Repair generation | Implemented | [docs/REPAIRS.md](docs/REPAIRS.md) |
| Linear types | Error codes only | Not enforced yet |
| SMT solver | Future | Currently uses built-in solver |

### Agent Workflow

1. Submit AST → receive `CompileResult`
2. If `status == "success"`: done
3. Filter repairs: `behavior_preserving` or `likely_preserving` only
4. Sort by: confidence → kind → scope
5. Apply top repair
6. Recompile with `--input=ast`
7. Repeat

See [docs/REPAIRS.md](docs/REPAIRS.md) for full repair strategy.

## Build Commands

Use `mise` to run bun commands (mise manages the bun toolchain):

```bash
mise run install     # Install dependencies
mise run check       # Type check with TypeScript
mise run test        # Run all tests
mise run test:lexer  # Run lexer tests only
mise run dev <file>  # Run compiler in dev mode
```

Or use `mise exec` to run bun directly:

```bash
mise exec -- bun install
mise exec -- bun test
```

**Important:** bun isn't installed system-wide. Use mise to run a specific version.

## Pre-Commit Requirements

**Before committing any changes**, run the full test suite:

```bash
mise exec -- bun run check              # Type check
mise exec -- bun test                   # All unit tests
mise exec -- bun test tests/golden/     # Golden integration tests
```

The golden tests (`tests/golden/`) are **critical integration tests** that verify:
1. Complete applications compile to correct TypeScript (snapshot tests)
2. Intentional errors produce the right diagnostics and repairs

**If golden tests fail:**
1. **Snapshot mismatch**: Review diff. If intentional, update with `bun test tests/golden/ --update-snapshots`
2. **Repair verification failure**: Check `src/diagnostics/repairs.ts`
3. **New errors in valid fixtures**: Investigate before committing

Golden tests run in CI on every PR. Fix failures locally before pushing.

## Development Notes

- **Bun is both the toolchain and target runtime** - we use Bun for building/testing, and Clank programs compile to JS that runs on Bun
- Minimal dependencies philosophy - compiler should be self-contained
- Bidirectional type checking with Hindley-Milner inference for generics
- Built-in constraint solver for refinements (SMT/Z3 is post-MVP)

## Implementation Standards

- **Never leave things half-implemented, stubbed, or with TODOs** - complete each assigned feature fully
- Ask for clarification if something is blocking implementation

### Feature Development Rules

These rules are non-negotiable:

1. **Repair-first design** — Every new feature must ship with at least one canonical repair pattern. If we can't define deterministic repairs for a feature's error cases, the feature is not ready.

2. **No partial implementations** — Features without deterministic repairs should be postponed. A feature that produces diagnostics without actionable repairs degrades the agent experience.

3. **Solver coverage requirement** — If a feature produces frequent `unknown` solver results without counterexamples, that's a design smell. Either simplify the feature's semantics or enhance the solver first.

4. **Documentation requirement** — When implementing new features or changing existing ones, update all affected documentation in the same commit. This includes:
   - Feature-specific doc in `docs/`
   - This file (CLAUDE.md) if it affects the overview
   - README if user-facing

   Stale documentation is a bug.
