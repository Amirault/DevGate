---
name: test-implementation
description: "Single source of truth for C#/.NET test patterns in this project. Read this skill before writing any [Fact], [Test], or [Theory] — including simple ones. Always invoke when writing, modifying, or reviewing tests, and whenever tdd-cycle, coverage-guard, or review delegates to test patterns. Covers: FIRST principles, Given/When/Then structure with title-case comments (// Given // When // Then), factory methods, AnyX default records with with-expressions, in-memory fakes for use-case tests, TestContainers for secondary adapters, Given_When_Should naming, FluentAssertions lean assertions, [Theory]/[InlineData] for finite inputs (enums), exclusion testing (assert what should NOT be there), and false-positive prevention."
effort: medium
---

# Test Implementation

## Tests are documentation

Tests are the **living specification** of behavior. If someone wants to understand what a feature does, the tests should be the first place they look — not code comments, not wikis.

Write each test as if it were a sentence in a spec: the name states the rule, the body proves it. If the test doesn't read like a behavioral description, rewrite it.

## FIRST — checklist

- **Fast**: milliseconds, not seconds. Example: favour in-memory dependencies in unit tests to stay fast.
- **Independent**: no test relies on another's state or execution order.
- **Repeatable**: same result every run, any machine, no external state.
- **Self-validating**: pass or fail — no manual inspection.
- **Timely**: write the test *before* or *alongside* the production code.

## Structure: GIVEN / WHEN / THEN

Every test has exactly three sections, separated by comments.

### GIVEN — prepare the context

Set up initial state, dependencies, and inputs.

- Use a **shared factory method** to wire dependencies — avoid repeating setup across tests.
- The factory accepts only what varies; defaults handle the rest.
- Shared context (builders, fixtures) must be **small, isolated, co-located** in the same test class.
- GIVEN prepares but never acts — no side-effect-producing calls here.
- **Only expose what matters** — objects must be fully constructed (all fields valid), but only the field that drives the scenario should be visible. Use a **baseline default + `with` expression** so irrelevant construction details never appear in the test body.

```csharp
// ✅ Fully valid object; only the relevant field is visible
var order = AnyOrder with { Total = 200m };

// ❌ Construction noise — Id and Status are irrelevant to a threshold test
var order = new Order { Id = Guid.NewGuid(), Total = 200m, Status = OrderStatus.Confirmed };
```

`AnyOrder` is a `static readonly` record field in the test class holding sensible defaults for every property.

```csharp
// ✅ Factory method — wiring is centralized, each test only specifies what matters
private static GetDeployedVersionDetailsUseCase CreateGetDeployedVersionDetailsUseCase(
    List<Deployment> deployments = null,
    List<Partnership> partnerships = null
) => new(
    new InMemoryDeploymentRepository(deployments ?? []),
    new InMemoryPartnershipRepository(partnerships ?? [])
);
```

```csharp
// ❌ Duplicated setup in every test — noisy, fragile, hides intent
[Fact]
public async Task Test1()
{
    var repo1 = new InMemoryDeploymentRepository([...]);
    var repo2 = new InMemoryPartnershipRepository([...]);
    var repo3 = new InMemoryConfigPort([...]);
    var getDeployedVersionDetails = new GetDeployedVersionDetailsUseCase(repo1, repo2, repo3);
    // ...
}
```

### WHEN — one action through the public entry point

Execute the single behavior under test through the **public entry point of the layer being tested**. Never call private or internal methods directly — do not execute implementation details but focus on the layer entry point (e.g. API endpoint for a primary adapter, public method for a use-case, interface for a secondary adapter).

One WHEN per test — if you need more than one instruction, you may be testing multiple behaviours; refine the test scope and split by behaviour.

```csharp
// ✅ Call the public entry point
var result = await getDeployedVersionDetails.ExecuteAsync(versionId);

// ❌ Call an internal method directly — couples test to implementation
var filtered = getDeployedVersionDetails.FilterDeployments(deployments);
```

### THEN — assert behavior, not implementation

Verify observable outcomes. Never assert on internal state or call counts.

```csharp
// ✅ Assert on returned data
result.PartnershipConfiguration.PartnershipCode.Should().Be("PART001");

// ❌ Assert on mock internals
mockRepo.Verify(r => r.SelectAllAsync(It.IsAny<Expression>()), Times.Once);
```

**Rules for lean assertions:**

