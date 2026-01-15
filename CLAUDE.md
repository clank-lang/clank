# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Axon is an agent-first programming language designed for LLM code generation. It compiles to JavaScript/TypeScript and runs on Bun. The language prioritizes rich compiler feedback over human ergonomics, featuring refinement types, effect tracking, and linear types.

**Status:** Implementation in progress.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         axon-compiler                           │
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
axon/
├── src/
│   ├── index.ts              # Main entry point
│   ├── cli.ts                # Command-line interface ✓
│   ├── lexer/                # Tokenization (Unicode + ASCII) ✓
│   │   ├── lexer.ts          # Main lexer implementation
│   │   ├── tokens.ts         # Token types and keywords
│   │   └── unicode.ts        # Unicode character utilities
│   ├── parser/               # Recursive descent parser ✓
│   │   ├── parser.ts         # Main parser implementation
│   │   ├── ast.ts            # AST node types
│   │   └── index.ts          # Public exports
│   ├── types/                # Type checker ✓
│   │   ├── checker.ts        # Bidirectional type checker
│   │   ├── types.ts          # Internal type representation
│   │   ├── context.ts        # Type environment/scopes
│   │   ├── unify.ts          # Unification algorithm
│   │   ├── convert.ts        # AST TypeExpr → semantic Type
│   │   └── builtins.ts       # Built-in function signatures
│   ├── refinements/          # Refinement type checking ✓
│   │   ├── solver.ts         # Constraint solver
│   │   ├── extract.ts        # AST → predicate extraction
│   │   └── context.ts        # Refinement fact tracking
│   ├── codegen/              # JavaScript code generation ✓
│   │   ├── emitter.ts        # AST → JavaScript
│   │   └── runtime.ts        # Runtime helpers
│   ├── diagnostics/          # Structured error output ✓
│   │   ├── diagnostic.ts     # Diagnostic types
│   │   ├── codes.ts          # Error code registry
│   │   ├── collector.ts      # Diagnostic collection
│   │   └── formatter.ts      # JSON and pretty-print output
│   ├── ast-json/             # AST-as-JSON for agents ✓
│   │   ├── schema.ts         # JSON schema for AST nodes
│   │   ├── serialize.ts      # AST → JSON conversion
│   │   ├── deserialize.ts    # JSON → AST conversion
│   │   └── index.ts          # Public exports
│   └── utils/                # Shared utilities ✓
│       ├── span.ts           # Source location tracking
│       ├── source.ts         # Source file handling
│       └── result.ts         # Result type utilities
├── tests/
│   ├── lexer/                # Lexer tests ✓
│   ├── parser/               # Parser tests ✓
│   ├── types/                # Type checker tests ✓
│   ├── codegen/              # Code generation tests ✓
│   └── refinements/          # Refinement tests ✓
├── docs/                     # Language specification
└── .mise.toml                # Bun toolchain config
```

## CLI Commands

```bash
axon compile main.ax -o dist/    # Compile to JavaScript
axon check main.ax               # Type check only
axon run main.ax                 # Compile and execute with Bun
axon compile main.ax --emit=json # Output structured diagnostics
axon compile main.ax --emit=ast  # Output AST as JSON (planned)
```

## Key Language Features

- **Refinement types:** `ℤ{x > 0}`, `[T]{len(arr) > 0}` with proof obligations
- **Effect tracking:** `IO[T]`, `Err[E, T]`, `Async[T]`, `Mut[T]`
- **Linear types:** `Linear[T]` for resource management (static only)
- **Unicode syntax:** `ƒ` (fn), `λ` (lambda), `→` (arrow), `≠`, `≤`, `≥`, `∧`, `∨` with ASCII fallbacks
- **Pre/post conditions:** `pre is_sorted(arr)`, `post result > 0`
- **JS interop:** `external ƒ now() → ℤ = "Date.now"`, `external mod lodash = "lodash"`

## Compiler Output

The compiler produces structured JSON output with:
- Diagnostics (errors, warnings) with source locations
- Proof obligations with context and hints
- Type holes for incomplete code

Error codes follow the pattern: E0xxx (syntax), E1xxx (names), E2xxx (types), E3xxx (refinements), E4xxx (effects), E5xxx (linearity).

## Build Commands

Use `mise` to run bun commands (mise manages the bun toolchain):

```bash
mise run install     # Install dependencies (runs bun install)
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

## Development Notes

- **Bun is both the toolchain and target runtime** - we use Bun for building, testing, and running the compiler, and Axon programs compile to JS that runs on Bun
- Minimal dependencies philosophy - compiler should be self-contained
- Bidirectional type checking with Hindley-Milner inference for generics
- Built-in constraint solver for refinements (SMT/Z3 is post-MVP)

## Implementation Standards

- **Never leave things half-implemented, stubbed, or with TODOs** - complete each assigned feature or component fully
- Ask for clarification if something is blocking implementation rather than guessing or leaving incomplete
