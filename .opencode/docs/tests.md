# Good and Bad Tests

## Bootstrap

If `tests/Pest.php` does not exist, run `php vendor/bin/pest --init` before
writing tests. This creates the Pest bootstrap that the arch tests in
`conventions.md` depend on. The `@tdd` agent should run this if it encounters
a repo with no test bootstrap.

---

Examples are Pest/PHP, matching the project stack.

## Good Tests

**Integration-style**: Test through real interfaces, not mocks of internal parts.

```php
// GOOD: Tests observable behavior
it('checks out a valid cart', function () {
    $cart = createCart();
    $cart->add($product);

    $result = checkout($cart, $paymentMethod);

    expect($result->status)->toBe('confirmed');
});
```

Characteristics:

- Tests behavior users/callers care about
- Uses public API only
- Survives internal refactors
- Describes WHAT, not HOW
- One logical assertion per test

## Bad Tests

**Implementation-detail tests**: Coupled to internal structure.

```php
// BAD: Tests implementation details
it('calls payment service during checkout', function () {
    $mockPayment = Mockery::mock(PaymentService::class);
    App::bind(PaymentService::class, fn () => $mockPayment);

    $mockPayment->shouldReceive('process')
        ->once()
        ->with($cart->total);

    checkout($cart, $payment);
});
```

Red flags:

- Mocking internal collaborators
- Testing private methods
- Asserting on call counts/order
- Test breaks when refactoring without behavior change
- Test name describes HOW not WHAT
- Verifying through external means instead of interface

```php
// BAD: Bypasses interface to verify
it('saves the user to the database', function () {
    createUser(['name' => 'Alice']);

    $row = $db->query('SELECT * FROM users WHERE name = ?', ['Alice']);

    expect($row)->not->toBeNull();
});

// GOOD: Verifies through interface
it('makes a created user retrievable', function () {
    $user = createUser(['name' => 'Alice']);
    $retrieved = getUser($user->id);

    expect($retrieved->name)->toBe('Alice');
});
```

**Tautological tests**: Expected value restates the implementation, so the test passes by construction.

```php
// BAD: Expected value is recomputed the way the code computes it
it('sums line items into the total', function () {
    $items = collect([['price' => 10], ['price' => 5]]);
    $expected = $items->sum('price');

    expect(calculateTotal($items))->toBe($expected);
});

// GOOD: Expected value is an independent, known literal
it('sums line items into the total', function () {
    $items = collect([['price' => 10], ['price' => 5]]);

    expect(calculateTotal($items))->toBe(15);
});
```
