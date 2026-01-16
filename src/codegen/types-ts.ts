/**
 * TypeScript Type Generation
 *
 * Converts Clank semantic types to TypeScript type strings.
 */

import type { Type } from "../types/types";
import { formatType } from "../types/types";

/**
 * Convert a Clank type to a TypeScript type string.
 */
export function typeToTS(type: Type): string {
  switch (type.kind) {
    case "var":
      // Unresolved type variables become 'unknown' in output
      // or use the name if available (for generics)
      return type.name ?? "unknown";

    case "con":
      return primitiveToTS(type.name);

    case "app": {
      const conName = type.con.kind === "con" ? type.con.name : typeToTS(type.con);
      const args = type.args.map(typeToTS).join(", ");

      // Special handling for built-in generic types
      if (conName === "Option") {
        return `${args} | null`;
      }
      if (conName === "Result") {
        const [ok, err] = type.args.map(typeToTS);
        return `{ ok: true; value: ${ok} } | { ok: false; error: ${err} }`;
      }
      if (conName === "Array" || conName === "List") {
        return `${args}[]`;
      }

      // User-defined generic types
      return `${conName}<${args}>`;
    }

    case "fn": {
      const params = type.params
        .map((p, i) => `arg${i}: ${typeToTS(p)}`)
        .join(", ");
      const ret = typeToTS(type.returnType);
      return `(${params}) => ${ret}`;
    }

    case "tuple": {
      const elements = type.elements.map(typeToTS).join(", ");
      return `[${elements}]`;
    }

    case "array":
      return `${typeToTS(type.element)}[]`;

    case "record": {
      const fields = Array.from(type.fields.entries())
        .map(([name, fieldType]) => `${name}: ${typeToTS(fieldType)}`)
        .join("; ");
      return `{ ${fields} }`;
    }

    case "refined":
      // Refinement types map to their base type (predicates are runtime-only)
      return typeToTS(type.base);

    case "never":
      return "never";

    default:
      return "unknown";
  }
}

/**
 * Convert Clank primitive type names to TypeScript equivalents.
 */
function primitiveToTS(name: string): string {
  switch (name) {
    case "Int":
    case "Int32":
    case "Int64":
    case "Nat":
      return "bigint";
    case "Float":
      return "number";
    case "Bool":
      return "boolean";
    case "Str":
    case "String":
      return "string";
    case "Unit":
      return "void";
    case "Ordering":
      return "Ordering";
    // Keep user-defined types as-is
    default:
      return name;
  }
}

/**
 * Generate TypeScript type declarations for user-defined types.
 */
export function generateTypeDeclaration(
  name: string,
  kind: "record" | "sum",
  definition: RecordDef | SumDef
): string {
  if (kind === "record") {
    const rec = definition as RecordDef;
    const typeParams = rec.typeParams.length > 0
      ? `<${rec.typeParams.join(", ")}>`
      : "";
    const fields = rec.fields
      .map(([fieldName, fieldType]) => `  ${fieldName}: ${typeToTS(fieldType)};`)
      .join("\n");
    return `interface ${name}${typeParams} {\n${fields}\n}`;
  } else {
    const sum = definition as SumDef;
    const typeParams = sum.typeParams.length > 0
      ? `<${sum.typeParams.join(", ")}>`
      : "";
    const variants = sum.variants
      .map(([variantName, variantFields]) => {
        if (variantFields.length === 0) {
          return `  | { tag: "${variantName}" }`;
        }
        const payload = variantFields
          .map((f, i) => `${f.name ?? `_${i}`}: ${typeToTS(f.type)}`)
          .join("; ");
        return `  | { tag: "${variantName}"; ${payload} }`;
      })
      .join("\n");
    return `type ${name}${typeParams} =\n${variants};`;
  }
}

export interface RecordDef {
  typeParams: string[];
  fields: [string, Type][];
}

export interface SumDef {
  typeParams: string[];
  variants: [string, { name?: string; type: Type }[]][];
}

/**
 * Format a type for use in error messages (human-readable).
 */
export function formatTypeForError(type: Type): string {
  return formatType(type);
}
