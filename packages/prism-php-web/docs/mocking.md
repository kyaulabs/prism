# Mocking system boundaries

Mock only when a test crosses a system boundary that is slow, nondeterministic,
unavailable, or unsafe to exercise directly.

Suitable boundaries include:

- external payment, mail, or HTTP services;
- time and randomness;
- the filesystem when a real temporary directory would obscure the behavior;
- a database only when a disposable test database is impractical.

Do not mock classes or modules owned by the application, private methods, or
internal collaborators. Such mocks bind tests to the current implementation and
make safe refactoring harder.

## Prefer a real local boundary

Use a real test database, temporary directory, or in-process parser when it is
fast and isolated. A real boundary catches schema, query, encoding, and
serialization failures that a mock would reproduce only if the test author
already knew about them.

Fixtures must be minimal, deterministic, credential-free, and created by the
test. Do not copy production data into a fixture.

## Inject external dependencies

Pass the boundary into the behavior rather than creating it inside the
function:

```php
function processPayment(
    Order $order,
    PaymentClient $payments,
): PaymentResult {
    return $payments->charge($order->total());
}
```

A function that reads credentials and constructs an external client internally
mixes policy with transport and is harder to test. Move that construction to
the composition boundary.

## Use narrow SDK-style interfaces

Give each external operation a typed method:

```php
interface OrderGateway
{
    public function findOrder(int $id): ?Order;

    /** @return list<Order> */
    public function findOrdersForUser(int $userId): array;

    public function createOrder(NewOrder $order): Order;
}
```

Avoid a generic `fetch(string $endpoint, array $options): mixed` interface. It
moves routing logic into test setup, weakens return types, and makes each test
reimplement the remote protocol.

## Pest and Mockery example

Mock the boundary interface, then assert the public result:

```php
it('confirms an accepted payment', function () {
    $payments = Mockery::mock(PaymentClient::class);
    $payments->shouldReceive('charge')
        ->once()
        ->andReturn(new PaymentResult('accepted'));

    $result = processPayment(anOrder(total: 1250), $payments);

    expect($result->status)->toBe('accepted');
});
```

The call expectation describes the external contract. Do not add expectations
for internal helper calls or construction order.

Use `Mockery::mock(InterfaceName::class)`, not a concrete application class.
Inject the mock as a parameter or constructor dependency. Bind it through a
project composition mechanism only when the public seam cannot accept the
dependency directly.

Reset shared Mockery state in `afterEach()` when project bootstrap does not
already do so. Keep one mock behavior per scenario; conditional mock callbacks
usually indicate that the boundary interface is too broad.

## Review questions

Before keeping a mock, ask:

1. Is this dependency outside the application's control?
2. Would a real local implementation be clearer and fast enough?
3. Is the interface narrow and typed for one external capability?
4. Does the assertion describe caller-visible behavior?
5. Would an internal refactor leave the test unchanged?

If any answer is no, redesign the seam or use a real boundary.
