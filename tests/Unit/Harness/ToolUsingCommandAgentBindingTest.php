<?php

declare(strict_types=1);

# $KYAULabs: ToolUsingCommandAgentBindingTest.php kyau@aura.kyaulabs 2026/08/12 -0700 Exp $








use PHPUnit\Framework\Assert;

/**
 * Harness tests for tool-using command → agent binding (issue #302).
 *
 * Per the vendored OpenCode command documentation (.opencode/skills/
 * opencode-docs/docs/commands.mdx): an omitted `agent` means the command
 * runs in the CURRENT agent, and `subtask: true` only changes the
 * invocation shape (forced subagent session) — it grants no additional
 * permissions. A tool-using command (bash blocks, subagent dispatch,
 * websearch/webfetch) without an explicit `agent` therefore inherits the
 * invoking tab's permissions and fails from Plan (bash/read/web denied)
 * or Chat (bash/task denied).
 */

/**
 * Extract the YAML frontmatter body (between --- delimiters) of a command file.
 *
 * @param  string             $file Absolute path to the command .md file.
 * @return string             The frontmatter without delimiters.
 * @throws RuntimeException   If the file has no frontmatter.
 */
function cmd_binding_frontmatter(string $file): string
{
    $contents = (string) file_get_contents($file);

    if (preg_match('/^---\s*\n(.*?)\n---/s', $contents, $matches) !== 1) {
        throw new RuntimeException("No YAML frontmatter found in: {$file}");
    }

    return $matches[1];
}

/**
 * Read a single-line scalar frontmatter field.
 *
 * @param  string      $frontmatter Frontmatter body without delimiters.
 * @param  string      $field       Field name (e.g. 'agent').
 * @return string|null The field value, or null when absent.
 */
function cmd_binding_field(string $frontmatter, string $field): ?string
{
    if (preg_match('/^' . preg_quote($field, '/') . ':\s*(.+)$/m', $frontmatter, $matches) === 1) {
        return trim($matches[1]);
    }

    return null;
}

/**
 * Return the command template body (everything after the frontmatter).
 *
 * @param  string $file Absolute path to the command .md file.
 * @return string The body.
 */
function cmd_binding_body(string $file): string
{
    $contents = (string) file_get_contents($file);

    return (string) preg_replace('/^---\s*\n.*?\n---\s*\n/s', '', $contents, 1);
}

/**
 * Detect which tool classes a command body requires.
 *
 * - bash: fenced ```bash blocks.
 * - task: a line-anchored dispatch verb followed by a backticked @agent.
 *   The anchor excludes prose like "recommend the user invoke `@consult`"
 *   (/router) which does not dispatch.
 * - web:  websearch / webfetch usage.
 *
 * @param  string             $body Command body.
 * @return array{0:bool,1:bool,2:bool} [needsBash, needsTask, needsWeb]
 */
function cmd_binding_required_tools(string $body): array
{
    $needsBash = preg_match('/```bash\b/', $body) === 1;
    $needsTask = preg_match('/^\s*(?:[-*]\s+)?(?:Invoke|Dispatch|Use|Call|Delegate|Ask)\s+`@[a-z][a-z-]*`/mi', $body) === 1;
    $needsWeb  = preg_match('/\b(?:websearch|webfetch)\b/', $body) === 1;

    return [$needsBash, $needsTask, $needsWeb];
}

/**
 * Resolve the effective verdict for one permission tool of one agent.
 *
 * Agent-level override wins; the top-level permission block is the
 * fallback; an absent rule defaults to allow (OpenCode built-in default).
 *
 * @param  array<string,mixed> $config Decoded opencode.jsonc.
 * @param  string              $agent  Agent name.
 * @param  string              $tool   Permission tool (bash, task, webfetch, websearch).
 * @return string allow|ask|deny
 */
function cmd_binding_verdict(array $config, string $agent, string $tool): string
{
    $agentBlock = $config['agent'][$agent]['permission'][$tool] ?? null;

    if (is_string($agentBlock)) {
        return $agentBlock;
    }

    if (is_array($agentBlock)) {
        return isset($agentBlock['*']) ? (string) $agentBlock['*'] : 'allow';
    }

    $global = $config['permission'][$tool] ?? null;

    if (is_string($global)) {
        return $global;
    }

    if (is_array($global)) {
        return isset($global['*']) ? (string) $global['*'] : 'allow';
    }

    return 'allow';
}

it('command scan is non-vacuous', function (): void {
    $files = glob(__DIR__ . '/../../../.opencode/commands/*.md') ?: [];

    Assert::assertGreaterThanOrEqual(
        10,
        count($files),
        'command scan must find the real .opencode/commands/ directory (>= 10 commands expected)',
    );
});

