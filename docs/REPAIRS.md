# Repair System

**Status:** Fully implemented

The Clank compiler produces machine-actionable repair candidates for errors. This enables agents to fix issues programmatically without manual intervention.

## Compiler Output

The compiler returns a structured `CompileResult`:

```typescript
interface CompileResult {
  status: "success" | "error";
  compilerVersion: string;
  canonical_ast?: Program;        // Normalized AST (always operate on this)
  output?: { js?: string; ts?: string };
  diagnostics: Diagnostic[];      // Errors and warnings
  obligations: Obligation[];      // Proof obligations
  holes: TypeHole[];              // Type holes for synthesis
  repairs: RepairCandidate[];     // Machine-applicable fixes
  stats: CompileStats;
}
```

Every diagnostic, obligation, and hole includes `repair_refs` pointing to patches that address it.

## Repair Candidates

```typescript
interface RepairCandidate {
  id: string;                     // Unique ID, e.g., "rc1"
  title: string;                  // Human-readable description
  confidence: "high" | "medium" | "low";
  safety: "behavior_preserving" | "likely_preserving" | "behavior_changing";
  kind: "local_fix" | "refactor" | "semantics_change";
  edits: PatchOp[];               // Operations to apply
  expected_delta: {
    diagnostics_resolved: string[];
    obligations_discharged?: string[];
  };
  compatibility?: RepairCompatibility;
}
```

### Patch Operations

| Operation | Description | Fields |
|-----------|-------------|--------|
| `replace_node` | Replace an AST node | `node_id`, `replacement` |
| `rename_symbol` | Rename a variable | `node_id`, `old_name`, `new_name` |
| `rename_field` | Rename a record field | `node_id`, `old_name`, `new_name` |
| `wrap` | Wrap expression | `node_id`, `wrapper_template` |
| `insert_before` | Insert before node | `target_id`, `node` |
| `insert_after` | Insert after node | `target_id`, `node` |
| `delete_node` | Delete a node | `node_id` |
| `add_field` | Add field to record | `type_id`, `field_name`, `field_type` |
| `add_param` | Add function parameter | `fn_id`, `param_name`, `param_type` |
| `add_refinement` | Add type refinement | `type_id`, `predicate` |
| `widen_effect` | Add effect annotation | `fn_id`, `effect` |
| `rename` | Rename symbol globally | `symbol_id`, `new_name` |

## Supported Repairs

The repair generator handles these error codes:

| Code | Error | Repair Strategy |
|------|-------|-----------------|
| E1001 | `UnresolvedName` | Suggest similar names, batch-process all occurrences |
| E1005 | `UnresolvedType` | Suggest similar type names |
| E2001 | `TypeMismatch` | Insert type conversions (`int_to_float`, `to_string`, etc.) |
| E2002 | `ArityMismatch` | Add/remove placeholder arguments |
| E2003 | `MissingField` | Insert field with placeholder value |
| E2004 | `UnknownField` | Suggest similar field names |
| E2013 | `ImmutableAssign` | Make variable mutable (`let` -> `let mut`) |
| E2015 | `NonExhaustiveMatch` | Add missing variant arms (high) or wildcard with `panic` (fallback) |
| E4001 | `EffectNotAllowed` | Widen effect annotation on function |
| E4002 | `UnhandledEffect` | Add effect handling or propagation |
| W0001 | `UnusedVariable` | Prefix with underscore |

## Agent Repair Strategy

### Core Principle

**Treat repair candidates as authoritative.** The compiler's repair engine has analyzed the program and produced machine-applicable fixes. Only introduce manual edits when no suitable compiler-provided repair exists.

### Priority Order

1. **Errors** - Must be zero before proceeding
2. **Obligations** - Discharge proof obligations
3. **Holes** - Fill type holes
4. **Warnings** - Address if relevant

### Selection Criteria

| Priority | Criteria | Values |
|----------|----------|--------|
| 1 | Safety | `behavior_preserving` > `likely_preserving` > `behavior_changing` |
| 2 | Confidence | `high` > `medium` > `low` |
| 3 | Kind | `local_fix` > `refactor` > `semantics_change` |
| 4 | Scope | Fewer nodes, no `crosses_function` |
| 5 | Delta | Resolves more issues |

**Important:** Only apply `behavior_changing` repairs when the user explicitly requests a semantic change.

### Application Rules

1. Apply **one repair at a time** (or a compatible batch)
2. **Recompile after each repair** - Always operate on fresh `canonical_ast`
3. **Verify expected_delta** - Investigate if a repair didn't resolve what it claimed
4. **Never modify the original input** - Always patch the `canonical_ast`
5. **Never manually optimize TypeScript** - Code quality is the compiler's responsibility

### What Agents Should NOT Do

- Don't invent manual fixes when compiler repairs exist
- Don't refactor or optimize the generated TypeScript
- Don't apply behavior-changing repairs without explicit approval
- Don't guess at fixes when no repair candidates exist - ask for clarification

### Example Workflow

```
1. Submit full AST -> receive CompileResult
2. If status == "success": done
3. Filter repairs: behavior_preserving or likely_preserving only
4. Sort remaining by: confidence -> kind -> scope
5. Apply top repair via PatchOp
6. Recompile with --input=ast
7. Goto 2
```

