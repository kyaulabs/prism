<?php

declare(strict_types=1);

# $KYAULabs: ImproveArchitectureCommandTest.php kyau@aura.kyaulabs 2026/08/11 -0700 Exp $








use PHPUnit\Framework\Assert;

it('hands selected architecture candidates to Design instead of loading brainstorming', function (): void {
    $path = __DIR__ . '/../../../.opencode/commands/improve-architecture.md';
    Assert::assertFileExists($path);
    $command = (string) file_get_contents($path);

    Assert::assertMatchesRegularExpression('/^agent:\s*build$/m', $command);
    Assert::assertStringContainsString('switch to the **design** tab', $command);
    Assert::assertMatchesRegularExpression('/selected candidate,\s+its concise/is', $command);
    Assert::assertStringNotContainsString('load the `brainstorming` skill', $command);
});



// vim: ft=php sts=4 sw=4 ts=4 et :
