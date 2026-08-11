<?php

declare(strict_types=1);

# $KYAULabs: TrackerOperatorContractTest.php kyau@aura.kyaulabs 2026/08/11 -0700 Exp $



#
# Contract test for the @tracker-operator subagent (issue #298, ADR-0052):
# least-privilege gh executor — reads allow, mutations ask, catch-all deny,
# no model/variant in frontmatter (ADR-0022), literal temperature in both
# locations, env/auth deny set (ADR-0047), command-only-safe frontmatter.

use PHPUnit\Framework\Assert;

it('tracker-operator agent file exists with a subagent declaration', function (): void {
    $fm = agent_frontmatter('tracker-operator');

    Assert::assertMatchesRegularExpression('/^mode:\s*subagent\s*$/m', $fm, 'mode must be subagent');
    Assert::assertMatchesRegularExpression('/^temperature:\s*0\.1\s*$/m', $fm, 'frontmatter must declare literal temperature 0.1 (ADR-0022)');
});

it('tracker-operator frontmatter defines no model or variant (ADR-0022)', function (): void {
    $fm = agent_frontmatter('tracker-operator');

    Assert::assertDoesNotMatchRegularExpression('/^model:/m', $fm);
    Assert::assertDoesNotMatchRegularExpression('/^variant:/m', $fm);
});

it('tracker-operator opencode.jsonc entry uses env substitution and literal temperature', function (): void {
    $config = load_opencode_config();
    $entry = $config['agent']['tracker-operator'] ?? null;

    Assert::assertNotNull($entry, 'opencode.jsonc agent section must define tracker-operator');
    Assert::assertStringContainsString('{env:OPENCODE_MODEL_PLANNER}', (string) ($entry['model'] ?? ''));
    Assert::assertStringContainsString('{env:OPENCODE_VARIANT_PLANNER}', (string) ($entry['variant'] ?? ''));
    Assert::assertSame(0.1, $entry['temperature'] ?? null);
});

it('tracker-operator bash rules: catch-all deny first, reads allow, mutations ask', function (): void {
    $rules = agent_bash_rules('tracker-operator');

    $resolve = static fn (string $cmd): string => gh_resolve($cmd, $rules);

    // Catch-all first: an unlisted command falls to deny.
    Assert::assertSame('deny', $resolve('gh pr view 1'));
    Assert::assertSame('deny', $resolve('rm -rf /'));

    // Reads allow.
    Assert::assertSame('allow', $resolve('gh repo view --json nameWithOwner -q .nameWithOwner'));
    Assert::assertSame('allow', $resolve('gh issue view 298 --json title,body'));
    Assert::assertSame('allow', $resolve('gh label list --repo kyaulabs/prism --json name'));
    Assert::assertSame('allow', $resolve('gh auth status'));
    Assert::assertSame('allow', $resolve('gh --version'));

    // Mutations ask (never allow).
    Assert::assertSame('ask', $resolve('gh issue create --repo kyaulabs/prism --title "t" --body-file /tmp/b.md'));
    Assert::assertSame('ask', $resolve('gh issue edit 298 --repo kyaulabs/prism --add-label plan'));
    Assert::assertSame('ask', $resolve('gh issue comment 298 --body-file /tmp/c.md'));
    Assert::assertSame('ask', $resolve('gh label create "plan" --repo kyaulabs/prism --color 0ea5e9'));
    Assert::assertSame('ask', $resolve('gh label edit "plan" --repo kyaulabs/prism --color 4e3cb2'));
    Assert::assertSame('ask', $resolve('gh api graphql -F nodeId="x" -f query="mutation { updateIssue }"'));
    Assert::assertSame('ask', $resolve('gh api "repos/kyaulabs/prism/issues/298/issue-field-values" -X POST -f x=y'));

    // Payload plumbing to /tmp allowed.
    Assert::assertSame('allow', $resolve('cat > /tmp/issue-title.txt <<\'HEREDOC\''));
});

it('tracker-operator frontmatter denies edit, task, web, and carries the env/auth deny set', function (): void {
    $fm = agent_frontmatter('tracker-operator');
    $lower = strtolower($fm);

    Assert::assertMatchesRegularExpression('/^\s*edit:\s*\n\s+"\*":\s*deny/m', $fm);
    Assert::assertMatchesRegularExpression('/^\s*webfetch:\s*deny/m', $fm);
    Assert::assertMatchesRegularExpression('/^\s*websearch:\s*deny/m', $fm);
    Assert::assertMatchesRegularExpression('/^\s*task:\s*deny/m', $fm);
    Assert::assertMatchesRegularExpression('/^\s*question:\s*allow/m', $fm);
    Assert::assertStringContainsString('"*.env": "deny"', $lower);
    Assert::assertStringContainsString('"*.env.*": "deny"', $lower);
    Assert::assertStringContainsString('"*.env.example": "allow"', $lower);
    Assert::assertStringContainsString('"*auth.json*": "deny"', $lower);
    Assert::assertStringContainsString('"*mcp-auth.json*": "deny"', $lower);
});


// vim: ft=php sts=4 sw=4 ts=4 et :
