#!/usr/bin/env bun
/**
 * Clank CLI
 *
 * Command-line interface for the Clank compiler.
 */

import { parseArgs } from "util";
import { basename } from "path";
import { tokenize } from "./lexer";
import { parse } from "./parser";
import { typecheck } from "./types";
import { emit, unparse } from "./codegen";
import {
  formatJson,
  formatPretty,
  generateRepairs,
  type CompileResult,
  type CompileStats,
  type Diagnostic,
  type Obligation,
} from "./diagnostics";
import { SourceFile } from "./utils/source";
import { serializeProgram, deserializeProgram } from "./ast-json";
import { canonicalize } from "./canonical";
import type { Program } from "./parser/ast";

// =============================================================================
// Version
// =============================================================================

const VERSION = "0.1.0";

// =============================================================================
// CLI Types
// =============================================================================

type Command = "compile" | "check" | "run" | "help" | "version";
type EmitFormat = "js" | "json" | "ast" | "clank" | "all";
type InputFormat = "source" | "ast";

interface CliArgs {
  command: Command;
  files: string[];
  output: string;
  emit: EmitFormat;
  input: InputFormat;
  quiet: boolean;
  strict: boolean;
  typescript: boolean;
  debug: boolean;
}

// =============================================================================
// Argument Parsing
// =============================================================================

function parseCliArgs(): CliArgs {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      output: { type: "string", short: "o", default: "./dist" },
      emit: { type: "string", default: "js" },
      input: { type: "string", short: "i", default: "source" },
      quiet: { type: "boolean", short: "q", default: false },
      strict: { type: "boolean", default: false },
      ts: { type: "boolean", default: false },
      debug: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    return { command: "help", files: [], output: "", emit: "js", input: "source", quiet: false, strict: false, typescript: false, debug: false };
  }
  if (values.version) {
    return { command: "version", files: [], output: "", emit: "js", input: "source", quiet: false, strict: false, typescript: false, debug: false };
  }

  if (positionals.length === 0) {
    return { command: "help", files: [], output: "", emit: "js", input: "source", quiet: false, strict: false, typescript: false, debug: false };
  }

  const command = positionals[0] as string;
  const files = positionals.slice(1);

  const validCommands = ["compile", "check", "run"];
  const resolvedCommand: Command = validCommands.includes(command)
    ? (command as Command)
    : "help";

  return {
    command: resolvedCommand,
    files,
    output: values.output as string,
    emit: (values.emit as EmitFormat) ?? "js",
    input: (values.input as InputFormat) ?? "source",
    quiet: values.quiet as boolean,
    strict: values.strict as boolean,
    typescript: values.ts as boolean,
    debug: values.debug as boolean,
  };
}

// =============================================================================
// Compilation
// =============================================================================

async function readSourceFile(filePath: string): Promise<SourceFile> {
  const file = Bun.file(filePath);
  const content = await file.text();
  return new SourceFile(filePath, content);
}

async function readAstFile(filePath: string): Promise<{ program: Program | null; errors: string[] }> {
  const file = Bun.file(filePath);
  const content = await file.text();
  const result = deserializeProgram(content);
  if (!result.ok) {
    return {
      program: null,
      errors: result.errors.map(e => `${e.path}: ${e.message}`),
    };
  }
  return { program: result.value ?? null, errors: [] };
}

interface CompileOptions {
  typescript?: boolean;
  debug?: boolean;
}

