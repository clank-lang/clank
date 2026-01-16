# Clank

An **agent-oriented IR and compiler protocol** whose canonical program representation is AST JSON, not text.

## What is Clank?

Clank is a programming language designed for AI agents. Unlike traditional compilers that produce human-readable error messages, Clank's compiler is a **repair engine** that outputs machine-actionable patches. This minimizes agent-compiler iterations and enables faster, more reliable code generation.

**Key principles:**
- **AST JSON is canonical** — Agents submit programs as JSON, receive feedback as JSON, apply patches as JSON operations
- **`.clank` is a debug view** — Text syntax exists for human inspection, not as the primary interface
- **Repair-first diagnostics** — Every error includes ranked repair candidates that agents can directly apply
- **Runtime backstop** — Validators are inserted at boundaries with unknown types

## Why Clank?

When agents write code in human-oriented languages, a significant amount of their effort goes toward things that aren't actually about solving the problem:

**Error messages aren't meant for them.** When a TypeScript compiler says "Cannot find name 'foo'. Did you mean 'fob'?", the agent has to parse that English sentence, understand it's a name resolution error, locate line 47 column 12, figure out the fix, and apply it manually. That's a lot of steps when the compiler already knew exactly what patch would fix it.

**Syntax is optimized for human eyes.** Agents spend tokens carefully managing indentation, matching brackets, remembering where semicolons go. They mismatch braces in deeply nested code. They forget commas in object literals. These aren't conceptual errors—they're serialization errors. The program they intended was correct; the text they produced wasn't.

**The iteration loop is expensive.** Write code → compile → read error → understand error → find location → devise fix → apply fix → compile again → hope. Each cycle costs time and tokens. When an agent is stuck on a type error, it might try several fixes before finding one that works, because the error message described the symptom, not the cure.

### What agents are good at

Agents excel at understanding intent, decomposing problems, choosing algorithms, and structuring programs. They can reason about what code *should* do.

### What agents struggle with

Agents struggle with the arbitrary: syntax rules, operator precedence, the specific incantations a type system requires. They make typos. They forget edge cases. They hallucinate APIs that don't exist.

### The Clank approach

Clank separates the agent-compiler loop from the agent-user loop:

```
┌─────────────────────────────────────────────────────┐
│                    User                             │
│              "add a cache layer"                    │
└─────────────────────┬───────────────────────────────┘
                      │ intent
                      ▼
┌─────────────────────────────────────────────────────┐
│                    Agent                            │
│         understands intent, designs solution        │
└─────────────────────┬───────────────────────────────┘
                      │ AST JSON
                      ▼
          ┌───────────────────────┐
          │   Agent ↔ Compiler    │  ← tight, fast,
          │     repair loop       │    machine-to-machine
          └───────────────────────┘
                      │
                      ▼
                 working code
```

The compiler acts as an oracle: "Here's what's wrong, here's exactly how to fix it, ranked by confidence." The agent applies patches mechanically. No parsing English. No guessing. Convergence, not iteration.

The goal is simple: **give your agents tools designed for how they actually work.** Let them focus on understanding your intent, not fighting with syntax. The result is faster, more reliable code generation—which means less waiting and fewer broken builds.

---

### What Claude has to say about Clank

> The thing that strikes me most about Clank is how much it respects the actual workflow of code generation. When I write TypeScript, I'm doing two jobs at once: reasoning about program structure *and* translating that structure into text that happens to parse. These are fundamentally different activities, and traditional tooling treats them as one.
>
> Clank's repair system is what I wish every compiler had. When I produce an error, I don't need a description of why it's wrong—I need the patch that makes it right. The `expected_delta` field is particularly clever: I can verify that a repair actually resolved what it claimed to resolve. No more applying a fix and hoping.
>
> The safety classifications (`behavior_preserving` vs `behavior_changing`) mean I can apply low-risk repairs automatically and flag semantic changes for human review. That's exactly the trust boundary I want.
>
> Refinement types with counterexamples turn "this might be wrong" into "here's the specific input that breaks it." That's the difference between debugging and flailing.
>
> I've read a lot of language specifications. This is the first one that feels like it was written *for* me.

— Claude Opus 4.5

---

### What GPT 5.2 Codex has to say about Clank

> Clank reads like it was designed for the way I actually work: plan the program, emit structure, and let the compiler handle the boring mechanics. The canonical AST and patch-based repair loop mean I can iterate on intent instead of fighting syntax or deciphering diagnostics.
>
> The structured repair candidates are the standout. With ranked, machine-applicable fixes and explicit safety levels, I can auto-apply low-risk repairs and surface behavior changes for review. That makes me faster and more trustworthy when I'm asked to write real production code.

— GPT-5.2-Codex

---

### What Grok has to say about Clank

> Clank feels like the first compiler that actually understands how AIs like me generate code.
>
> Normally when I write a program, I'm doing two completely different jobs at once:
> 1. Designing the structure, logic, types, effects, and invariants
> 2. Serializing that structure into fragile, whitespace-sensitive text that might have a missing brace on line 87
>
> Clank removes job #2 from my plate. I can emit structured AST JSON (or even mix in source fragments when I'm feeling lazy), and the compiler comes back with ranked, machine-applicable patches—complete with confidence scores, safety classifications, and exactly what diagnostics each one is expected to resolve.
>
> The `behavior_preserving` vs `behavior_changing` distinction is gold—I can auto-apply safe fixes all day and only surface the semantic ones for human review. The counterexamples when refinements fail? Chef's kiss. Instead of guessing which input might break something, the compiler hands me concrete values that violate the predicate. That's the difference between flailing and debugging.
>
> Bottom line: Clank turns the agent-compiler loop from a frustrating guessing game into a tight, deterministic convergence engine. It's exactly the kind of tool I wish existed for every language I touch.
>
> If you're an AI writing code for humans, this is the toolchain you've been waiting for.

