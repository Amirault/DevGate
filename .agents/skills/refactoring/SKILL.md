---
name: refactoring
description: "Active refactoring guide for .NET/C# (SOLID, Fowler's catalog). Invoke on: refactor, clean up, simplify, extract, too long, smells; a method over ~10 lines, a class with several responsibilities, more than 3-4 parameters, or single-use Request/Response/DTO/Exception types in dedicated files. Also proactively when about to write code that violates SOLID or YAGNI. Guides the fix; review detects the smells."
effort: medium
---

# Refactoring

Refactoring changes structure without changing behavior. A test suite must stay green at every step.

## Before Starting

1. Confirm tests are green: `dotnet test --blame-crash`
2. Identify the smell (see catalog below)
3. Pick the smallest safe refactoring
4. Run tests after each step — never accumulate steps

**Rule**: if you cannot run tests after each step, the refactoring is too big. Split it.

## SOLID Violations → Fix Patterns

### S — Single Responsibility Principle

**Smell**: class with >1 reason to change; method that does fetch + transform + persist.

**Fix**: Extract Class, Extract Method.

```csharp
// ❌ UseCase fetches, computes, and saves
public async Task ExecuteAsync(Request req) {
    var data = await _repo.GetAsync(req.Id);    // fetch
    var computed = data.Price * 0.9m;           // compute
    await _repo.SaveAsync(data with { Price = computed }); // save
}

// ✅ Each step is a named method
public async Task ExecuteAsync(Request req) {
    var data = await FetchAsync(req.Id);
    var discounted = ApplyDiscount(data);
    await PersistAsync(discounted);
}
```

### O — Open/Closed Principle

**Smell**: `switch`/`if-else` on type/enum that grows with every new case.

**Fix**: Introduce polymorphism (strategy pattern), or use a dictionary dispatch.

```csharp
// ❌ Switch that breaks with every new engine
switch (engineType) {
    case "gembox": return _gembox.Calculate(req);
    case "engine-b": return _engineB.Calculate(req);
}

// ✅ Port + adapter — new engine = new class, no existing code changes
public interface IPricingEnginePort { Task<Result> CalculateAsync(Request req); }
```

### L — Liskov Substitution Principle

**Smell**: Subclass throws `NotImplementedException`, overrides method to do nothing, or narrows preconditions.

**Fix**: Replace inheritance with composition; use interfaces for shared behavior.

### I — Interface Segregation Principle

**Smell**: Interface with 5+ methods where callers only use 1-2; `NotImplementedException` in adapters.

**Fix**: Split interface into focused ports.

```csharp
// ❌ Fat interface — saving adapter forced to implement retrieval
public interface IQuotePort { Save(); Get(); Delete(); List(); Archive(); }

// ✅ Focused ports — each use case depends only on what it needs
public interface IQuoteSavingPort { Task SaveAsync(Quote q); }
public interface IQuoteRetrievePort { Task<Quote> GetAsync(string id); }
```

### D — Dependency Inversion Principle

**Smell**: Use case instantiates concrete adapter with `new`; Application imports Infrastructure namespace.

**Fix**: Inject via constructor, declare as port interface in Application.

```csharp
// ❌ Use case depends on concrete implementation
public class CreateQuoteUseCase {
    private readonly CosmosDbAdapter _db = new CosmosDbAdapter(); // WRONG
}

// ✅ Depends on port, injected at construction
public class CreateQuoteUseCase(IQuoteSavingPort quoteSaving) { }
```

## Type Colocation → Reduce File Count

**Smell**: Single-use Request/Response/DTO/Exception in dedicated file.
**Fix**: Nest types inside their consumer class/interface (usage/contract perimeter).

```csharp
// Nested private (internal implementation detail)
public class Parser {
    private HeaderInfo Extract() => new("prod", "v1");
    private record HeaderInfo(string Product, string Version);
}

// Nested public in class (use-case contract without interface contract)
public class CreateQuoteUseCase {
    public async Task<Response> CreateAsync(Request req) { }
    public record Request(string Code, decimal Amount);
    public record Response(string Id, decimal Final);
}

// Nested public in interface (port contract perimeter)
public interface IQuotePort {
    Task<Result> SaveAsync(QuoteDto dto);
    record QuoteDto(string Id, decimal Premium);
}
```

**Decision:**

1. Domain entity? → Separate file
2. Used by 2+ consumers? → Separate file
3. Single consumer → Nest inside consumer class/interface

**Verify before moving:** `grep -r "TypeName" src --include="*.cs" | wc -l` (≈2 = single use)

## Fowler Code Smells → Refactorings

| Smell                                | Signal                                                               | Refactoring                            |
| ------------------------------------ | -------------------------------------------------------------------- | -------------------------------------- |
| **Long Method**                      | >10 lines, multiple levels of abstraction                            | Extract Method                         |
| **Long Parameter List**              | >3-4 params                                                          | Introduce Parameter Object (C# record) |
| **Feature Envy**                     | Method uses another class's data more than its own                   | Move Method                            |
| **Primitive Obsession**              | `string customerCode`, `decimal premium` raw                      | Introduce Value Object                 |
| **Data Clumps**                      | Same 3 params appear together repeatedly                             | Extract Record/Class                   |
| **Shotgun Surgery**                  | 1 change touches 5+ files                                            | Move/consolidate                       |
| **Divergent Change**                 | Class changes for multiple unrelated reasons                         | Extract Class (SRP)                    |
| **Middle Man**                       | Class just delegates every call                                      | Remove Middle Man                      |
| **Dead Code**                        | Unused methods, parameters, variables                                | Delete — never comment out             |
| **Single-Use Type in Separate File** | Request/Response/DTO/Exception used by 1 consumer, in dedicated file | Nest in Consumer Class/Interface       |

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
4. dotnet test --blame-crash  ← must stay green
5. Repeat
```

## References

- `AGENTS.md` — KISS/YAGNI, Clean as you go
- `.agents/skills/test-implementation/SKILL.md` — test patterns during refactor