function compile(source: SourceFile, options: CompileOptions = {}): CompileResult & { ast?: string } {
  const startTime = performance.now();
  const diagnostics: Diagnostic[] = [];

  // Lex
  const { tokens, errors: lexErrors } = tokenize(source);
  let diagnosticIdCounter = 0;
  if (lexErrors.length > 0) {
    diagnostics.push(
      ...lexErrors.map((e) => ({
        id: `d${++diagnosticIdCounter}`,
        severity: "error" as const,
        code: "E0001",
        message: e.message,
        location: e.span,
        structured: { kind: "syntax_error" },
        hints: [],
        related: [],
        repair_refs: [],
      }))
    );

    return createErrorResult(diagnostics, source, tokens.length, startTime);
  }

  // Parse
  const { program, errors: parseErrors } = parse(tokens);
  if (parseErrors.length > 0) {
    diagnostics.push(
      ...parseErrors.map((e) => ({
        id: `d${++diagnosticIdCounter}`,
        severity: "error" as const,
        code: "E0001",
        message: e.message,
        location: e.span,
        structured: { kind: "syntax_error" },
        hints: [],
        related: [],
        repair_refs: [],
      }))
    );

    return createErrorResult(diagnostics, source, tokens.length, startTime);
  }

  // Type check
  const { diagnostics: typeErrors, obligations, functionTypes } = typecheck(program);
  diagnostics.push(...typeErrors);

  // Generate repairs for diagnostics and obligations
  const repairResult = generateRepairs({
    program,
    diagnostics,
    obligations,
    holes: [],
  });

  // Backfill repair_refs on diagnostics
  for (const [diagId, repairIds] of repairResult.diagnosticRepairs) {
    const diag = diagnostics.find((d) => d.id === diagId);
    if (diag) diag.repair_refs = repairIds;
  }

  // Backfill repair_refs on obligations
  for (const [oblId, repairIds] of repairResult.obligationRepairs) {
    const obl = obligations.find((o) => o.id === oblId);
    if (obl) obl.repair_refs = repairIds;
  }

  const hasErrors = diagnostics.some((d) => d.severity === "error");
  if (hasErrors) {
    const result = createErrorResult(diagnostics, source, tokens.length, startTime, obligations);
    result.repairs = repairResult.repairs;
    return result;
  }

  // Canonicalize the AST
  // This performs desugaring, normalization, effect annotation, and validator insertion
  const canonicalResult = canonicalize(program, {
    desugar: true,
    normalize: true,
    annotateEffects: true,
    insertValidators: true,
    typeInfo: functionTypes,
    effectInfo: extractFunctionEffects(functionTypes),
  });

  // Code generation (from canonical AST)
  // Clean mode is the default; debug mode adds source location comments
  const { code } = emit(canonicalResult.program, {
    typescript: options.typescript,
    sourceMap: options.debug,
  });

  // Serialize canonical AST for output
  const ast = serializeProgram(canonicalResult.program, { pretty: true });

  const stats = createStats(source, tokens.length, code, startTime);
  stats.obligationsTotal = obligations.length;
  stats.obligationsDischarged = obligations.filter((o) => o.solverResult === "discharged").length;

  const outputKey = options.typescript ? "ts" : "js";
  return {
    status: "success",
    compilerVersion: VERSION,
    canonical_ast: canonicalResult.program,
    output: { [outputKey]: code },
    diagnostics,
    obligations,
    holes: [],
    repairs: repairResult.repairs,
    stats,
    ast,
  };
}

/**
 * Extract effect information from function types.
 */
function extractFunctionEffects(functionTypes: Map<string, import("./types/types").Type>): Map<string, Set<string>> {
  const effectInfo = new Map<string, Set<string>>();

  for (const [name, type] of functionTypes) {
    if (type.kind === "fn" && type.effects) {
      effectInfo.set(name, type.effects);
    }
  }

  return effectInfo;
}

/**
 * Compile from an already-parsed AST (for AST JSON input).
 */
