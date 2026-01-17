/**
 * Built-in Types and Functions
 *
 * Defines the built-in types (Option, Result) and function signatures
 * (len, print, etc.) that are available without import.
 */

import type { SourceSpan } from "../utils/span";
import type { TypeScheme } from "./types";
import type { TypeContext, TypeDef, VariantDef } from "./context";
import {
  TYPE_INT,
  TYPE_NAT,
  TYPE_FLOAT,
  TYPE_BOOL,
  TYPE_STR,
  TYPE_UNIT,
  TYPE_NEVER,
  typeCon,
  typeApp,
  typeFn,
  typeArray,
  typeTuple,
  freshTypeVar,
} from "./types";

// =============================================================================
// Built-in Type Definitions
// =============================================================================

const DUMMY_SPAN: SourceSpan = {
  file: "<builtin>",
  start: { line: 0, column: 0, offset: 0 },
  end: { line: 0, column: 0, offset: 0 },
};

/**
 * Create the Option[T] type definition.
 */
function createOptionTypeDef(): TypeDef {
  const T = freshTypeVar("T");
  return {
    kind: "sum",
    name: "Option",
    typeParams: ["T"],
    type: typeCon("Option"),
    variants: new Map<string, VariantDef>([
      ["Some", { fields: [T] }],
      ["None", { fields: [] }],
    ]),
    span: DUMMY_SPAN,
  };
}

/**
 * Create the Result[T, E] type definition.
 */
function createResultTypeDef(): TypeDef {
  const T = freshTypeVar("T");
  const E = freshTypeVar("E");
  return {
    kind: "sum",
    name: "Result",
    typeParams: ["T", "E"],
    type: typeCon("Result"),
    variants: new Map<string, VariantDef>([
      ["Ok", { fields: [T] }],
      ["Err", { fields: [E] }],
    ]),
    span: DUMMY_SPAN,
  };
}

/**
 * Create the Ordering type definition for comparison results.
 */
function createOrderingTypeDef(): TypeDef {
  return {
    kind: "sum",
    name: "Ordering",
    typeParams: [],
    type: typeCon("Ordering"),
    variants: new Map<string, VariantDef>([
      ["Less", { fields: [] }],
      ["Equal", { fields: [] }],
      ["Greater", { fields: [] }],
    ]),
    span: DUMMY_SPAN,
  };
}

// =============================================================================
// Built-in Function Signatures
// =============================================================================

export interface BuiltinFn {
  name: string;
  scheme: TypeScheme;
  description: string;
}

/**
 * Get all built-in function definitions.
 */
