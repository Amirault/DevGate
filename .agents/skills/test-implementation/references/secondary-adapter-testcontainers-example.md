# Secondary adapter test — TestContainers example

Worked example for the rule in `SKILL.md` → _Secondary adapters — TestContainers_ (xUnit + PostgreSQL + EF Core, from ReleaseManagement).

```csharp
public class OrderSavingAdapterTests : IAsyncLifetime
{
    private PostgreSqlContainer _dbContainer;
    private ReleaseManagementDbContext _dbContext;
    private OrderSavingAdapter _orderSavingAdapter;

    public async Task InitializeAsync()
    {
        _dbContainer = new PostgreSqlBuilder().WithImage("postgres:15.1").Build();
        await _dbContainer.StartAsync();

        _dbContext = new ReleaseManagementDbContext(
            new DbContextOptionsBuilder<ReleaseManagementDbContext>()
                .UseNpgsql(_dbContainer.GetConnectionString()).Options);
        await _dbContext.Database.MigrateAsync();

        _orderSavingAdapter = new OrderSavingAdapter(_dbContext);
    }

    public async Task DisposeAsync() => await _dbContainer.DisposeAsync();

    [Fact]
    public async Task GivenExistingProduct_WhenAddingPartnership_ShouldPersistInDatabase()
    {
        // Given
        var productId = (await _dbContext.Products.SingleAsync(p => p.Name == "SEED-PRODUCT")).Id;

        // When
        _orderSavingAdapter.AddPartnership("PART-001", "Partnership A", productId, "test-user");

        // Then
        var saved = await _dbContext.Partnerships.SingleOrDefaultAsync(p => p.Code == "PART-001");
        saved.Should().NotBeNull();
    }
}
```