function compileFromAst(program: Program, filePath: string, options: CompileOptions = {}): CompileResult & { ast?: string } {
  const startTime = performance.now();
  const diagnostics: Diagnostic[] = [];

  // Type check
  const { diagnostics: typeErrors, obligations, functionTypes } = typecheck(program);
  diagnostics.push(...typeErrors);

  // Generate repairs for diagnostics and obligations
  const repairResult = generateRepairs({
    program,
    diagnostics,
    obligations,
    holes: [],
  });

  // Backfill repair_refs on diagnostics
  for (const [diagId, repairIds] of repairResult.diagnosticRepairs) {
    const diag = diagnostics.find((d) => d.id === diagId);
    if (diag) diag.repair_refs = repairIds;
  }

  // Backfill repair_refs on obligations
  for (const [oblId, repairIds] of repairResult.obligationRepairs) {
    const obl = obligations.find((o) => o.id === oblId);
    if (obl) obl.repair_refs = repairIds;
  }

  const hasErrors = diagnostics.some((d) => d.severity === "error");
  if (hasErrors) {
    const result = createErrorResultFromAst(diagnostics, filePath, startTime, obligations);
    result.repairs = repairResult.repairs;
    return result;
  }

  // Canonicalize the AST
  const canonicalResult = canonicalize(program, {
    desugar: true,
    normalize: true,
    annotateEffects: true,
    insertValidators: true,
    typeInfo: functionTypes,
    effectInfo: extractFunctionEffects(functionTypes),
  });

  // Code generation (from canonical AST)
  // Clean mode is the default; debug mode adds source location comments
  const { code } = emit(canonicalResult.program, {
    typescript: options.typescript,
    sourceMap: options.debug,
  });

  // Serialize canonical AST for output
  const ast = serializeProgram(canonicalResult.program, { pretty: true });

  const stats = createStatsFromAst(filePath, code, startTime);
  stats.obligationsTotal = obligations.length;
  stats.obligationsDischarged = obligations.filter((o) => o.solverResult === "discharged").length;

  const outputKey = options.typescript ? "ts" : "js";
  return {
    status: "success",
    compilerVersion: VERSION,
    canonical_ast: canonicalResult.program,
    output: { [outputKey]: code },
    diagnostics,
    obligations,
    holes: [],
    repairs: repairResult.repairs,
    stats,
    ast,
  };
}

function createErrorResult(
  diagnostics: Diagnostic[],
  source: SourceFile,
  tokenCount: number,
  startTime: number,
  obligations: Obligation[] = []
): CompileResult {
  return {
    status: "error",
    compilerVersion: VERSION,
    diagnostics,
    obligations,
    holes: [],
    repairs: [],
    stats: createStats(source, tokenCount, "", startTime),
  };
}

function createErrorResultFromAst(
  diagnostics: Diagnostic[],
  filePath: string,
  startTime: number,
  obligations: Obligation[] = []
): CompileResult {
  return {
    status: "error",
    compilerVersion: VERSION,
    diagnostics,
    obligations,
    holes: [],
    repairs: [],
    stats: createStatsFromAst(filePath, "", startTime),
  };
}

function createStats(
  source: SourceFile,
  tokenCount: number,
  code: string,
  startTime: number
): CompileStats {
  return {
    sourceFiles: 1,
    sourceLines: source.content.split("\n").length,
    sourceTokens: tokenCount,
    outputLines: code ? code.split("\n").length : 0,
    outputBytes: code ? code.length : 0,
    obligationsTotal: 0,
    obligationsDischarged: 0,
    compileTimeMs: performance.now() - startTime,
  };
}

function createStatsFromAst(
  _filePath: string,
  code: string,
  startTime: number
): CompileStats {
  return {
    sourceFiles: 1,
    sourceLines: 0,
    sourceTokens: 0,
    outputLines: code ? code.split("\n").length : 0,
    outputBytes: code ? code.length : 0,
    obligationsTotal: 0,
    obligationsDischarged: 0,
    compileTimeMs: performance.now() - startTime,
  };
}

// =============================================================================
// Commands
// =============================================================================