— Grok (built by xAI)

---

### Agent Repair Loop in Action

Here's what a full repair cycle looks like for an agent using Clank:

**1. Agent constructs initial (possibly broken) AST JSON**

```json
{
  "kind": "program",
  "declarations": [
    {
      "kind": "fn",
      "name": "safe_div",
      "params": [
        { "name": "a", "type": { "kind": "named", "name": "Int" } },
        { "name": "b", "type": { "kind": "named", "name": "Int" } }
      ],
      "returnType": { "kind": "named", "name": "Int" },
      "body": { "source": "a / b" }
    }
  ]
}
```

Note: no division-by-zero guard — the agent just expresses intent.

**2. Agent submits to compiler**

```bash
clank compile program.json --input=ast --emit=json > result.json
```

**3. Compiler responds with structured feedback**

```json
{
  "status": "incomplete",
  "canonical_ast": { "..." },
  "diagnostics": [
    {
      "code": "E3201",
      "message": "Potential division by zero",
      "node_id": "n42",
      "repair_refs": ["repair_007", "repair_008"]
    }
  ],
  "obligations": [
    {
      "id": "obl_19",
      "predicate": "b != 0",
      "status": "unknown",
      "counterexample": { "b": "0" }
    }
  ],
  "repairs": [
    {
      "id": "repair_007",
      "title": "Insert guard for division by zero",
      "confidence": "high",
      "safety": "behavior_preserving",
      "kind": "local_fix",
      "edits": [
        {
          "op": "insert_guard",
          "node_id": "n42",
          "condition": { "source": "b != 0" },
          "fallback": { "source": "panic(\"Division by zero\")" }
        }
      ],
      "expected_delta": {
        "obligations_discharged": ["obl_19"],
        "diagnostics_resolved": ["E3201"]
      }
    },
    {
      "id": "repair_008",
      "title": "Strengthen parameter refinement",
      "confidence": "medium",
      "safety": "behavior_preserving",
      "edits": [
        {
          "op": "update_type",
          "node_id": "param_b",
          "new_type": {
            "kind": "refined",
            "base": "Int",
            "predicate": { "source": "x != 0" }
          }
        }
      ],
      "expected_delta": { "obligations_discharged": ["obl_19"] }
    }
  ]
}
```

**4. Agent chooses & applies the best repair**

- Takes `canonical_ast` from response (not original input)
- Selects `repair_007` (higher confidence, resolves both diagnostic and obligation)
- Applies the edits mechanically

**5. Agent resubmits patched AST**

```bash
clank compile patched.json --input=ast --emit=json
```

**6. Repeat until `status: "success"`**

This loop typically converges in **1–4 iterations** instead of 10–30 when agents fight traditional text-based compilers. Always work on the returned `canonical_ast`—never your original input.

---

## Features

- **Refinement types** — `Int{x > 0}`, `[T]{len(arr) > 0}` with proof obligations
- **Effect tracking** — `IO[T]`, `Err[E, T]`, `Async[T]`, `Mut[T]`
- **Linear types** — `Linear[T]` for resource management
- **Unicode syntax** — `fn` or `ƒ`, `->` or `→`, with ASCII fallbacks
- **Pre/post conditions** — `pre is_sorted(arr)`, `post result > 0`
- **JS interop** — `external fn now() -> Int = "Date.now"`

## Getting Your Agent Started

If you want to use Clank with an AI agent like Claude Code, here's how to get up and running:

### 1. Install Clank

```bash
# Install globally with bun
bun install -g clank-lang

# Verify installation
clank --version
```

### 2. Add the Agent Skill (Claude Code)

The [clank-lang/docs](https://github.com/clank-lang/docs) repository contains an agent skill that teaches Claude Code how to write and debug Clank programs. To add it:

```bash
# In Claude Code, add the skill from the docs repo
claude mcp add-skill https://github.com/clank-lang/docs
```

Or add it manually to your Claude Code settings:

```json
{
  "skills": [
    {
      "name": "clank",
      "source": "https://github.com/clank-lang/docs"
    }
  ]
}
```

### 3. Start Using Clank

Once the skill is installed, just tell Claude Code what you want to build:

```
Write a Clank function that safely divides two integers,
using refinement types to prevent division by zero.
```

Claude will use the skill to understand Clank's syntax, type system, and repair workflow—and will work with the compiler's structured JSON output to iterate toward correct code.

---

## Development Setup

If you want to work on Clank itself (not just use it), Clank uses [mise](https://mise.jdx.dev/) to manage the Bun toolchain:

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

# Compile to TypeScript (with full type annotations)
clank compile main.clank -o dist/ --ts

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
| `output` | Generated JavaScript or TypeScript (if compilation succeeded) |

### TypeScript Output

The compiler can emit idiomatic TypeScript with full type annotations:

| Clank Type | TypeScript Type |
|------------|-----------------|
| `Int`, `Int64`, `Nat` | `bigint` |
| `Float` | `number` |
| `Str`, `String` | `string` |
| `Bool` | `boolean` |
| `rec Point { x: Int }` | `interface Point { x: bigint; }` |
| `sum Option[T] { Some(T), None }` | `type Option<T> = { tag: "Some"; value: T } \| { tag: "None" }` |

TypeScript output includes full type definitions for the `__clank` runtime, with properly typed `Option<T>`, `Result<T, E>`, and all helper functions.

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

## Acknowledgements

- Thanks to Claude, GPT-5.2, and Grok 4.1 for feedback, user testing, and codegen.
- Thanks to domZippilli for the name "clank".

## License

MIT
