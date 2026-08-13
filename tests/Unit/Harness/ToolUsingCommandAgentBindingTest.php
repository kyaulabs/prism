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
 *   An optional "the"/"a" article between verb and agent, the Run/Execute
 *   verbs, and digit-bearing agent names are accepted. The anchor excludes
 *   prose like "recommend the user invoke `@consult`" (/router) which does
 *   not dispatch.
 * - web:  backticked `websearch` / `webfetch` references — backticked-only
 *   so prose mentions of the deepseek-websearch MCP server name do not
 *   register as web tool use.
 *
 * @param  string             $body Command body.
 * @return array{0:bool,1:bool,2:bool} [needsBash, needsTask, needsWeb]
 */
function cmd_binding_required_tools(string $body): array
{
    $needsBash = preg_match('/```bash\b/', $body) === 1;
    $needsTask = preg_match('/^\s*(?:[-*]\s+)?(?:Invoke|Dispatch|Use|Call|Delegate|Ask|Run|Execute)(?:\s+(?:the|a))?\s+`@[a-z0-9][a-z0-9-]*`/mi', $body) === 1;
    $needsWeb  = preg_match('/`(?:websearch|webfetch)`/', $body) === 1;

    return [$needsBash, $needsTask, $needsWeb];
}

/**
 * OpenCode's built-in baseline verdict for a tool with no config rule.
 *
 * Verified against the vendored opencode-docs snapshot (permissions.mdx
 * "Defaults": most permissions default to allow; doom_loop and
 * external_directory default to ask) and the installed runtime — the
 * v1.18.17 agent.ts built-in defaults ruleset is
 * {"*": "allow", doom_loop: "ask", external_directory: "ask", ...} and
 * `opencode debug agent build` resolves unspecified tools to allow via
 * that catch-all.
 *
 * @param  string $tool Permission tool name.
 * @return string allow|ask
 */
function cmd_binding_builtin_default(string $tool): string
{
    return in_array($tool, ['doom_loop', 'external_directory'], true) ? 'ask' : 'allow';
}

/**
 * Resolve the effective verdict for one permission tool of one agent.
 *
 * Agent-level override wins; the top-level permission block is the
 * fallback; an absent rule resolves through the verified OpenCode
 * built-in baseline default (see cmd_binding_builtin_default).
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
        return isset($agentBlock['*']) ? (string) $agentBlock['*'] : cmd_binding_builtin_default($tool);
    }

    $global = $config['permission'][$tool] ?? null;

    if (is_string($global)) {
        return $global;
    }

    if (is_array($global)) {
        return isset($global['*']) ? (string) $global['*'] : cmd_binding_builtin_default($tool);
    }

    return cmd_binding_builtin_default($tool);
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
    Assert::assertSame('allow', cmd_binding_verdict($config, 'build', 'task'), 'build agent must permit task dispatch (@semgrep) — resolved through the built-in allow baseline');
});

it('/research binds to an agent that can dispatch @scout and use websearch/webfetch (issue #302)', function (): void {
    $file = __DIR__ . '/../../../.opencode/commands/research.md';
    $frontmatter = cmd_binding_frontmatter($file);
    $config = load_opencode_config();

    Assert::assertSame('build', cmd_binding_field($frontmatter, 'agent'), '/research must declare agent: build');
    Assert::assertSame('true', cmd_binding_field($frontmatter, 'subtask'), '/research must retain subtask: true (child-session isolation)');
    Assert::assertSame('allow', cmd_binding_verdict($config, 'build', 'task'), 'build agent must permit task dispatch (@scout) — resolved through the built-in allow baseline');
    Assert::assertSame('allow', cmd_binding_verdict($config, 'build', 'webfetch'), 'build agent must permit webfetch — resolved through the built-in allow baseline');
    Assert::assertSame('allow', cmd_binding_verdict($config, 'build', 'websearch'), 'build agent must permit websearch — resolved through the built-in allow baseline');
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

it('detector flags reworded dispatch phrasings but not prose (issue #302)', function (): void {
    Assert::assertSame(
        [false, true, false],
        cmd_binding_required_tools('Use the `@explore` agent to walk the codebase.'),
        'an intervening article must not hide a dispatch',
    );
    Assert::assertSame(
        [false, true, false],
        cmd_binding_required_tools('Run `@tdd` to implement the plan.'),
        'the Run verb must be detected as a dispatch',
    );
    Assert::assertSame(
        [false, true, false],
        cmd_binding_required_tools('Call `@test-audit2` to review the change.'),
        'digit-bearing agent names must be detected as a dispatch',
    );
    Assert::assertSame(
        [false, false, false],
        cmd_binding_required_tools('recommend the user invoke `@consult` when routing.'),
        'prose recommendations must not be detected as dispatch',
    );
    Assert::assertSame(
        [false, false, false],
        cmd_binding_required_tools('Ask the user to call `@consult` when routing.'),
        'an article between verb and prose must not create a false dispatch',
    );
});

it('detector matches only backticked web tool references (issue #302)', function (): void {
    Assert::assertSame(
        [false, false, false],
        cmd_binding_required_tools('Enable the deepseek-websearch MCP server only when the API key is present.'),
        'the deepseek-websearch MCP server name is prose, not web tool use',
    );
    Assert::assertSame(
        [false, false, true],
        cmd_binding_required_tools('Use `websearch` to locate the official source.'),
        'a backticked websearch reference must be detected as web tool use',
    );
});

it('verdict reflects the verified OpenCode built-in baseline for unspecified tools (issue #302)', function (): void {
    $config = load_opencode_config();

    Assert::assertSame(
        'allow',
        cmd_binding_verdict($config, 'build', 'task'),
        'unspecified tools resolve to the built-in allow baseline (permissions.mdx Defaults; v1.18.17 agent.ts)',
    );
    Assert::assertSame(
        'allow',
        cmd_binding_verdict($config, 'build', 'webfetch'),
        'unspecified tools resolve to the built-in allow baseline (permissions.mdx Defaults; v1.18.17 agent.ts)',
    );
    Assert::assertSame(
        'allow',
        cmd_binding_verdict($config, 'build', 'websearch'),
        'unspecified tools resolve to the built-in allow baseline (permissions.mdx Defaults; v1.18.17 agent.ts)',
    );
    Assert::assertSame(
        'ask',
        cmd_binding_verdict($config, 'build', 'doom_loop'),
        'doom_loop defaults to ask — the fallback must not answer allow vacuously',
    );
    Assert::assertSame(
        'ask',
        cmd_binding_verdict($config, 'build', 'external_directory'),
        'external_directory defaults to ask — the fallback must not answer allow vacuously',
    );
});





// vim: ft=php sts=4 sw=4 ts=4 et :