async function runCompile(args: CliArgs): Promise<number> {
  if (args.files.length === 0) {
    console.error("error: no input files");
    return 1;
  }

  let exitCode = 0;

  for (const file of args.files) {
    try {
      let result: CompileResult & { ast?: string };
      let source: SourceFile | null = null;

      if (args.input === "ast") {
        // Read and compile from AST JSON
        const astResult = await readAstFile(file);
        if (!astResult.program) {
          console.error(`error: failed to parse AST JSON from '${file}':`);
          for (const err of astResult.errors) {
            console.error(`  ${err}`);
          }
          exitCode = 1;
          continue;
        }
        result = compileFromAst(astResult.program, file, { typescript: args.typescript, debug: args.debug });
      } else {
        // Read and compile from source
        source = await readSourceFile(file);
        result = compile(source, { typescript: args.typescript, debug: args.debug });
      }

      if (args.emit === "json") {
        console.log(formatJson(result));
      } else if (args.emit === "ast") {
        // Output AST as JSON
        if (result.ast) {
          console.log(result.ast);
        } else {
          // If AST not available (error case), output empty program
          console.log(JSON.stringify({ kind: "program", declarations: [] }, null, 2));
        }
      } else if (args.emit === "clank") {
        // Output canonical AST as .clank source
        if (result.canonical_ast) {
          const clankSource = unparse(result.canonical_ast as Program);
          console.log(clankSource);
        } else if (result.status === "error" && source) {
          // On error, just output the original source (best effort)
          console.log(source.content);
        }
      } else {
        if (!args.quiet && result.diagnostics.length > 0 && source) {
          console.log(formatPretty(result.diagnostics, source));
        } else if (!args.quiet && result.diagnostics.length > 0) {
          // For AST input, just output JSON diagnostics
          console.log(formatJson(result));
        }

        if (result.status === "success" && result.output) {
          const ext = args.typescript ? ".ts" : ".js";
          const baseName = basename(file).replace(/\.(clank|json)$/, ext);
          const outPath = `${args.output}/${baseName}`;

          // Ensure output directory exists
          await Bun.write(args.output + "/.keep", "");

          const code = args.typescript ? result.output.ts : result.output.js;
          if (code) {
            await Bun.write(outPath, code);
            if (!args.quiet) {
              console.log(`Wrote ${outPath}`);
            }
          }
        }
      }

      if (result.status === "error") {
        exitCode = 1;
      }
      if (args.strict && result.diagnostics.some((d) => d.severity === "warning")) {
        exitCode = 1;
      }
    } catch (e) {
      console.error(`error: could not read file '${file}'`);
      exitCode = 1;
    }
  }

  return exitCode;
}

async function runCheck(args: CliArgs): Promise<number> {
  if (args.files.length === 0) {
    console.error("error: no input files");
    return 1;
  }

  let exitCode = 0;
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const file of args.files) {
    try {
      let result: CompileResult & { ast?: string };
      let source: SourceFile | null = null;

      if (args.input === "ast") {
        // Read and compile from AST JSON
        const astResult = await readAstFile(file);
        if (!astResult.program) {
          console.error(`error: failed to parse AST JSON from '${file}':`);
          for (const err of astResult.errors) {
            console.error(`  ${err}`);
          }
          exitCode = 1;
          continue;
        }
        result = compileFromAst(astResult.program, file, { typescript: args.typescript, debug: args.debug });
      } else {
        // Read and compile from source
        source = await readSourceFile(file);
        result = compile(source, { typescript: args.typescript, debug: args.debug });
      }

      const errors = result.diagnostics.filter((d) => d.severity === "error").length;
      const warnings = result.diagnostics.filter((d) => d.severity === "warning").length;
      totalErrors += errors;
      totalWarnings += warnings;

      if (args.emit === "json") {
        console.log(formatJson(result));
      } else if (args.emit === "ast") {
        // Output AST as JSON
        if (result.ast) {
          console.log(result.ast);
        }
      } else if (args.emit === "clank") {
        // Output canonical AST as .clank source
        if (result.canonical_ast) {
          const clankSource = unparse(result.canonical_ast as Program);
          console.log(clankSource);
        }
      } else if (!args.quiet && result.diagnostics.length > 0) {
        if (source) {
          console.log(formatPretty(result.diagnostics, source));
        } else {
          // For AST input, output JSON diagnostics
          console.log(formatJson(result));
        }
      }

      if (result.status === "error") {
        exitCode = 1;
      }
      if (args.strict && warnings > 0) {
        exitCode = 1;
      }
    } catch (e) {
      console.error(`error: could not read file '${file}'`);
      exitCode = 1;
    }
  }

  if (!args.quiet && args.emit !== "json" && args.emit !== "ast") {
    const parts: string[] = [];
    if (totalErrors > 0) {
      parts.push(`${totalErrors} error${totalErrors === 1 ? "" : "s"}`);
    }
    if (totalWarnings > 0) {
      parts.push(`${totalWarnings} warning${totalWarnings === 1 ? "" : "s"}`);
    }
    if (parts.length > 0) {
      console.log(parts.join(", "));
    } else {
      console.log("No errors");
    }
  }

  return exitCode;
}

