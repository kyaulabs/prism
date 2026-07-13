<?php

declare(strict_types=1);

# $KYAULabs: EvalCaseSchemaParityTest.php kyau@nova 2026/07/12 -0700 Exp $











use KYAULabs\Eval\EvalCase;
use Opis\JsonSchema\Validator;

describe('EvalCase::validate() parity with schema.json', function () {
    $schemaPath = __DIR__ . '/../../../.opencode/evals/schema.json';
    $schemaId   = 'https://kyaulabs.com/evals/schema.json';

    // A known-valid baseline. Each matrix entry overrides fields; null = unset.
    $baseline = [
        'name' => 'parity-baseline',
        'description' => 'baseline case',
        'agent' => '@tdd',
        'input' => 'do the thing',
        'expected_behavior' => ['one observable behavior'],
        'pass_criteria' => 'all behaviors observed',
        'tags' => ['smoke'],
    ];

    $matrix = [
        'valid baseline'                                    => [[], true],
        'bad name pattern'                                  => [['name' => 'Bad_Name'], false],
        'name with space'                                   => [['name' => 'has space'], false],
        'bad agent pattern'                                 => [['agent' => 'Bad Agent'], false],
        'valid @-prefixed agent'                            => [['agent' => '@tdd'], true],
        'valid bare agent'                                  => [['agent' => 'brainstorming'], true],
        'expected_behavior non-string item'                 => [['expected_behavior' => [123, 'ok']], false],
        'expected_behavior empty array'                     => [['expected_behavior' => []], false],
        'tags non-string item'                              => [['tags' => ['ok', 5]], false],
        'tags valid strings'                                => [['tags' => ['a', 'b']], true],
        'bad pass_criteria enum'                            => [['pass_criteria' => 'bogus'], false],
        'expected_string required for string match'         => [['pass_criteria' => 'output contains expected string'], false],
        'expected_string present with string match'         => [['pass_criteria' => 'output contains expected string', 'expected_string' => 'hit'], true],
        'reverse mismatch: expected_string with wrong crit' => [['pass_criteria' => 'exit code zero', 'expected_string' => 'x'], false],
        'reverse mismatch: empty expected_string, wrong crit' => [['pass_criteria' => 'exit code zero', 'expected_string' => ''], false],
        'missing required input'                            => [['input' => null], false],
        'all behaviors observed (no expected_string)'       => [[], true],
    ];

    foreach ($matrix as $label => [$overrides, $expectValid]) {
        it("agrees on: {$label}", function () use ($baseline, $overrides, $expectValid, $schemaPath, $schemaId, $label) {
            $data = $baseline;

            foreach ($overrides as $k => $v) {
                if ($v === null) {
                    unset($data[$k]);
                } else {
                    $data[$k] = $v;
                }
            }

            // --- opis (schema.json) ---
            $v = new Validator();
            $v->resolver()->registerRaw(
                json_decode((string) file_get_contents($schemaPath), false),
            );
            $schemaValid = $v->validate((object) $data, $schemaId)->isValid();

            // --- validate() (hand-rolled) via the real parse path ---
            $tmp = tempnam(sys_get_temp_dir(), 'eval_parity_') . '.json';
            file_put_contents($tmp, json_encode($data, JSON_PRETTY_PRINT));
            $case = EvalCase::fromFile($tmp);
            unlink($tmp);
            $validateValid = $case->validate() === [];

            expect($schemaValid)->toBe($expectValid, "schema.json disagrees for: {$label}");
            expect($validateValid)->toBe($expectValid, "validate() disagrees for: {$label}");
        });
    }
});


// vim: ft=php sts=4 sw=4 ts=4 et :
