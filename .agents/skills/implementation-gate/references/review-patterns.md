# Review Patterns

## Example Reviews

### Example 1: PASS — Clean Implementation

**Scenario**: User implemented a feature to filter quotes by coverage type

**Spec excerpt**:
```markdown
## Acceptance Criteria
- Given a list of quotes with various coverage types, When filtering by "MRH", Then only quotes with coverage "MRH" are returned
- Given a list of quotes, When filtering by unknown coverage "XYZ", Then an empty list is returned
```

**Implementation review**:

✅ **Tests found**:
```csharp
[Theory]
[InlineData("MRH", 2)]
[InlineData("AUTO", 1)]
[InlineData("XYZ", 0)]
public async Task GivenQuotes_WhenFilteringByCoverage_ShouldReturnMatchingQuotes(
    string coverage, int expectedCount)
{
    // GIVEN
    var quotes = new List<Quote>
    {
        AnyQuote with { Coverage = "MRH" },
        AnyQuote with { Coverage = "MRH" },
        AnyQuote with { Coverage = "AUTO" }
    };
    var filter = CreateQuoteFilter(quotes);

    // WHEN
    var result = await filter.ExecuteAsync(coverage);

    // THEN
    result.Should().HaveCount(expectedCount);
}
```

✅ **Verdict**: PASS
- All acceptance criteria covered
- Tests use real-looking data (not placeholders)
- Edge case (unknown coverage) tested
- Exclusion verified (AUTO not returned when filtering MRH)

---

### Example 2: BLOCKER — Missing Test Coverage

**Scenario**: User implemented nullable field handling but didn't test the null case

**Spec excerpt**:
```markdown
## Acceptance Criteria
- Given a quote with optional discount field populated, When calculating price, Then discount is applied
- Given a quote with optional discount field null, When calculating price, Then no discount is applied
```

**Implementation review**:

❌ **Problem**: Only happy path tested
```csharp
[Fact]
public async Task GivenQuoteWithDiscount_WhenCalculating_ShouldApplyDiscount()
{
    // Only tests discount present case — NULL case missing!
}
```

❌ **Verdict**: BLOCKER
- Second acceptance criterion not covered
- Nullable field behavior untested
- Risk: production will fail if discount is null

**Required fix**:
```csharp
[Theory]
[InlineData(10, 900)]  // with discount
[InlineData(null, 1000)] // without discount
public async Task GivenQuote_WhenCalculating_ShouldHandleOptionalDiscount(
    decimal? discount, decimal expectedPrice)
```

---

### Example 3: WARNING — Minor Test Clarity Issue

**Scenario**: Implementation correct but tests use placeholder data

**Spec excerpt**:
```markdown
### Example 1: Successful Quote Creation
- **Context**: User "alex.smith@example.com" with role "underwriter" requests quote for product "MRH"
- **Action**: Submit quote request
- **Result**: Quote created with ID and status "DRAFT"
```

**Implementation review**:

⚠️ **Issue**: Test uses generic placeholders instead of spec examples
```csharp
var user = "user@example.com"; // not matching spec example
var product = "PRODUCT_A";      // not matching spec example
```

⚠️ **Verdict**: WARNING (non-blocking)
- Functionality correct
- Tests pass
- But: harder to trace test to spec
- Recommendation: Use spec examples for traceability

---

### Example 4: BLOCKER — Scope Creep

**Spec excerpt**:
```markdown
## What NOT
- We are NOT adding validation for email format
- We are NOT changing the existing user lookup logic
```

**Implementation review**:

❌ **Problem**: Extra validation added beyond spec
```diff
+ if (!email.Contains("@"))
+     throw new InvalidEmailException();
```

❌ **Verdict**: BLOCKER
- Spec explicitly excluded email validation ("What NOT" section)
- Scope creep detected
- Must remove before commit

---

### Example 5: RECOMMENDATION — Refactoring Opportunity

**Scenario**: Implementation works but a method does too much

**Implementation review**:

