# PHP/web test design

Write tests against behavior visible through a public seam. A good test fails
for the missing behavior, survives an internal refactor, and uses an expected
value derived independently of the implementation.

## Pest bootstrap

If `tests/Pest.php` is absent, run:

```bash
prism-tool run pest -- --init
```

The generated file is stock Pest scaffolding. Create
`tests/Unit/Harness/ArchTest.php` separately with the filesystem-walker checks
from [PHP/web coding conventions](conventions.md). Do not append Pest
architecture blocks to `tests/Pest.php`; they do not scan procedural source.

Use PHPUnit's default test case unless the project already defines a shared
`Tests\TestCase`. Bind a custom case only to directories that need it.

## Behavior-first tests

Test through the same interface a caller uses:

```php
it('makes a created user retrievable', function () {
    $created = createUser(['name' => 'Alice']);

    $retrieved = getUser($created->id);

    expect($retrieved->name)->toBe('Alice');
});
```

Good tests:

- name one observable behavior;
- arrange only the state needed by that behavior;
- act through a public function, method, HTTP route, or command;
- assert an independent result or state transition;
- cover success, rejection, boundary, and failure cases;
- remain deterministic and isolated.

Use `describe()` for one behavior surface, `it()` for one scenario, and Pest
datasets when the same rule must hold for several inputs.

## Implementation coupling

Do not test private methods, internal call order, helper invocation counts, or
concrete collaborator construction. These assertions can fail while public
behavior remains correct.

A boundary mock may assert the outbound external contract, but the test should
still assert the public result:

```php
it('rejects a declined payment', function () {
    $payments = Mockery::mock(PaymentClient::class);
    $payments->shouldReceive('charge')
        ->once()
        ->andReturn(new PaymentResult('declined'));

    $result = checkout(aCart(), $payments);

    expect($result->status)->toBe('payment-declined');
});
```

Read [Mocking system boundaries](mocking.md) before adding a mock.

## Independent expectations

Do not recompute the expected value with the same operations as production
code:

```php
it('sums line items', function () {
    $items = [['price' => 10], ['price' => 5]];

    expect(calculateTotal($items))->toBe(15);
});
```

A tautological test that calls the same collection sum in both production and
expectation can preserve the same defect on both sides.

## Fixtures and data

Keep fixtures small and specific to the behavior. Build them through named test
helpers or fixture files when that improves readability. Do not use production
exports, personal data, credentials, wall-clock time, or shared mutable state.

Prefer a disposable real database for query behavior. Reset database and file
state between tests. Use fixed times and random seeds when the behavior depends
on them.

## Test layers

- Unit tests cover pure policy and value behavior.
- Feature tests cover one application-facing behavior through its public seam.
- Integration tests cover SQL, filesystem, process, or external adapter
  boundaries.
- Browser tests are reserved for critical user flows that cannot be proven more
  cheaply below the browser.
- Visual review is not a functional browser test; it inspects rendered evidence
  after Green.

## Red, Green, and full verification

During TDD, run the narrow Pest path or filter through `prism-tool`, first to
confirm Red and then Green. Before completion, run the full applicable suite and
the shared `/check` gate.

Coverage uses the adapter-owned command:

```bash
PEST_BROWSER_BASE_URL="http://localhost:8080" prism-tool run pest -- --coverage
```

The changed-file gate reads `tests/coverage.xml` and requires at least 80% line
coverage on each changed PHP file in the coverage source set. Coverage does not
replace assertions: uncovered behavior needs a test, while unreachable
defensive code needs an explicit, justified exclusion.

`/check` runs Core policy first and delegates to `/check-php` for php-cs-fixer,
stylelint, ESLint, Pest coverage, and the changed-file coverage gate.
