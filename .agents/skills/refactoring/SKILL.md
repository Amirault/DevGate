---
name: refactoring
description: "Language-agnostic active refactoring guide (SOLID, Fowler's catalog). Invoke on: refactor, clean up, simplify, extract, too long, smells; a method over ~10 lines, a class with several responsibilities, more than 3-4 parameters, or single-use Request/Response/DTO/Exception types in dedicated files. Also proactively when about to write code that violates SOLID or YAGNI. Guides the fix; review detects the smells. Examples in pseudo-code; per-language references (C#/.NET included) hold concrete code."
effort: medium
---

# Refactoring

Refactoring changes structure without changing behavior. A test suite must stay green at every step.

**Language**: the rules below hold in any language; the examples are pseudo-code. Concrete code and the test command live in `references/<language>.md` (available: [C# / .NET](references/csharp.md)). No reference for your language → apply the same rules with its idioms, and use the project's own test command.

## Before Starting

1. Confirm tests are green, with the project's test command (see the harness, `.agents/skills/specify/references/harness.md`)
2. Identify the smell (see catalog below)
3. Pick the smallest safe refactoring
4. Run tests after each step — never accumulate steps

**Rule**: if you cannot run tests after each step, the refactoring is too big. Split it.

## SOLID Violations → Fix Patterns

### S — Single Responsibility Principle

**Smell**: unit (class, module) with >1 reason to change; function that does fetch + transform + persist.

**Fix**: Extract Class/Module, Extract Function.

```text
// ❌ One function fetches, computes, and saves
execute(req):
    data = repo.get(req.id)            // fetch
    computed = data.price * 0.9        // compute
    repo.save(data with price=computed) // save

// ✅ Each step is a named function
execute(req):
    data = fetch(req.id)
    discounted = applyDiscount(data)
    persist(discounted)
```

### O — Open/Closed Principle

**Smell**: `switch`/`if-else` on a type or enum that grows with every new case.

**Fix**: Introduce polymorphism (strategy), or a lookup table of handlers.

```text
// ❌ Branches that grow with every new engine
if engineType == "a": return engineA.calculate(req)
if engineType == "b": return engineB.calculate(req)

// ✅ Port + adapter — a new engine = a new unit, no existing code changes
interface PricingEnginePort { calculate(req): Result }
```

### L — Liskov Substitution Principle

**Smell**: a subtype throws "not implemented", overrides a method to do nothing, or narrows preconditions.

**Fix**: Replace inheritance with composition; use interfaces for shared behavior.

### I — Interface Segregation Principle

**Smell**: an interface with 5+ operations where callers use 1-2; "not implemented" stubs in adapters.

**Fix**: Split the interface into focused ports.

```text
// ❌ Fat interface — a saving adapter is forced to implement retrieval
interface QuotePort { save, get, delete, list, archive }

// ✅ Focused ports — each use case depends only on what it needs
interface QuoteSavingPort   { save(quote) }
interface QuoteRetrievePort { get(id): Quote }
```

### D — Dependency Inversion Principle

**Smell**: a use case instantiates a concrete adapter itself; the application layer imports the infrastructure layer.

**Fix**: Inject the dependency, declare it as a port owned by the application layer.

```text
// ❌ Use case depends on a concrete implementation
class CreateQuote { db = new CosmosDbAdapter() }   // WRONG

// ✅ Depends on a port, injected at construction
class CreateQuote { constructor(quoteSaving: QuoteSavingPort) }
```

## Type Colocation → Reduce File Count

**Smell**: a single-use Request/Response/DTO/Exception type in a dedicated file.
**Fix**: Keep the type next to its only consumer (nested, or in the same file/module, whichever the language idiomatically allows).

**Decision:**

1. Domain entity? → Separate file
2. Used by 2+ consumers? → Separate file
3. Single consumer → Colocate with it

**Verify before moving:** search the codebase for the type name; about 2 hits (definition + 1 use) means single use.

## Fowler Code Smells → Refactorings

| Smell                                | Signal                                                               | Refactoring                                  |
| ------------------------------------ | -------------------------------------------------------------------- | -------------------------------------------- |
| **Long Method**                      | >10 lines, multiple levels of abstraction                            | Extract Function                             |
| **Long Parameter List**              | >3-4 params                                                          | Introduce Parameter Object (record/struct)   |
| **Feature Envy**                     | Function uses another unit's data more than its own                  | Move Function                                |
| **Primitive Obsession**              | `customerCode: string`, `premium: number` passed raw                 | Introduce Value Object                       |
| **Data Clumps**                      | Same 3 params appear together repeatedly                             | Extract Record/Class                         |
| **Shotgun Surgery**                  | 1 change touches 5+ files                                            | Move/consolidate                             |
| **Divergent Change**                 | Unit changes for multiple unrelated reasons                          | Extract Class/Module (SRP)                   |
| **Middle Man**                       | Unit just delegates every call                                       | Remove Middle Man                            |
| **Dead Code**                        | Unused functions, parameters, variables                              | Delete — never comment out                   |
| **Single-Use Type in Separate File** | Request/Response/DTO/Exception used by 1 consumer, in dedicated file | Colocate with its consumer                   |

## YAGNI / KISS Boundaries

**Refactor when:**

- You see the same pattern for the **third time** (Rule of Three)
- The design makes the next failing test hard to pass — get back to green first, refactor, then resume
- A real requirement forces the change

**Do NOT refactor when:**

- "It might be useful someday"
- The abstraction would have only one implementation
- The indirection adds complexity without enabling a concrete scenario

## Refactoring Loop

```text
1. Green tests
2. Identify ONE smell
3. Apply ONE refactoring
4. Run the tests  ← must stay green
5. Repeat
```

## References

- [`references/csharp.md`](references/csharp.md) — the same rules in C# / .NET (`dotnet test --blame-crash`, records, nested types)
- `.agents/skills/test-implementation/SKILL.md` — test patterns during refactor
- The project's `AGENTS.md`, when it has one — KISS/YAGNI, Clean as you go