- **Assert one behaviour** — a behaviour often maps to a single `.Should()` call that directly mirrors the test name. A small cohesive set of assertions is acceptable when they all describe the same behaviour; avoid overlapping or redundant ones. Example: don't assert `NotNull` when you can directly assert the value.
- **No redundant assertions** — never guard with `result.Should().NotBeNull()` before accessing a property; a null result will fail the next assertion with a clear message.
- **Match the test name** — the assertion should echo exactly what the test name claims. Avoid asserting things the test name does not declare.
- **Side effects on ports must be verified** — if the use-case writes to a port (saves, updates, deletes), write a dedicated test that asserts the port's state via the in-memory fake. Pass the in-memory instance to both the factory method (e.g. `CreateUpdateOrderPriceUseCase`) and the assertion.

```csharp
// ✅ One assertion — matches "ShouldReduceTotalByTenPercent"
result.DiscountedTotal.Should().Be(180m);

// ❌ Three assertions — redundant null guard + extra assertion not claimed by the test name
result.Should().NotBeNull();
result.DiscountedTotal.Should().Be(180m);
result.DiscountApplied.Should().BeTrue();
```

```csharp
// ✅ Dedicated test — asserts the side effect on the port directly
[Fact]
public async Task GivenOrder_WhenUpdatingPrice_ShouldPersistNewPriceToRepository()
{
    // GIVEN
    var order = AnyOrder with { Price = 100m };
    var repository = new InMemoryOrderRepository([order]);
    var updateOrderPrice = CreateUpdateOrderPriceUseCase(repository);

    // WHEN
    await updateOrderPrice.UpdatePriceAsync(order.Id, 150m);

    // THEN
    var saved = await repository.GetByIdAsync(order.Id);
    saved.Price.Should().Be(150m);
}

// ❌ Only verifies the return value — the persistence side effect is never checked
result.Price.Should().Be(150m);
```

## Naming: Given_When_Should

**Format**: `Given<Context>_When<Action>_Should<Expected>`

All three parts are **mandatory**. Use domain language — no technical jargon.

```csharp
// ✅ Clear context, action, and expectation in domain terms
GivenDeploymentWithPartnership_WhenGettingVersionDetails_ShouldReturnPartnershipConfiguration()
GivenNoDeployment_WhenGettingVersionDetails_ShouldReturnNull()
GivenPartnershipCodeUnknown_WhenReadingConfiguration_ShouldReturnNull()

// ❌ Missing Given — unclear initial context
WhenDeploymentExists_ShouldReturnDetails()

// ❌ Technical jargon instead of domain language
TestGetDeployedVersionDetails_Case1()
ExecuteAsync_ReturnsNotNull_WhenDataExists()
```

## Expressiveness over cleverness

Test code should read like prose. Favor clarity over brevity.

- Name variables after what they *represent*, not their type (`confirmedOrder` not `o1`)
- Avoid magic values — use named constants or explain intent inline
- Keep the GIVEN section scannable: a reader should understand the scenario in seconds

```csharp
// ✅ Expressive — reads like a story
var expiredOrder = new Order { Id = orderId, Total = 200m, Status = OrderStatus.Expired };

// ❌ Opaque — requires mental parsing
var o = new Order { Id = Guid.NewGuid(), Total = 200m, Status = (OrderStatus)3 };
```

## Test the right layer with the right tool

Choose the test strategy based on **which layer you are testing**, note on preference for “more real”:

### Secondary adapters — TestContainers

A secondary adapter IS the integration with the external system. Test it with a real engine via TestContainers: this catches SQL mapping issues, ORM edge cases, and migration correctness that no fake can reveal.

- Lifecycle via `IAsyncLifetime` (`InitializeAsync` / `DisposeAsync`)
- `MigrateAsync()` in `InitializeAsync` to apply the real schema
- GIVEN seeds data directly through `DbContext`; WHEN calls the adapter; THEN reads back through `DbContext`

