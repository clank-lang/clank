# Clank Examples for LLM Agents

These examples showcase Clank's unique features that make it faster, safer, and more
efficient for LLM agents to generate code compared to vanilla TypeScript.

## Why Clank for LLM Code Generation?

| Feature | Clank | TypeScript |
|---------|-------|------------|
| Invalid inputs | Compile-time rejection | Runtime crashes |
| Array bounds | Statically proven safe | Runtime exceptions |
| Code generation | Structured JSON AST | String manipulation |
| Exhaustive handling | Enforced by compiler | Optional `never` checks |
| Constraint validation | Type-encoded | Manual runtime checks |

## Examples

### 1. `safe-api.clank` - Compile-Time API Safety

Demonstrates how refinement types eliminate entire classes of runtime errors:
- Port numbers constrained to valid range (1-65535)
- Non-zero denominators for division
- Positive quantities for e-commerce

**Agent benefit:** No need to generate defensive runtime checks. Invalid code won't compile.

### 2. `array-safety.clank` - Automatic Bounds Checking

Shows the constraint solver automatically proving array accesses are safe:
- Length-aware array operations
- Safe head/tail with refinement types
- Compiler tracks facts through conditionals

**Agent benefit:** Agents can't generate array-out-of-bounds bugs. The compiler catches them.

### 3. `agent-codegen.json` - Programmatic Code Generation

A complete JSON AST that compiles to working Clank code. Shows:
- Structured generation (no syntax errors possible)
- Hybrid approach mixing AST nodes with source fragments
- Type-safe function generation

**Agent benefit:** Generate code as data structures, not strings. Eliminates parsing errors.

### 4. `state-machine.clank` - Exhaustive Pattern Matching

Demonstrates sum types with guaranteed exhaustive handling:
- HTTP request states
- Result type handling
- Compiler enforces all cases covered

**Agent benefit:** Impossible to forget edge cases. Compiler lists missing patterns.

### 5. `config-validation.clank` - Domain Constraints as Types

Shows encoding business rules directly in the type system:
- Server configuration with valid ranges
- User records with non-empty required fields
- Connection pools with sensible limits

**Agent benefit:** Invalid configurations are type errors, not runtime surprises.

## Running the Examples

```bash
# Type check an example
clank check examples/safe-api.clank

# Compile to JavaScript
clank compile examples/safe-api.clank -o dist/

# Compile from JSON AST
clank compile examples/agent-codegen.json --input=ast -o dist/

# View AST of any example
clank compile examples/state-machine.clank --emit=ast
```

## Token Efficiency

Clank's Unicode operators reduce token count for LLM context windows:

| ASCII | Unicode | Tokens saved |
|-------|---------|--------------|
| `fn` | `ƒ` | ~50% |
| `->` | `→` | ~50% |
| `Int` | `ℤ` | ~66% |
| `!=` | `≠` | ~50% |
| `>=` | `≥` | ~50% |
| `&&` | `∧` | ~50% |