export function getBuiltinFunctions(): BuiltinFn[] {
  return [
    // Array operations
    {
      name: "len",
      scheme: {
        typeParams: ["T"],
        type: typeFn([typeArray(freshTypeVar("T"))], TYPE_NAT),
      },
      description: "Get the length of an array",
    },
    {
      name: "is_empty",
      scheme: {
        typeParams: ["T"],
        type: typeFn([typeArray(freshTypeVar("T"))], TYPE_BOOL),
      },
      description: "Check if an array is empty",
    },
    {
      name: "push",
      scheme: {
        typeParams: ["T"],
        type: (() => {
          const T = freshTypeVar("T");
          return typeFn([typeArray(T), T], typeArray(T));
        })(),
      },
      description: "Append an element to an array",
    },
    {
      name: "map",
      scheme: {
        typeParams: ["T", "U"],
        type: (() => {
          const T = freshTypeVar("T");
          const U = freshTypeVar("U");
          return typeFn([typeArray(T), typeFn([T], U)], typeArray(U));
        })(),
      },
      description: "Apply a function to each element of an array",
    },
    {
      name: "filter",
      scheme: {
        typeParams: ["T"],
        type: (() => {
          const T = freshTypeVar("T");
          return typeFn([typeArray(T), typeFn([T], TYPE_BOOL)], typeArray(T));
        })(),
      },
      description: "Filter an array by a predicate",
    },
    {
      name: "fold",
      scheme: {
        typeParams: ["T", "U"],
        type: (() => {
          const T = freshTypeVar("T");
          const U = freshTypeVar("U");
          return typeFn([typeArray(T), U, typeFn([U, T], U)], U);
        })(),
      },
      description: "Fold an array with an accumulator",
    },
    {
      name: "reduce",
      scheme: {
        typeParams: ["T"],
        type: (() => {
          const T = freshTypeVar("T");
          return typeFn(
            [typeArray(T), typeFn([T, T], T)],
            typeApp(typeCon("Option"), [T])
          );
        })(),
      },
      description: "Reduce an array to a single value",
    },
    {
      name: "get",
      scheme: {
        typeParams: ["T"],
        type: (() => {
          const T = freshTypeVar("T");
          return typeFn([typeArray(T), TYPE_NAT], typeApp(typeCon("Option"), [T]));
        })(),
      },
      description: "Safe index access, returns None if out of bounds",
    },
    {
      name: "find",
      scheme: {
        typeParams: ["T"],
        type: (() => {
          const T = freshTypeVar("T");
          return typeFn([typeArray(T), typeFn([T], TYPE_BOOL)], typeApp(typeCon("Option"), [T]));
        })(),
      },
      description: "Find first element matching a predicate",
    },
    {
      name: "any",
      scheme: {
        typeParams: ["T"],
        type: (() => {
          const T = freshTypeVar("T");
          return typeFn([typeArray(T), typeFn([T], TYPE_BOOL)], TYPE_BOOL);
        })(),
      },
      description: "Check if any element matches a predicate",
    },
    {
      name: "all",
      scheme: {
        typeParams: ["T"],
        type: (() => {
          const T = freshTypeVar("T");
          return typeFn([typeArray(T), typeFn([T], TYPE_BOOL)], TYPE_BOOL);
        })(),
      },
      description: "Check if all elements match a predicate",
    },
    {
      name: "contains",
      scheme: {
        typeParams: ["T"],
        type: (() => {
          const T = freshTypeVar("T");
          return typeFn([typeArray(T), T], TYPE_BOOL);
        })(),
      },
      description: "Check if array contains an element",
    },
    {
      name: "concat",
      scheme: {
        typeParams: ["T"],
        type: (() => {
          const T = freshTypeVar("T");
          return typeFn([typeArray(T), typeArray(T)], typeArray(T));
        })(),
      },
      description: "Concatenate two arrays",
    },
    {
      name: "reverse",
      scheme: {
        typeParams: ["T"],
        type: (() => {
          const T = freshTypeVar("T");
          return typeFn([typeArray(T)], typeArray(T));
        })(),
      },
      description: "Reverse an array",
    },
    {
      name: "take",
      scheme: {
        typeParams: ["T"],
        type: (() => {
          const T = freshTypeVar("T");
          return typeFn([typeArray(T), TYPE_NAT], typeArray(T));
        })(),
      },
      description: "Take first n elements from an array",
    },
    {
      name: "drop",
      scheme: {
        typeParams: ["T"],
        type: (() => {
          const T = freshTypeVar("T");
          return typeFn([typeArray(T), TYPE_NAT], typeArray(T));
        })(),
      },
      description: "Drop first n elements from an array",
    },
    {
      name: "zip",
      scheme: {
        typeParams: ["T", "U"],
        type: (() => {
          const T = freshTypeVar("T");
          const U = freshTypeVar("U");
          return typeFn([typeArray(T), typeArray(U)], typeArray(typeTuple([T, U])));
        })(),
      },
      description: "Combine two arrays into array of tuples",
    },

    // String operations
    {
      name: "str_len",
      scheme: {
        typeParams: [],
        type: typeFn([TYPE_STR], TYPE_NAT),
      },
      description: "Get the length of a string",
    },
    {
      name: "trim",
      scheme: {
        typeParams: [],
        type: typeFn([TYPE_STR], TYPE_STR),
      },
      description: "Remove leading and trailing whitespace",
    },
    {
      name: "split",
      scheme: {
        typeParams: [],
        type: typeFn([TYPE_STR, TYPE_STR], typeArray(TYPE_STR)),
      },
      description: "Split a string by a delimiter",
    },
    {
      name: "join",
      scheme: {
        typeParams: [],
        type: typeFn([typeArray(TYPE_STR), TYPE_STR], TYPE_STR),
      },
      description: "Join strings with a delimiter",
    },
    {
      name: "to_string",
      scheme: {
        typeParams: ["T"],
        type: typeFn([freshTypeVar("T")], TYPE_STR),
      },
      description: "Convert a value to a string",
    },

    // IO operations
    {
      name: "print",
      scheme: {
        typeParams: [],
        type: typeFn([TYPE_STR], TYPE_UNIT, new Set(["IO"])),
      },
      description: "Print a string to stdout (IO effect)",
    },
    {
      name: "println",
      scheme: {
        typeParams: [],
        type: typeFn([TYPE_STR], TYPE_UNIT, new Set(["IO"])),
      },
      description: "Print a string with newline to stdout (IO effect)",
    },

    // Control flow
    {
      name: "panic",
      scheme: {
        typeParams: [],
        type: typeFn([TYPE_STR], TYPE_NEVER),
      },
      description: "Terminate with an error message",
    },
    {
      name: "unreachable",
      scheme: {
        typeParams: [],
        type: typeFn([], TYPE_NEVER),
      },
      description: "Mark code as unreachable",
    },

    // Option operations
    {
      name: "Some",
      scheme: {
        typeParams: ["T"],
        type: (() => {
          const T = freshTypeVar("T");
          return typeFn([T], typeApp(typeCon("Option"), [T]));
        })(),
      },
      description: "Create Some variant of Option",
    },

    // Result operations
    {
      name: "Ok",
      scheme: {
        typeParams: ["T", "E"],
        type: (() => {
          const T = freshTypeVar("T");
          const E = freshTypeVar("E");
          return typeFn([T], typeApp(typeCon("Result"), [T, E]));
        })(),
      },
      description: "Create Ok variant of Result",
    },
    {
      name: "Err",
      scheme: {
        typeParams: ["T", "E"],
        type: (() => {
          const T = freshTypeVar("T");
          const E = freshTypeVar("E");
          return typeFn([E], typeApp(typeCon("Result"), [T, E]));
        })(),
      },
      description: "Create Err variant of Result",
    },

    // Type conversions
    {
      name: "int_to_float",
      scheme: {
        typeParams: [],
        type: typeFn([TYPE_INT], TYPE_FLOAT),
      },
      description: "Convert an integer to a float",
    },
    {
      name: "float_to_int",
      scheme: {
        typeParams: [],
        type: typeFn([TYPE_FLOAT], TYPE_INT),
      },
      description: "Convert a float to an integer (truncate)",
    },

    // Math operations
    {
      name: "abs",
      scheme: {
        typeParams: [],
        type: typeFn([TYPE_INT], TYPE_NAT),
      },
      description: "Absolute value of an integer",
    },
    {
      name: "min",
      scheme: {
        typeParams: ["T"],
        type: (() => {
          const T = freshTypeVar("T");
          return typeFn([T, T], T);
        })(),
      },
      description: "Return the smaller of two values",
    },
    {
      name: "max",
      scheme: {
        typeParams: ["T"],
        type: (() => {
          const T = freshTypeVar("T");
          return typeFn([T, T], T);
        })(),
      },
      description: "Return the larger of two values",
    },
  ];
}

