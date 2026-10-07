# Secondary adapter test — TestContainers example

Worked example for the rule in `SKILL.md` → _Secondary adapters — TestContainers_ (xUnit + PostgreSQL + EF Core, from PricingReleaseManagement).

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
        // Given
        var productId = (await _dbContext.Products.SingleAsync(p => p.Name == "SEED-PRODUCT")).Id;

        // When
        _partnershipSavingAdapter.AddPartnership("PART-001", "Partnership A", productId, "test-user");

        // Then
        var saved = await _dbContext.Partnerships.SingleOrDefaultAsync(p => p.Code == "PART-001");
        saved.Should().NotBeNull();
    }
}
```