## Repair Compatibility

Repairs include compatibility metadata for batch application:

```typescript
interface RepairCompatibility {
  conflicts_with?: string[];  // Repairs that cannot be applied together
  requires?: string[];        // Repairs that must be applied first
  batch_key?: string;         // Repairs with same key can be batched
}
```

### Compatibility Rules

| Rule | Description |
|------|-------------|
| Same diagnostic | Multiple repairs for same diagnostic conflict (alternatives) |
| Same node | Repairs touching the same `node_id` conflict |
| Effect widening | Multiple `widen_effect` on same function conflict |
| Disjoint renames | `rename_symbol` repairs with disjoint targets share a `batch_key` |
| Cascading fixes | Child repairs `require` parent repairs |

### Batch Application

When applying a compatible batch:

```
1. Check compatibility.conflicts_with - exclude conflicting repairs
2. Check compatibility.requires - apply prerequisites first
3. Group by batch_key - repairs with same key can be applied together
4. Apply all repairs in batch to canonical_ast
5. Recompile once
6. Verify: combined expected_delta achieved
```

## Error Codes

### Syntax Errors (E0xxx)

| Code | Name | Description |
|------|------|-------------|
| E0001 | UnexpectedToken | Unexpected token in input |
| E0002 | UnterminatedString | String literal not properly terminated |
| E0003 | InvalidNumeric | Invalid numeric literal |
| E0004 | MismatchedBrackets | Mismatched brackets or parentheses |
| E0005 | ExpectedExpression | Expected an expression |
| E0006 | ExpectedType | Expected a type |
| E0007 | ExpectedPattern | Expected a pattern |
| E0008 | ExpectedDeclaration | Expected a declaration |
| E0009 | RecordLiteralSyntax | Record literal syntax not supported |

### Name Resolution Errors (E1xxx)

| Code | Name | Description |
|------|------|-------------|
| E1001 | UnresolvedName | Name not defined in scope |
| E1002 | DuplicateDefinition | Name already defined |
| E1003 | ImportNotFound | Imported item not found |
| E1004 | ModuleNotFound | Module not found |
| E1005 | UnresolvedType | Type not defined |
| E1006 | VariantNotFound | Variant not found in sum type |

### Type Errors (E2xxx)

| Code | Name | Description |
|------|------|-------------|
| E2001 | TypeMismatch | Types do not match |
| E2002 | ArityMismatch | Wrong number of arguments |
| E2003 | MissingField | Required field missing |
| E2004 | UnknownField | Field doesn't exist on type |
| E2005 | NotCallable | Expression not callable |
| E2006 | NotIndexable | Expression not indexable |
| E2007 | MissingTypeAnnotation | Type annotation required |
| E2008 | RecursiveType | Recursive type without indirection |
| E2009 | PatternMismatch | Pattern doesn't match expected type |
| E2010 | NotIterable | Expression not iterable |
| E2011 | NotARecord | Expression not a record |
| E2012 | InvalidPropagate | Cannot use `?` on this type |
| E2013 | ImmutableAssign | Cannot assign to immutable variable |
| E2014 | ReturnOutsideFunction | Return outside function |
| E2015 | NonExhaustiveMatch | Match not exhaustive (includes `missing_patterns` in structured data) |
| E2016 | InvalidOperandType | Invalid operand type for operator |
| E2017 | TypeParamMismatch | Wrong number of type parameters |
| E2018 | InfiniteType | Infinite type (occurs check failed) |

### Refinement Errors (E3xxx)

| Code | Name | Description |
|------|------|-------------|
| E3001 | UnprovableRefinement | Cannot prove refinement predicate |
| E3002 | PreconditionNotSatisfied | Precondition may not be satisfied |
| E3003 | PostconditionNotSatisfied | Postcondition may not be satisfied |
| E3004 | AssertionUnprovable | Assertion cannot be proven |

### Effect Errors (E4xxx)

| Code | Name | Description |
|------|------|-------------|
| E4001 | EffectNotAllowed | Effect not allowed in context |
| E4002 | UnhandledEffect | Effect not handled |
| E4003 | EffectMismatch | Effect signature mismatch |

### Linearity Errors (E5xxx)

**Status:** Error codes defined but not enforced

| Code | Name | Description |
|------|------|-------------|
| E5001 | LinearNotConsumed | Linear resource not consumed |
| E5002 | LinearUsedTwice | Linear resource used more than once |
| E5003 | LinearEscapes | Linear resource escapes scope |

### Warnings (W0xxx)

| Code | Name | Description |
|------|------|-------------|
| W0001 | UnusedVariable | Variable declared but never used |
| W0002 | UnusedImport | Import never used |
| W0003 | UnreachableCode | Code is unreachable |
| W0004 | ShadowedVariable | Variable shadows outer binding |
| W0005 | DeprecatedFeature | Feature is deprecated |
| W0006 | DuplicateVariantName | Variant name used by another sum type |

## See Also

- [CLI Reference](CLI.md) - Getting JSON output with `--emit=json`
- [AST-JSON](AST-JSON.md) - AST format for applying patches
- [Refinements](REFINEMENTS.md) - Proof obligation repairs
- [Effects](EFFECTS.md) - Effect-related repairs
