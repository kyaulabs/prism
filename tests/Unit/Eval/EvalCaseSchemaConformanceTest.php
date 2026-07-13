<?php

declare(strict_types=1);

# $KYAULabs: EvalCaseSchemaConformanceTest.php kyau@nova 2026/07/12 -0700 Exp $









use Opis\JsonSchema\Validator;

describe('eval case schema conformance', function () {
    $schemaPath = __DIR__ . '/../../../.opencode/evals/schema.json';
    $smokeDir   = __DIR__ . '/../../../.opencode/evals/smoke';
    $schemaId   = 'https://kyaulabs.com/evals/schema.json';

    $buildValidator = function () use ($schemaPath): Validator {
        $v = new Validator();
        $v->resolver()->registerRaw(
            json_decode((string) file_get_contents($schemaPath), false)
        );
        return $v;
    };

    it('loads schema.json as a valid draft 2020-12 schema', function () use ($schemaPath) {
        $schema = json_decode((string) file_get_contents($schemaPath), false);

        expect($schema)->toBeObject()
            ->and($schema->{'$schema'} ?? null)->toBe('https://json-schema.org/draft/2020-12/schema');
    });

    it('validates each smoke case against schema.json', function (string $file) use ($buildValidator, $schemaId) {
        $data   = json_decode((string) file_get_contents($file), false);
        $result = $buildValidator()->validate($data, $schemaId);

        expect($result->isValid())
            ->toBeTrue(basename($file) . ' should conform; errors: ' . ($result->error() ? $result->error()->message() : ''));
    })->with(function () use ($smokeDir) {
        $files = glob($smokeDir . '/*.json');
        expect($files)->not->toBeEmpty('no smoke files found');

        return array_map(fn ($f) => [$f], $files);
    });

    it('rejects expected_string when pass_criteria is not a string match', function () use ($buildValidator, $schemaId) {
        $case = (object) [
            'name' => 'reverse-mismatch',
            'description' => 'x',
            'agent' => '@tdd',
            'input' => 'x',
            'expected_behavior' => ['an observable behavior'],
            'pass_criteria' => 'exit code zero',
            'expected_string' => 'should not be here',
        ];
        $result = $buildValidator()->validate($case, $schemaId);

        expect($result->isValid())->toBeFalse();
    });

    it('rejects a deliberately invalid case (negative control)', function () use ($buildValidator, $schemaId) {
        $bad = (object) [
            'name' => 'Bad_Name',          // violates kebab pattern
            'description' => 'x',
            'agent' => 'Bad Agent',        // violates pattern
            'input' => 'x',
            'expected_behavior' => [123],  // non-string item
            'pass_criteria' => 'bogus',    // not in enum
        ];
        $result = $buildValidator()->validate($bad, $schemaId);

        expect($result->isValid())->toBeFalse();
    });
});



// vim: ft=php sts=4 sw=4 ts=4 et :