🔧 **Long Method** — `QuoteService.cs:45`
```csharp
public async Task<Quote> CreateQuoteAsync(CreateQuoteRequest request)
{
    // 1. Validate input
    if (request.ProductCode == null) throw new ArgumentException(...);
    if (request.CoverageType == null) throw new ArgumentException(...);

    // 2. Fetch pricing rules
    var rules = await _pricingRepository.GetRulesAsync(request.ProductCode);
    var matchingRule = rules.FirstOrDefault(r => r.CoverageType == request.CoverageType);

    // 3. Calculate premium
    var basePremium = matchingRule.BasePremium;
    var discount = request.Discount ?? 0;
    var finalPremium = basePremium * (1 - discount / 100m);

    // 4. Persist
    var quote = new Quote { Premium = finalPremium, Status = "DRAFT" };
    await _quoteRepository.SaveAsync(quote);
    return quote;
}
```

🔧 **Refactoring suggestion**:
```
🔧 Long Method — QuoteService.cs:45
   Problem: CreateQuoteAsync mixes validation, rule lookup, premium calculation, and persistence
   Impact: Hard to test calculation logic in isolation; any change touches the whole method
   Suggestion: Extract Method — split into ValidateRequest(), FindMatchingRule(), CalculatePremium(), PersistQuote()
```

⚠️ **Verdict**: RECOMMENDATION (non-blocking)
- Code works and tests pass
- Refactoring would improve testability and readability
- Not a blocker, but strongly recommended before the codebase grows

---

### Example 6: CONCERN — Architecture Risk

**Scenario**: A domain service directly references an infrastructure concern

**Implementation review**:

🏗️ **Wrong dependency direction** — `Domain/Services/PricingEngine.cs`
```csharp
using Infrastructure.Persistence; // ❌ Domain layer depending on Infrastructure

public class PricingEngine
{
    private readonly SqlPricingRepository _repository; // concrete class, not interface

    public decimal CalculatePremium(string productCode)
    {
        var rules = _repository.GetRules(productCode); // domain knows about SQL
        return rules.Sum(r => r.BasePremium);
    }
}
```

🏗️ **Architecture assessment**:
```
🏗️ Architecture: CONCERN

Strengths:
- Calculation logic is isolated in a dedicated service
- Clear single responsibility for premium calculation

Risks:
- Domain → Infrastructure coupling → if persistence changes (e.g. switch to API call), PricingEngine must change
- Concrete SqlPricingRepository → untestable without a database

Change scenarios:
- "What if we switch from SQL to an external pricing API?" → significant redesign (domain code changes)
- "What if we add a second pricing source?" → requires modifying PricingEngine (violates Open/Closed)
```

❌ **Verdict**: CONCERN (blocking)
- Domain must depend on an abstraction (IPricingRuleRepository), not a concrete infrastructure class
- Fix: introduce an interface in Domain, implement in Infrastructure, inject via constructor
- This is a structural issue that will compound over time — resolve before merging

---

### Example 7: WATCH — Minor Structural Risk

**Scenario**: Implementation uses a hardcoded list that will likely grow

**Implementation review**:

🏗️ **Hardcoded assumption** — `Application/Handlers/QuoteHandler.cs:12`
```csharp
private static readonly string[] SupportedCoverages = { "MRH", "AUTO", "SANTE" };
```

🏗️ **Architecture assessment**:
```
🏗️ Architecture: WATCH

Strengths:
- Handler is well-structured, single responsibility
- Tests cover all three coverage types

Risks:
- Hardcoded coverage list → when a new coverage is added, developer must remember to update this array
- Risk of silent failure if list is not updated (no compile-time safety)

Change scenarios:
- "What if a new coverage type 'PJ' is added?" → requires code change and redeployment (could be config)
```

⚠️ **Verdict**: WATCH (non-blocking)
- Works correctly today
- Flag for future: consider making this configurable or deriving from a single source of truth
- Not blocking this implementation, but worth tracking

---

## Red Flags (Always Investigate)

| Red Flag | Why |
|----------|-----|
| Test always passes (`result.Should().NotBeNull()` with no content assertion) | Useless test |
| Void function with object parameter (side effect) | Against user rules |
| `Regex.Match` usage | Against user rules |
| Git diff includes unrelated files | Scope creep |
| Spec status is `specifying` or `on-hold` | Not approved yet |
