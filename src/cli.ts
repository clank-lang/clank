#!/usr/bin/env bun
/**
 * Clank CLI
 *
 * Command-line interface for the Clank compiler.
 */

import { parseArgs } from "util";
import { tokenize } from "./lexer";
import { parse } from "./parser";
import { typecheck } from "./types";
import { emit } from "./codegen";
import {
  formatJson,
  formatPretty,
  type CompileResult,
  type CompileStats,
  type Diagnostic,
  type Obligation,
} from "./diagnostics";
import { SourceFile } from "./utils/source";
import { serializeProgram, deserializeProgram } from "./ast-json";
import type { Program } from "./parser/ast";

// =============================================================================
// Version
// =============================================================================

const VERSION = "0.1.0";

// =============================================================================
// CLI Types
// =============================================================================

type Command = "compile" | "check" | "run" | "help" | "version";
type EmitFormat = "js" | "json" | "ast" | "all";
type InputFormat = "source" | "ast";

interface CliArgs {
  command: Command;
  files: string[];
  output: string;
  emit: EmitFormat;
  input: InputFormat;
  quiet: boolean;
  strict: boolean;
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
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    return { command: "help", files: [], output: "", emit: "js", input: "source", quiet: false, strict: false };
  }
  if (values.version) {
    return { command: "version", files: [], output: "", emit: "js", input: "source", quiet: false, strict: false };
  }

  if (positionals.length === 0) {
    return { command: "help", files: [], output: "", emit: "js", input: "source", quiet: false, strict: false };
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

function compile(source: SourceFile): CompileResult & { ast?: string } {
  const startTime = performance.now();
  const diagnostics: Diagnostic[] = [];

  // Lex
  const { tokens, errors: lexErrors } = tokenize(source);
  if (lexErrors.length > 0) {
    diagnostics.push(
      ...lexErrors.map((e) => ({
        severity: "error" as const,
        code: "E0001",
        message: e.message,
        location: e.span,
        structured: { kind: "syntax_error" },
        hints: [],
        related: [],
      }))
    );

    return createErrorResult(diagnostics, source, tokens.length, startTime);
  }

  // Parse
  const { program, errors: parseErrors } = parse(tokens);
  if (parseErrors.length > 0) {
    diagnostics.push(
      ...parseErrors.map((e) => ({
        severity: "error" as const,
        code: "E0001",
        message: e.message,
        location: e.span,
        structured: { kind: "syntax_error" },
        hints: [],
        related: [],
      }))
    );

    return createErrorResult(diagnostics, source, tokens.length, startTime);
  }

  // Type check
  const { diagnostics: typeErrors, obligations } = typecheck(program);
  diagnostics.push(...typeErrors);

  const hasErrors = diagnostics.some((d) => d.severity === "error");
  if (hasErrors) {
    return createErrorResult(diagnostics, source, tokens.length, startTime, obligations);
  }

  // Code generation
  const { code } = emit(program);

  // Serialize AST for output
  const ast = serializeProgram(program, { pretty: true });

  const stats = createStats(source, tokens.length, code, startTime);
  stats.obligationsTotal = obligations.length;
  stats.obligationsDischarged = obligations.filter((o) => o.solverResult === "discharged").length;

  return {
    status: "success",
    compilerVersion: VERSION,
    output: { js: code },
    diagnostics,
    obligations,
    holes: [],
    stats,
    ast,
  };
}

/**
 * Compile from an already-parsed AST (for AST JSON input).
 */
function compileFromAst(program: Program, filePath: string): CompileResult & { ast?: string } {
  const startTime = performance.now();
  const diagnostics: Diagnostic[] = [];

  // Type check
  const { diagnostics: typeErrors, obligations } = typecheck(program);
  diagnostics.push(...typeErrors);

  const hasErrors = diagnostics.some((d) => d.severity === "error");
  if (hasErrors) {
    return createErrorResultFromAst(diagnostics, filePath, startTime, obligations);
  }

  // Code generation
  const { code } = emit(program);

  // Serialize AST for output
  const ast = serializeProgram(program, { pretty: true });

  const stats = createStatsFromAst(filePath, code, startTime);
  stats.obligationsTotal = obligations.length;
  stats.obligationsDischarged = obligations.filter((o) => o.solverResult === "discharged").length;

  return {
    status: "success",
    compilerVersion: VERSION,
    output: { js: code },
    diagnostics,
    obligations,
    holes: [],
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
        result = compileFromAst(astResult.program, file);
      } else {
        // Read and compile from source
        source = await readSourceFile(file);
        result = compile(source);
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
      } else {
        if (!args.quiet && result.diagnostics.length > 0 && source) {
          console.log(formatPretty(result.diagnostics, source));
        } else if (!args.quiet && result.diagnostics.length > 0) {
          // For AST input, just output JSON diagnostics
          console.log(formatJson(result));
        }

        if (result.status === "success" && result.output) {
          const outPath = `${args.output}/${file.replace(/\.(clank|json)$/, ".js")}`;

          // Ensure output directory exists
          const dir = outPath.substring(0, outPath.lastIndexOf("/"));
          await Bun.write(dir + "/.keep", "");

          await Bun.write(outPath, result.output.js);
          if (!args.quiet) {
            console.log(`Wrote ${outPath}`);
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
        result = compileFromAst(astResult.program, file);
      } else {
        // Read and compile from source
        source = await readSourceFile(file);
        result = compile(source);
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
      result = compileFromAst(astResult.program, file);
    } else {
      // Read and compile from source
      source = await readSourceFile(file);
      result = compile(source);
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
  --emit <format>       Output format: js, json, ast, all (default: js)
  -i, --input <format>  Input format: source, ast (default: source)
  -q, --quiet           Suppress non-error output
  --strict              Treat warnings as errors
  -h, --help            Print help
  -v, --version         Print version

EMIT FORMATS:
  js      JavaScript code output (default)
  json    Structured diagnostics and compilation result
  ast     AST as JSON (for agent manipulation)
  all     Both JavaScript and JSON output

INPUT FORMATS:
  source  Clank source code (.clank files) - default
  ast     AST as JSON (for agent-generated programs)

EXAMPLES:
  clank compile main.clank -o dist/
  clank check src/**/*.clank
  clank run script.clank
  clank compile main.clank --emit=json > result.json
  clank compile main.clank --emit=ast > ast.json
  clank compile program.json --input=ast -o dist/
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
