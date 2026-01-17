# Command-Line Interface

**Status:** Fully implemented

The `clank` CLI provides commands for compiling, type checking, and running Clank programs.

## Installation

```bash
# Using mise (recommended)
mise install

# The clank command is available via:
mise exec -- bun run src/cli.ts
# Or create an alias:
alias clank="mise exec -- bun run src/cli.ts"
```

## Commands

### compile

Compile Clank source to JavaScript or TypeScript.

```bash
clank compile main.clank -o dist/           # JavaScript output
clank compile main.clank -o dist/ --ts      # TypeScript output
clank compile main.clank --emit=json        # Structured JSON output
clank compile main.clank --emit=ast         # AST as JSON
clank compile program.json --input=ast      # Compile from AST JSON
```

### check

Type check without generating code.

```bash
clank check main.clank                      # Type check single file
clank check src/**/*.clank                  # Type check multiple files
clank check main.clank --emit=json          # Output diagnostics as JSON
```

### run

Compile and execute a program.

```bash
clank run script.clank                      # Compile and run
clank run program.json --input=ast          # Run from AST JSON
```

The `run` command always generates JavaScript (even with `--ts`) and executes the `main()` function if defined.

## Options

| Option | Short | Default | Description |
|--------|-------|---------|-------------|
| `--output <dir>` | `-o` | `./dist` | Output directory |
| `--emit <format>` | | `js` | Output format |
| `--input <format>` | `-i` | `source` | Input format |
| `--ts` | | `false` | Emit TypeScript instead of JavaScript |
| `--debug` | | `false` | Enable debug output (source location comments) |
| `--quiet` | `-q` | `false` | Suppress non-error output |
| `--strict` | | `false` | Treat warnings as errors |
| `--help` | `-h` | | Print help |
| `--version` | `-v` | | Print version |

## Output Modes

By default, the compiler produces **clean output** optimized for readability and idiomatic style. Generated code is intended to look human-written.

Use `--debug` to enable **debug mode**, which adds source location comments to the generated code:

```bash
# Clean mode (default) - idiomatic output
clank compile main.clank -o dist/

# Debug mode - includes source location comments
clank compile main.clank -o dist/ --debug
```

Example debug mode output:
```typescript
/* Clank output (debug mode) - includes source location comments */

/* fn main @ L1:1 */
function main(): void {
  __clank.println("Hello, world!");
}
```

## Emit Formats

| Format | Description |
|--------|-------------|
| `js` | JavaScript code output (default) |
| `json` | Structured diagnostics and compilation result |
| `ast` | AST as JSON (for agent manipulation) |
| `clank` | Canonical AST as .clank source (for humans/git) |
| `all` | Both JavaScript and JSON output |

### JSON Output

The `--emit=json` format returns a structured `CompileResult`:

```json
{
  "status": "success",
  "compilerVersion": "0.1.0",
  "canonical_ast": { ... },
  "output": { "js": "..." },
  "diagnostics": [],
  "obligations": [],
  "holes": [],
  "repairs": [],
  "stats": { ... }
}
```

### AST Output

The `--emit=ast` format outputs the canonical AST as JSON:

```json
{
  "kind": "program",
  "declarations": [
    {
      "kind": "fn",
      "name": "main",
      ...
    }
  ]
}
```

## Input Formats

| Format | Description |
|--------|-------------|
| `source` | Clank source code (`.clank` files) - default |
| `ast` | AST as JSON (for agent-generated programs) |

### AST Input

Compile from a JSON AST file:

```bash
clank compile program.json --input=ast -o dist/
```

This is useful for:
- Agent-generated programs
- Code transformation pipelines
- Round-trip workflows

## Examples

### Basic Compilation

```bash
# Compile to JavaScript
clank compile main.clank -o dist/

# Compile to TypeScript with full types
clank compile main.clank -o dist/ --ts

# Type check only
clank check main.clank
```

### Agent Workflow

```bash
# Export AST for manipulation
clank compile main.clank --emit=ast > program.json

# Agent modifies program.json...

# Compile modified AST
clank compile program.json --input=ast -o dist/
```

### Diagnostics

```bash
# Get structured diagnostics
clank compile broken.clank --emit=json > result.json

# Check the status
cat result.json | jq '.status'

# Get repair suggestions
cat result.json | jq '.repairs'
```

### Round-Trip

```bash
# Source -> AST -> JavaScript
clank compile main.clank --emit=ast | \
  clank compile --input=ast -o dist/

# Source -> Canonical Clank
clank compile main.clank --emit=clank > canonical.clank
```

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Compilation error, file not found, or (with `--strict`) warnings |

## See Also

- [AST-JSON](AST-JSON.md) - AST JSON format for `--input=ast` and `--emit=ast`
- [Code Generation](CODEGEN.md) - JavaScript/TypeScript output
- [Repairs](REPAIRS.md) - Repair candidates in JSON output