// =============================================================================
// Context Initialization
// =============================================================================

/**
 * Initialize a type context with all built-in types and functions.
 */
export function initializeBuiltins(ctx: TypeContext): void {
  // Register built-in type definitions
  ctx.defineType("Option", createOptionTypeDef());
  ctx.defineType("Result", createResultTypeDef());
  ctx.defineType("Ordering", createOrderingTypeDef());

  // Register built-in functions
  for (const fn of getBuiltinFunctions()) {
    ctx.define(fn.name, {
      type: fn.scheme,
      mutable: false,
      span: DUMMY_SPAN,
      source: "external",
    });
  }

  // Register variant constructors for built-in sum types
  ctx.define("None", {
    type: {
      typeParams: ["T"],
      type: typeApp(typeCon("Option"), [freshTypeVar("T")]),
    },
    mutable: false,
    span: DUMMY_SPAN,
    source: "external",
  });

  ctx.define("Less", {
    type: typeCon("Ordering"),
    mutable: false,
    span: DUMMY_SPAN,
    source: "external",
  });

  ctx.define("Equal", {
    type: typeCon("Ordering"),
    mutable: false,
    span: DUMMY_SPAN,
    source: "external",
  });

  ctx.define("Greater", {
    type: typeCon("Ordering"),
    mutable: false,
    span: DUMMY_SPAN,
    source: "external",
  });
}
