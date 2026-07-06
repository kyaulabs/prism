<?php

# $KYAULabs: JudgeTest.php creator@host YYYY/MM/DD ±TZ Exp $

declare(strict_types=1);

use KYAULabs\Eval\Runner;
use KYAULabs\Eval\EvalCase;

it('builds a judge prompt containing expected behaviors', function () {
    $runner = new Runner('/tmp');
    $case = new EvalCase(
        name: 'test-case',
        description: 'a test',
        agent: '@tdd',
        input: 'Write code',
        expectedBehavior: ['Agent announces skill', 'Agent writes code'],
        passCriteria: 'all behaviors observed',
    );

    $prompt = $runner->buildJudgePrompt($case, 'the agent output');

    expect($prompt)->toContain('test-case');
    expect($prompt)->toContain('Agent announces skill');
    expect($prompt)->toContain('Agent writes code');
    expect($prompt)->toContain('the agent output');
    expect($prompt)->toContain('YES');
    expect($prompt)->toContain('JSON array');
});

it('parses judge JSON response correctly', function () {
    $json = json_encode([
        ['behavior' => 'Agent announces skill', 'verdict' => 'YES', 'rationale' => 'clearly announced'],
        ['behavior' => 'Agent writes code', 'verdict' => 'NO', 'rationale' => 'no code written'],
    ]);

    $behaviors = Runner::parseJudgeResponse($json);

    expect($behaviors)->toHaveCount(2);
    expect($behaviors[0]['verdict'])->toBe('YES');
    expect($behaviors[1]['verdict'])->toBe('NO');
});

it('parses messy judge response with markdown fences', function () {
    $json = "```json\n" . json_encode([
        ['behavior' => 'test', 'verdict' => 'YES', 'rationale' => 'ok'],
    ]) . "\n```";

    $behaviors = Runner::parseJudgeResponse($json);

    expect($behaviors)->toHaveCount(1);
    expect($behaviors[0]['verdict'])->toBe('YES');
});

it('runJudge returns PASS when all behaviors are YES', function () {
    $runner = new Runner('/tmp');
    $case = new EvalCase(
        name: 'test',
        description: 'desc',
        agent: '@tdd',
        input: 'test',
        expectedBehavior: ['do thing'],
        passCriteria: 'all behaviors observed',
    );

    $result = $runner->buildJudgeResult($case, [
        ['behavior' => 'do thing', 'verdict' => 'YES', 'rationale' => 'did it'],
    ], 5000);

    expect($result->verdict)->toBe('PASS');
    expect($result->judgeUsed)->toBeTrue();
});

it('runJudge returns FAIL when any behavior is NO', function () {
    $runner = new Runner('/tmp');
    $case = new EvalCase(
        name: 'test',
        description: 'desc',
        agent: '@tdd',
        input: 'test',
        expectedBehavior: ['do thing', 'do other'],
        passCriteria: 'all behaviors observed',
    );

    $result = $runner->buildJudgeResult($case, [
        ['behavior' => 'do thing', 'verdict' => 'YES', 'rationale' => 'did it'],
        ['behavior' => 'do other', 'verdict' => 'NO', 'rationale' => 'missed'],
    ], 5000);

    expect($result->verdict)->toBe('FAIL');
    expect($result->behaviors[1]['verdict'])->toBe('NO');
});

it('buildJudgeResult returns INVALID when behaviors array is empty', function () {
    $runner = new Runner('/tmp');
    $case = new EvalCase(
        name: 'test',
        description: 'desc',
        agent: '@tdd',
        input: 'test',
        expectedBehavior: ['do thing'],
        passCriteria: 'all behaviors observed',
    );

    $result = $runner->buildJudgeResult($case, [], 5000);

    expect($result->verdict)->toBe('INVALID');
    expect($result->error)->toContain('no behaviors');
    expect($result->judgeUsed)->toBeTrue();
});

it('buildJudgeResult returns INVALID when behavior count mismatches expected', function () {
    $runner = new Runner('/tmp');
    $case = new EvalCase(
        name: 'test',
        description: 'desc',
        agent: '@tdd',
        input: 'test',
        expectedBehavior: ['do thing', 'do other'],
        passCriteria: 'all behaviors observed',
    );

    $result = $runner->buildJudgeResult($case, [
        ['behavior' => 'do thing', 'verdict' => 'YES', 'rationale' => 'did it'],
    ], 5000);

    expect($result->verdict)->toBe('INVALID');
    expect($result->error)->toContain('1 of 2');
    expect($result->judgeUsed)->toBeTrue();
});

it('parseJudgeResponse returns empty array for unparseable non-JSON text', function () {
    $behaviors = Runner::parseJudgeResponse('not json at all');

    expect($behaviors)->toBe([]);

    $runner = new Runner('/tmp');
    $case = new EvalCase(
        name: 'test',
        description: 'desc',
        agent: '@tdd',
        input: 'test',
        expectedBehavior: ['do thing'],
        passCriteria: 'all behaviors observed',
    );

    $result = $runner->buildJudgeResult($case, $behaviors, 5000);

    expect($result->verdict)->toBe('INVALID');
    expect($result->error)->toContain('no behaviors');
});

// vim: ft=php sts=4 sw=4 ts=4 et :
