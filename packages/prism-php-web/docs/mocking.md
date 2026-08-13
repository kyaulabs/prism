# When to Mock

Mock at **system boundaries** only:

- External APIs (payment, email, etc.)
- Databases (sometimes — prefer a test DB)
- Time/randomness
- File system (sometimes)

Don't mock:

- Your own classes/modules
- Internal collaborators
- Anything you control

## Designing for Mockability

At system boundaries, design interfaces that are easy to mock:

**1. Use dependency injection**

Pass external dependencies in rather than creating them internally:

```php
// Easy to mock
function processPayment(Order $order, PaymentClient $paymentClient): Result
{
    return $paymentClient->charge($order->getTotal());
}

// Hard to mock
function processPayment(Order $order): Result
{
    $client = new StripeClient(getenv('STRIPE_KEY'));

    return $client->charge($order->getTotal());
}
```

**2. Prefer SDK-style interfaces over generic fetchers**

Create specific methods for each external operation instead of one generic
method with conditional logic:

```php
// GOOD: Each method is independently mockable
interface ApiClient
{
    public function getUser(int $id): User;
    public function getOrders(int $userId): array;
    public function createOrder(array $data): Order;
}

// BAD: Mocking requires conditional logic inside the mock
interface ApiClient
{
    public function fetch(string $endpoint, array $options = []): mixed;
}
```

The SDK approach means:

- Each mock returns one specific shape
- No conditional logic in test setup
- Easier to see which endpoints a test exercises
- Type safety per operation

## Pest/Mockery notes

- Use `Mockery::mock(InterfaceName::class)` against an interface, never against
  a concrete class you own.
- Bind the mock via the container (`App::bind(...)`) only when the code under
  test cannot accept the dependency as a parameter.
- Prefer a real test database over a DB mock wherever practical — it catches
  schema and query bugs the mock would hide.
- Reset mocks in `afterEach()` to avoid cross-test leakage.