```csharp
public class PartnershipSavingAdapterTests : IAsyncLifetime
{
    private PostgreSqlContainer _dbContainer;
    private PricingReleaseManagementDbContext _dbContext;
    private PartnershipSavingAdapter _partnershipSavingAdapter;

    public async Task InitializeAsync()
    {
        _dbContainer = new PostgreSqlBuilder().WithImage("postgres:15.1").Build();
        await _dbContainer.StartAsync();

        _dbContext = new PricingReleaseManagementDbContext(
            new DbContextOptionsBuilder<PricingReleaseManagementDbContext>()
                .UseNpgsql(_dbContainer.GetConnectionString()).Options);
        await _dbContext.Database.MigrateAsync();

        _partnershipSavingAdapter = new PartnershipSavingAdapter(_dbContext);
    }

    public async Task DisposeAsync() => await _dbContainer.DisposeAsync();

    [Fact]
    public async Task GivenExistingProduct_WhenAddingPartnership_ShouldPersistInDatabase()
    {
        // GIVEN
        var productId = (await _dbContext.Products.SingleAsync(p => p.Name == "SEED-PRODUCT")).Id;

        // WHEN
        _partnershipSavingAdapter.AddPartnership("PART-001", "Partnership A", productId, "test-user");

        // THEN
        var saved = await _dbContext.Partnerships.SingleOrDefaultAsync(p => p.Code == "PART-001");
        saved.Should().NotBeNull();
    }
}
```

### Use-cases — always unit tests with in-memory fakes

Use-case tests must stay **pure unit tests**: fast, isolated, no containers. The adapter’s correctness is already guaranteed by its TestContainers tests — do not re-verify it here. Wire in-memory fakes through the adapter interface.

```csharp
// ✅ In-memory — executes real filtering logic; adapter correctness covered by TestContainers
private sealed class InMemoryDeploymentRepository(List<Deployment> deployments)
    : IRepository<Deployment>
{
    public Task<IEnumerable<Deployment>> SelectAllAsync(
        Expression<Func<Deployment, bool>> whereClause,
        CancellationToken ct = default)
    {
        var compiled = whereClause.Compile();
        return Task.FromResult<IEnumerable<Deployment>>(
            deployments.Where(compiled).ToList());
    }
    // Other methods → throw new NotImplementedException()
}
```

### Test doubles — last resort

Prefer custom doubles (in-memory fakes, hand-written spies) over mock frameworks. Reserve mock frameworks only for third-party boundaries you cannot own: HTTP clients, external SDKs. Even then, prefer a thin adapter with an in-memory implementation.

```csharp
// ❌ Mock — hides behavior behind configuration, brittle to refactoring
var mockRepo = new Mock<IRepository<Deployment>>();
mockRepo
    .Setup(r => r.SelectAllAsync(It.IsAny<Expression<Func<Deployment, bool>>>(), default))
    .ReturnsAsync(new List<Deployment> { deployment });
```

## False-positive prevention

A test that cannot fail is worthless.

- **Always verify failure**: after updating an existing test, ensure it can both fail and succeed for the corresponding checked behaviour.
- **Test exclusions, not just inclusions**: if logic filters items, assert that non-matching items are *absent*.
- **Finite inputs → exhaustive coverage**: for enums or small value sets, test every value using `[Theory]`/`[InlineData]`. Never write one `[Fact]` per enum value — collapse them into a single theory.

```csharp
// ✅ One [Theory] — every enum value covered, only what varies is visible
[Theory]
[InlineData(LoyaltyLevel.None,   1000m)]
[InlineData(LoyaltyLevel.Silver,  950m)]
[InlineData(LoyaltyLevel.Gold,    900m)]
public async Task GivenContract_WhenApplyingDiscount_ShouldApplyCorrectRate(
    LoyaltyLevel loyalty, decimal expectedPremium)
{
    // GIVEN
    var contract = AnyContract with { Loyalty = loyalty };
    var applyDiscount = CreateApplyDiscountUseCase([contract]);

    // WHEN
    var result = await applyDiscount.ExecuteAsync(contract.Id);

    // THEN
    result.DiscountedPremium.Should().Be(expectedPremium);
}

// ❌ Three [Fact]s — adding a new enum value silently misses a test
[Fact] public async Task GivenSilverLoyalty_... { ... }
[Fact] public async Task GivenGoldLoyalty_...  { ... }
[Fact] public async Task GivenNoLoyalty_...    { ... }
```

```csharp
// ✅ Tests both presence AND absence
result.Should().ContainSingle().Which.Name.Should().Be("AUTO_INSURANCE");
result.Should().NotContain(p => p.Name == "HOME_INSURANCE");

// ❌ Only tests the happy path — a bug returning everything would still pass
result.Should().Contain(p => p.Name == "AUTO_INSURANCE");
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
- **Do**: test **every value** when the input is finite (enum, fixed list) — use `[Theory]`/`[InlineData]` or `[TestCase]`.
- **Do**: write one test per **distinct behaviour**, not per method.
- **Don't**: stop after the happy path.
- **Don't**: test more than one behaviour in a single test.