async function runRun(args: CliArgs): Promise<number> {
  if (args.files.length === 0) {
    console.error("error: no input file");
    return 1;
  }

  const file = args.files[0];

  try {
    let result: CompileResult & { ast?: string };
    let source: SourceFile | null = null;

    if (args.input === "ast") {
      // Read and compile from AST JSON
      const astResult = await readAstFile(file);
      if (!astResult.program) {
        console.error(`error: failed to parse AST JSON from '${file}':`);
        for (const err of astResult.errors) {
          console.error(`  ${err}`);
        }
        return 1;
      }
      // Run always generates JS since we need to execute it
      result = compileFromAst(astResult.program, file, { typescript: false });
    } else {
      // Read and compile from source
      source = await readSourceFile(file);
      // Run always generates JS since we need to execute it
      result = compile(source, { typescript: false });
    }

    if (result.status === "error") {
      if (source) {
        console.log(formatPretty(result.diagnostics, source));
      } else {
        console.log(formatJson(result));
      }
      return 1;
    }

    if (result.output) {
      // Write to temp file with main() call appended
      const tempPath = `/tmp/clank-run-${Date.now()}.mjs`;
      const codeWithMain = result.output.js + "\nif (typeof main === 'function') { main(); }\n";
      await Bun.write(tempPath, codeWithMain);

      // Import and execute
      await import(tempPath);
    }

    return 0;
  } catch (e) {
    console.error(`error: ${e}`);
    return 1;
  }
}

function printHelp(): void {
  console.log(`
clank - The Clank compiler

USAGE:
  clank <command> [options] <files>

COMMANDS:
  compile <file>    Compile Clank to JavaScript
  check <file>      Type check without generating code
  run <file>        Compile and execute

OPTIONS:
  -o, --output <dir>    Output directory (default: ./dist)
  --emit <format>       Output format: js, json, ast, clank, all (default: js)
  -i, --input <format>  Input format: source, ast (default: source)
  --ts                  Emit TypeScript instead of JavaScript
  --debug               Enable debug output (source location comments)
  -q, --quiet           Suppress non-error output
  --strict              Treat warnings as errors
  -h, --help            Print help
  -v, --version         Print version

OUTPUT MODES:
  By default, the compiler produces clean output optimized for readability
  and idiomatic style. Use --debug to include source location comments
  for debugging purposes.

EMIT FORMATS:
  js      JavaScript code output (default)
  json    Structured diagnostics and compilation result
  ast     AST as JSON (for agent manipulation)
  clank   Canonical AST as .clank source (for humans/git)
  all     Both JavaScript and JSON output

INPUT FORMATS:
  source  Clank source code (.clank files) - default
  ast     AST as JSON (for agent-generated programs)

EXAMPLES:
  clank compile main.clank -o dist/
  clank compile main.clank -o dist/ --ts
  clank compile main.clank --debug          # With debug comments
  clank check src/**/*.clank
  clank run script.clank
  clank compile main.clank --emit=json > result.json
  clank compile main.clank --emit=ast > ast.json
  clank compile program.json --input=ast -o dist/
  clank compile program.json --input=ast --emit=clank > output.clank
`);
}

function printVersion(): void {
  console.log(`clank ${VERSION}`);
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const args = parseCliArgs();

  let exitCode = 0;

  switch (args.command) {
    case "help":
      printHelp();
      break;

    case "version":
      printVersion();
      break;

    case "compile":
      exitCode = await runCompile(args);
      break;

    case "check":
      exitCode = await runCheck(args);
      break;

    case "run":
      exitCode = await runRun(args);
      break;
  }

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
