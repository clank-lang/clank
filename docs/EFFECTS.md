# Effect System

**Status:** Fully implemented

Clank's effect system tracks computational effects like IO, error handling, and mutation. Pure functions cannot perform effects; functions that do must declare them in their return type.

## Effect Types

| Effect | Description | Example |
|--------|-------------|---------|
| `IO` | Input/output operations | `println`, `read_file` |
| `Err[E]` | May fail with error type `E` | `parse_int`, `divide` |
| `Async` | Asynchronous computation | `fetch`, `sleep` |
| `Mut` | Mutable state | Mutable variables |

## Syntax

### Effect Annotations

```clank
// IO effect - function performs I/O
fn greet(name: String) -> IO[Unit] {
  println("Hello, " ++ name)
}

// Err effect - function may fail
fn divide(a: Int, b: Int) -> Err[String, Int] {
  if b == 0 {
    Err("Division by zero")
  } else {
    Ok(a / b)
  }
}

// Multiple effects (using + syntax)
fn read_config() -> IO + Err[String, Config] {
  let content = read_file("config.json")?;
  parse_config(content)
}

// Async effect
fn fetch_data(url: String) -> Async[String] {
  // ...
}
```

### Effect Shorthands

| Syntax | Meaning |
|--------|---------|
| `IO[T]` | `{ IO }[T]` - Returns `T` with IO effect |
| `Err[E, T]` | `{ Err[E] }[T]` - Returns `T` or error `E` |
| `Async[T]` | `{ Async }[T]` - Returns `T` asynchronously |
| `IO + T` | `{ IO }[T]` - Alternative syntax |

## Error Propagation

Use the `?` operator to propagate errors:

```clank
fn read_numbers(path: String) -> Err[String, [Int]] {
  let content = read_file(path)?;   // Propagates IO errors
  let lines = split(content, "\n");
  map(lines, |line| parse_int(line)?)
}
```

The `?` operator:
1. Unwraps `Ok(value)` to `value`
2. Returns early with `Err(e)` if the result is an error
3. Requires the enclosing function to have the `Err` effect

## Effect Checking

The type checker enforces effect discipline:

```clank
// Pure function - no effects
fn add(a: Int, b: Int) -> Int {
  a + b
}

// ERROR: IO effect not allowed in pure function
fn bad_add(a: Int, b: Int) -> Int {
  println("Adding...")   // E4001: Effect not allowed
  a + b
}

// CORRECT: Declare the IO effect
fn good_add(a: Int, b: Int) -> IO[Int] {
  println("Adding...");
  a + b
}
```

### E4001: EffectNotAllowed

Raised when an effectful operation is used in a context that doesn't allow it.

```clank
fn pure_function() -> Int {
  println("hello")  // Error: IO effect not allowed in pure function
  42
}
```

**Repair:** Add effect annotation to function return type.

### E4002: UnhandledEffect

Raised when the `?` operator is used without the `Err` effect.

```clank
fn no_err_effect() -> Int {
  let x = risky_operation()?  // Error: Err effect not handled
  x + 1
}
```

**Repair:** Add `Err` effect to return type or handle the error explicitly.

## Effect Inference

The compiler infers effects from function bodies:

```clank
fn example() -> IO[Unit] {
  println("Hello")  // IO effect inferred from println call
}
```

When a function calls another effectful function, the caller must also declare the effect (or handle it):

```clank
fn caller() -> IO[Unit] {
  greet("World")  // Requires IO because greet has IO effect
}
```

## Effect Subtyping

Effects follow subtyping rules:

| Rule | Description |
|------|-------------|
| Pure < Any | Pure functions can be used where effectful ones are expected |
| `IO[T]` is distinct | IO effect is tracked separately |
| `Err[E, T]` is distinct | Error types are tracked |

## Built-in Effectful Functions

### IO Functions

```clank
external fn print(s: String) -> IO[Unit] = "console.log"
external fn println(s: String) -> IO[Unit] = "console.log"
```

### Result Constructors

```clank
// Built-in constructors for Result type
Ok(value)   // Create successful result
Err(error)  // Create error result
```

## Effect Erasure in Codegen

Effects are erased during code generation:

| Clank Type | Generated Type |
|------------|----------------|
| `IO[T]` | `T` (effect erased) |
| `Err[E, T]` | `Result<T, E>` |
| `Async[T]` | `Promise<T>` |

Generated code:

```clank
// Clank
fn greet(name: String) -> IO[Unit] {
  println("Hello, " ++ name)
}
```

```javascript
// Generated JavaScript
function greet(name) {
  __clank.println("Hello, " + name);
}
```

## Option and Result

The standard `Option` and `Result` types work with the effect system:

```clank
sum Option[T] {
  Some(T),
  None
}

sum Result[T, E] {
  Ok(T),
  Err(E)
}
```

### Pattern Matching

```clank
fn handle_option(opt: Option[Int]) -> Int {
  match opt {
    Some(x) -> x,
    None -> 0
  }
}

fn handle_result(res: Result[Int, String]) -> Int {
  match res {
    Ok(x) -> x,
    Err(msg) -> {
      println(msg);
      0
    }
  }
}
```

### Error Propagation with ?

```clank
fn chain_errors() -> Err[String, Int] {
  let a = operation_a()?;
  let b = operation_b(a)?;
  Ok(a + b)
}
```

## Future Work

- **Effect polymorphism** - Functions generic over effects
- **Effect handlers** - Custom effect handling
- **Linear effects** - Effects that must be handled exactly once
- **Effect inference improvements** - Better inference for complex cases

## See Also

- [Repairs](REPAIRS.md#effect-errors-e4xxx) - Effect error repairs
- [Language Spec](SPEC.md#6-effects) - Full effect specification
- [Code Generation](CODEGEN.md) - How effects are compiled