it('every tool-using command declares an explicit agent that exists (issue #302)', function (): void {
    $config = load_opencode_config();
    $failures = [];

    foreach (glob(__DIR__ . '/../../../.opencode/commands/*.md') ?: [] as $file) {
        $name = basename($file, '.md');
        $frontmatter = cmd_binding_frontmatter($file);
        $agent = cmd_binding_field($frontmatter, 'agent');

        [$needsBash, $needsTask, $needsWeb] = cmd_binding_required_tools(cmd_binding_body($file));

        if (! $needsBash && ! $needsTask && ! $needsWeb) {
            continue; // tool-free commands may run in the current agent (/router)
        }

        if ($agent === null) {
            $failures[] = sprintf(
                "/%s: tool-using command has no agent binding — it inherits the invoking tab's permissions (Plan/Chat deny these tools) — issue #302",
                $name,
            );
            continue;
        }

        if (! isset($config['agent'][$agent])) {
            $failures[] = sprintf(
                "/%s: bound agent '%s' does not exist in the opencode.jsonc agent section",
                $name,
                $agent,
            );
        }
    }

    Assert::assertEmpty($failures, "Command binding violations:\n" . implode("\n", $failures));
});

it('/check binds to the bash-capable build agent while retaining subtask isolation (issue #302)', function (): void {
    $file = __DIR__ . '/../../../.opencode/commands/check.md';
    $frontmatter = cmd_binding_frontmatter($file);

    Assert::assertSame('build', cmd_binding_field($frontmatter, 'agent'), '/check must declare agent: build');
    Assert::assertSame('true', cmd_binding_field($frontmatter, 'subtask'), '/check must retain subtask: true (child-session isolation)');
    Assert::assertSame('allow', cmd_binding_verdict(load_opencode_config(), 'build', 'bash'), 'build agent must permit bash for /check');
});

it('/doctor binds to the bash-capable build agent while retaining subtask isolation (issue #302)', function (): void {
    $file = __DIR__ . '/../../../.opencode/commands/doctor.md';
    $frontmatter = cmd_binding_frontmatter($file);

    Assert::assertSame('build', cmd_binding_field($frontmatter, 'agent'), '/doctor must declare agent: build');
    Assert::assertSame('true', cmd_binding_field($frontmatter, 'subtask'), '/doctor must retain subtask: true (child-session isolation)');
    Assert::assertSame('allow', cmd_binding_verdict(load_opencode_config(), 'build', 'bash'), 'build agent must permit bash for /doctor');
});

it('/security binds to an agent that can dispatch @semgrep and run dependency audits (issue #302)', function (): void {
    $file = __DIR__ . '/../../../.opencode/commands/security.md';
    $frontmatter = cmd_binding_frontmatter($file);
    $config = load_opencode_config();

    Assert::assertSame('build', cmd_binding_field($frontmatter, 'agent'), '/security must declare agent: build');
    Assert::assertSame('true', cmd_binding_field($frontmatter, 'subtask'), '/security must retain subtask: true (child-session isolation)');
    Assert::assertSame('allow', cmd_binding_verdict($config, 'build', 'bash'), 'build agent must permit bash (audit-deps runs composer/npm audit)');
    Assert::assertNotSame('deny', cmd_binding_verdict($config, 'build', 'task'), 'build agent must permit task dispatch (@semgrep)');
});

it('/research binds to an agent that can dispatch @scout and use websearch/webfetch (issue #302)', function (): void {
    $file = __DIR__ . '/../../../.opencode/commands/research.md';
    $frontmatter = cmd_binding_frontmatter($file);
    $config = load_opencode_config();

    Assert::assertSame('build', cmd_binding_field($frontmatter, 'agent'), '/research must declare agent: build');
    Assert::assertSame('true', cmd_binding_field($frontmatter, 'subtask'), '/research must retain subtask: true (child-session isolation)');
    Assert::assertNotSame('deny', cmd_binding_verdict($config, 'build', 'task'), 'build agent must permit task dispatch (@scout)');
    Assert::assertNotSame('deny', cmd_binding_verdict($config, 'build', 'webfetch'), 'build agent must permit webfetch');
    Assert::assertNotSame('deny', cmd_binding_verdict($config, 'build', 'websearch'), 'build agent must permit websearch');
});

it('/router stays unbound because it performs no tool operation (detector must not over-match)', function (): void {
    $file = __DIR__ . '/../../../.opencode/commands/router.md';
    $frontmatter = cmd_binding_frontmatter($file);

    Assert::assertNull(cmd_binding_field($frontmatter, 'agent'), '/router must not declare an agent — it is tool-free and works from every tab');
    Assert::assertSame(
        [false, false, false],
        cmd_binding_required_tools(cmd_binding_body($file)),
        '/router must not be detected as tool-using (guard against an over-matching detector)',
    );
});




// vim: ft=php sts=4 sw=4 ts=4 et :
