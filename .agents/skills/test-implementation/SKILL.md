---
name: test-implementation
description: "Language-agnostic single source of truth for test patterns: tests as documentation, FIRST, Given/When/Then, naming, assertions on behavior, the right test per layer, test doubles last, false-positive prevention. Read before writing any test (`[Fact]`, `[Test]`, `[Theory]`, `it(...)`, `def test_...`), even a simple one. Invoke when writing, modifying or reviewing tests, and whenever review or deliver-increment delegates to test patterns. Examples in pseudo-code; per-language references (C#/.NET included) hold concrete code."
effort: medium
---

# Test Implementation

**Language**: the rules below hold in any language; the examples are pseudo-code. Concrete code, naming syntax and tooling live in `references/<language>.md` (available: [C# / .NET](references/csharp.md), xUnit + FluentAssertions + Testcontainers). No reference for your language → apply the same rules with the project's test framework and conventions.

| Concept | Rule below | C# / .NET | TypeScript | Python |
| --- | --- | --- | --- | --- |
| Test case | one behaviour | `[Fact]` | `it(...)` | `def test_...` |
| Parametrised case | finite inputs | `[Theory]` + `[InlineData]` | `it.each` | `@pytest.mark.parametrize` |
| Baseline + override | only what matters | `AnyOrder with { Total = 200m }` | `{ ...anyOrder, total: 200 }` | `replace(any_order, total=200)` |
| Real dependency in a test | secondary adapters | Testcontainers | Testcontainers | testcontainers-python |

## Tests are documentation

Tests are the **living specification** of behavior. If someone wants to understand what a feature does, the tests should be the first place they look — not code comments, not wikis.

Write each test as if it were a sentence in a spec: the name states the rule, the body proves it. If the test doesn't read like a behavioral description, rewrite it.

## FIRST — checklist

- **Fast**: milliseconds, not seconds. Example: favour in-memory dependencies in unit tests to stay fast.
- **Independent**: no test relies on another's state or execution order.
- **Repeatable**: same result every run, any machine, no external state.
- **Self-validating**: pass or fail — no manual inspection.
- **Timely**: write the test _before_ or _alongside_ the production code.

## Structure: GIVEN / WHEN / THEN

Every test has exactly three sections, separated by comments.

### GIVEN — prepare the context

Set up initial state, dependencies, and inputs.

- Use a **shared factory function** to wire dependencies — avoid repeating setup across tests.
- The factory accepts only what varies; defaults handle the rest.
- Shared context (builders, fixtures) must be **small, isolated, co-located** in the same test file or class.
- GIVEN prepares but never acts — no side-effect-producing calls here.
- **Only expose what matters** — objects must be fully constructed (all fields valid), but only the field that drives the scenario should be visible. Use a **baseline default + override** so irrelevant construction details never appear in the test body.

```text
// (`expect(...)` below stands for your framework's assertion)
// ✅ Fully valid object; only the relevant field is visible
order = anyOrder with total = 200

// ❌ Construction noise — id and status are irrelevant to a threshold test
order = Order(id=newId(), total=200, status=CONFIRMED)
```

`anyOrder` is a constant in the test file holding sensible defaults for every property.

```text
// ✅ Factory — wiring is centralized, each test only specifies what matters
createGetVersionDetails(deployments = [], partnerships = []) =
    GetVersionDetails(InMemoryDeployments(deployments), InMemoryPartnerships(partnerships))

// ❌ Duplicated setup in every test — noisy, fragile, hides intent
test1:
    repo1 = InMemoryDeployments([...]); repo2 = InMemoryPartnerships([...]); repo3 = InMemoryConfig([...])
    getVersionDetails = GetVersionDetails(repo1, repo2, repo3)
```

### WHEN — one action through the public entry point

Execute the single behavior under test through the **public entry point of the layer being tested**. Never call private or internal functions directly — do not execute implementation details but focus on the layer entry point (e.g. API endpoint for a primary adapter, public function for a use case, interface for a secondary adapter).

One WHEN per test — if you need more than one instruction, you may be testing multiple behaviours; refine the test scope and split by behaviour.

```text
// ✅ Call the public entry point
result = getVersionDetails.execute(versionId)

// ❌ Call an internal function directly — couples the test to implementation
filtered = getVersionDetails.filterDeployments(deployments)
```

### THEN — assert behavior, not implementation

Verify observable outcomes. Never assert on internal state or call counts.

```text
// ✅ Assert on returned data
expect(result.partnershipCode).toBe("PART001")

// ❌ Assert on mock internals
expect(mockRepo.selectAll).toHaveBeenCalledTimes(1)
```

**Rules for lean assertions:**

- **Assert one behaviour** — a behaviour often maps to a single assertion that directly mirrors the test name. A small cohesive set of assertions is acceptable when they all describe the same behaviour; avoid overlapping or redundant ones. Example: don't assert "not null" when you can directly assert the value.
- **No redundant assertions** — never guard with a not-null check before accessing a property; a null result will fail the next assertion with a clear message.
- **Match the test name** — the assertion should echo exactly what the test name claims. Avoid asserting things the test name does not declare.
- **Side effects on ports must be verified** — if the use case writes to a port (saves, updates, deletes), write a dedicated test that asserts the port's state via the in-memory fake. Pass the same in-memory instance to both the factory and the assertion.

```text
// ✅ One assertion — matches "ShouldReduceTotalByTenPercent"
expect(result.discountedTotal).toBe(180)

// ❌ Three assertions — redundant null guard + extra assertion not claimed by the test name
expect(result).notNull(); expect(result.discountedTotal).toBe(180); expect(result.discountApplied).toBe(true)
```

```text
// ✅ Dedicated test — asserts the side effect on the port directly
test "GivenOrder_WhenUpdatingPrice_ShouldPersistNewPriceToRepository":
    // Given
    order = anyOrder with price = 100
    repository = InMemoryOrders([order])
    updateOrderPrice = createUpdateOrderPrice(repository)
    // When
    updateOrderPrice.execute(order.id, 150)
    // Then
    expect(repository.getById(order.id).price).toBe(150)

// ❌ Only verifies the return value — the persistence side effect is never checked
expect(result.price).toBe(150)
```

## Naming: Given_When_Should

**Format**: `Given<Context>_When<Action>_Should<Expected>` (adapt the casing to the language's convention, e.g. a sentence string in `it("given … when … should …")`).

All three parts are **mandatory**. Use domain language — no technical jargon.

```text
// ✅ Clear context, action, and expectation in domain terms
GivenDeploymentWithPartnership_WhenGettingVersionDetails_ShouldReturnPartnershipConfiguration
GivenNoDeployment_WhenGettingVersionDetails_ShouldReturnNothing

// ❌ Missing Given — unclear initial context
WhenDeploymentExists_ShouldReturnDetails

// ❌ Technical jargon instead of domain language
TestGetVersionDetails_Case1
execute_returnsNotNull_whenDataExists
```

## Test category

Tag every test class or file with exactly one category: `Spec` (drives a use case through its public entry point with fakes, outer TDD loop), `Unit` (a single unit in isolation, inner TDD loop), `Integration` (an adapter against the real technology it wraps), `Contract` (a shared suite run against every adapter of a port, or a check that a partner still honors an assumed contract), `Architecture` (a fitness function on dependencies). Full definitions: the project's `AGENTS.md` → Testing, when it has one. A `Spec` test MUST carry a human-readable description (attribute, docstring or title, per framework): the business sentence a non-developer would read, independent of the test name — it is what living documentation extracts.

## Expressiveness over cleverness

Test code should read like prose. Favor clarity over brevity.

- Name variables after what they _represent_, not their type (`confirmedOrder` not `o1`)
- Avoid magic values — use named constants or explain intent inline
- Keep the Given section scannable: a reader should understand the scenario in seconds

```text
// ✅ Expressive — reads like a story
expiredOrder = anyOrder with status = EXPIRED

// ❌ Opaque — requires mental parsing
o = anyOrder with status = 3
```

## Test the right layer with the right tool

Choose the test strategy based on **which layer you are testing**, preferring "more real" over "more mocked":

### Secondary adapters — a real engine

A secondary adapter IS the integration with the external system. Test it against the real technology it wraps, started in a throwaway container (Testcontainers or equivalent): this catches mapping issues, ORM edge cases, and migration correctness that no fake can reveal.

- Start the container and apply the real schema/migrations in the test setup; dispose it in teardown
- GIVEN seeds data directly through the database client; WHEN calls the adapter; THEN reads back through the database client

Read before writing a new secondary-adapter test in C# — worked example (xUnit + PostgreSQL + EF Core): [references/csharp-secondary-adapter-testcontainers.md](references/csharp-secondary-adapter-testcontainers.md).

### Use cases — always unit tests with in-memory fakes

Use-case tests must stay **pure unit tests**: fast, isolated, no containers. The adapter's correctness is already guaranteed by its real-engine tests — do not re-verify it here. Wire in-memory fakes through the adapter interface.

```text
// ✅ In-memory — executes real filtering logic; adapter correctness covered by its own integration test
class InMemoryDeployments implements Repository<Deployment>:
    constructor(items)
    selectAll(predicate) = items.filter(predicate)
    // other operations → throw "not implemented"
```

### Test doubles — last resort

Prefer custom doubles (in-memory fakes, hand-written spies) over mock frameworks. Reserve mock frameworks only for third-party boundaries you cannot own: HTTP clients, external SDKs. Even then, prefer a thin adapter with an in-memory implementation.

```text
// ❌ Mock — hides behavior behind configuration, brittle to refactoring
mockRepo = mock(Repository<Deployment>)
when(mockRepo.selectAll(any)).thenReturn([deployment])
```

## False-positive prevention

A test that cannot fail is worthless.

- **Always verify failure**: after updating an existing test, ensure it can both fail and succeed for the corresponding checked behaviour.
- **Test exclusions, not just inclusions**: if logic filters items, assert that non-matching items are _absent_.
- **Finite inputs → exhaustive coverage**: for enums or small value sets, test every value with one parametrised test. Never write one test per enum value — collapse them into a single parametrised test.

```text
// ✅ One parametrised test — every enum value covered, only what varies is visible
each (loyalty, expectedPremium) in [(NONE, 1000), (SILVER, 950), (GOLD, 900)]:
    test "GivenContract_WhenApplyingDiscount_ShouldApplyCorrectRate":
        contract = anyContract with loyalty = loyalty
        result = createApplyDiscount([contract]).execute(contract.id)
        expect(result.discountedPremium).toBe(expectedPremium)

// ❌ Three separate tests — adding a new enum value silently misses a test
```

```text
// ✅ Tests both presence AND absence
expect(result).toHaveSingleItem(named "AUTO_INSURANCE")
expect(result).notToContain(named "HOME_INSURANCE")

// ❌ Only tests the happy path — a bug returning everything would still pass
expect(result).toContain(named "AUTO_INSURANCE")
```

## Test ordering — newspaper metaphor

Order tests within a file like a newspaper article: **headline first, details later**.

1. Happy path / main behavior (the "headline")
2. Alternate valid paths
3. Edge cases (null, empty, boundary)
4. Error cases and invalid inputs

A reader skimming the file should understand the feature from the first few tests alone.

## Exhaustivity checklist

- **Do**: test null, empty, missing, and boundary values.
- **Do**: assert what is **absent**, not only what is present — a filter test must verify the excluded items too.
- **Do**: test **every value** when the input is finite (enum, fixed list) — use a parametrised test.
- **Do**: write one test per **distinct behaviour**, not per function.
- **Don't**: stop after the happy path.
- **Don't**: test more than one behaviour in a single test.
