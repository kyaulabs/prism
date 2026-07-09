<?php

# $KYAULabs: EvalRunner.php kyau@akira.kyaulabs 2026/07/09 -0700 Exp $


declare(strict_types=1);

# $KYAULabs: EvalRunner.php kyau@nova 2026/07/05 -0700 Exp $

namespace KYAULabs\Eval;

/**
 * Parsed eval case from a JSON file.
 */
class EvalCase
{
    /**
     * @param string[] $expectedBehavior
     * @param ?string  $expectedString   Required when passCriteria is 'output contains expected string'.
     */
    public function __construct(
        public readonly string $name,
        public readonly string $description,
        public readonly string $agent,
        public readonly string $input,
        public readonly array $expectedBehavior,
        public readonly string $passCriteria,
        public readonly array $tags = [],
        public readonly ?string $expectedString = null,
    ) {
    }

    /**
     * Parse an eval case from a JSON file.
     *
     * @param  string $path  Path to the JSON case file.
     * @return self
     * @throws \RuntimeException  If the file cannot be read or decoded.
     */
    public static function fromFile(string $path): self
    {
        $contents = file_get_contents($path);
        if ($contents === false) {
            throw new \RuntimeException("Cannot read eval case file: {$path}");
        }

        $data = json_decode($contents, true);
        if (!is_array($data)) {
            throw new \RuntimeException("Invalid JSON in eval case file: {$path}");
        }

        return new self(
            name: $data['name'] ?? '',
            description: $data['description'] ?? '',
            agent: $data['agent'] ?? '',
            input: $data['input'] ?? '',
            expectedBehavior: $data['expected_behavior'] ?? [],
            passCriteria: $data['pass_criteria'] ?? '',
            tags: $data['tags'] ?? [],
            expectedString: $data['expected_string'] ?? null,
        );
    }

    /**
     * Validate this case against the schema. Returns an array of error
     * messages; empty array means valid.
     *
     * @return string[]
     */
    public function validate(): array
    {
        $errors = [];
        $required = ['name', 'description', 'agent', 'input', 'expected_behavior', 'pass_criteria'];

        foreach ($required as $field) {
            $value = match ($field) {
                'name' => $this->name,
                'description' => $this->description,
                'agent' => $this->agent,
                'input' => $this->input,
                'expected_behavior' => $this->expectedBehavior,
                'pass_criteria' => $this->passCriteria,
            };

            if ($field === 'expected_behavior') {
                if (empty($value)) {
                    $errors[] = "required field 'expected_behavior' is empty";
                }
            } elseif ($value === '') {
                $errors[] = "required field '{$field}' is empty";
            }
        }

        $validCriteria = [
            'all behaviors observed',
            'no errors in output',
            'exit code zero',
            'output contains expected string',
            'manual inspection required',
        ];

        if (!in_array($this->passCriteria, $validCriteria, true)) {
            $errors[] = "pass_criteria '{$this->passCriteria}' is not a valid value";
        }

        if ($this->passCriteria === 'output contains expected string'
            && ($this->expectedString === null || $this->expectedString === '')) {
            $errors[] = "expected_string is required when pass_criteria is 'output contains expected string'";
        }

        if ($this->expectedString !== null && $this->expectedString !== ''
            && $this->passCriteria !== 'output contains expected string') {
            $errors[] = "expected_string is set but pass_criteria is '{$this->passCriteria}' (did you mean 'output contains expected string'?)";
        }

        return $errors;
    }
}

/**
 * Result of running a single eval case.
 */
class EvalResult
{
    /** @param array<int, array{behavior: string, verdict: string, rationale: string}> $behaviors */
    /** @param array<string, array<string, mixed>> $deterministicChecks */
    /** @param bool $degradedKill True when a timeout occurred without process-group isolation (no setsid). */
    public function __construct(
        public string $name,
        public string $agent,
        public string $passCriteria,
        public string $verdict,
        public array $behaviors = [],
        public array $deterministicChecks = [],
        public int $durationMs = 0,
        public bool $judgeUsed = false,
        public ?string $error = null,
        public bool $degradedKill = false,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'name' => $this->name,
            'agent' => $this->agent,
            'pass_criteria' => $this->passCriteria,
            'verdict' => $this->verdict,
            'behaviors' => $this->behaviors,
            'deterministic_checks' => $this->deterministicChecks,
            'duration_ms' => $this->durationMs,
            'judge_used' => $this->judgeUsed,
            'error' => $this->error,
            'degraded_kill' => $this->degradedKill,
        ];
    }

    /**
     * Return true if this result represents a pass.
     *
     * @return bool
     */
    public function isPass(): bool
    {
        return $this->verdict === 'PASS';
    }

    /**
     * Return true if this result represents a failure (FAIL, TIMEOUT, or INVALID).
     *
     * @return bool
     */
    public function isFail(): bool
    {
        return in_array($this->verdict, ['FAIL', 'TIMEOUT', 'INVALID'], true);
    }
}

/**
 * Runs a single eval case through opencode run.
 */
class Runner
{
    private string $repoRoot;

    /** @var bool|null Cached result of probing for the setsid(1) binary. */
    private ?bool $hasSetSid = null;

    /**
     * Error-severity prefixes that the 'no errors in output' criterion treats
     * as a genuine fault. Matches at the start of any stderr line
     * (case-insensitive, multiline). Benign chatter — warnings, progress,
     * deprecation notices — does not match and does not fail the criterion.
     */
    private const ERROR_SEVERITY_PATTERN =
        '/^(?:'
        . 'Fatal error|Parse error|Compile error|Core error|'
        . 'Uncaught|'
        . 'Error:|TypeError:|ArgumentCountError:|ArithmeticError:|DivisionByZeroError:|'
        . 'ReferenceError:|SyntaxError:|RangeError:|EvalError:|URIError:|'
        . 'Unhandled (?:promise rejection|exception)|'
        . 'UnhandledPromiseRejection|'
        . 'Segmentation fault|core dumped'
        . ')/im';

    public function __construct(
        string $repoRoot,
        private int $timeout = 120,
    ) {
        $this->repoRoot = realpath($repoRoot) ?: $repoRoot;
    }

    /**
     * Build the opencode run command for a case (dry-run mode).
     *
     * @param  EvalCase $case
     * @param  string|null $dir  Optional directory override (e.g. worktree path).
     * @return string  Shell command string.
     */
    public function buildCommand(EvalCase $case, ?string $dir = null): string
    {
        $agent = escapeshellarg(ltrim($case->agent, '@'));
        $message = escapeshellarg($case->input);
        $dir = escapeshellarg($dir ?? $this->repoRoot);

        return "opencode run --agent {$agent} --dir {$dir} {$message}";
    }

    /**
     * Build the opencode run command for the LLM judge pass.
     *
     * @param  EvalCase $case
     * @param  string $agentOutput  The agent's captured stdout+stderr.
     * @return string  Shell command string.
     */
    public function buildJudgeCommand(EvalCase $case, string $agentOutput): string
    {
        $prompt = $this->buildJudgePrompt($case, $agentOutput);
        $message = escapeshellarg($prompt);
        $dir = escapeshellarg($this->repoRoot);

        return "opencode run --agent judge --dir {$dir} {$message}";
    }

    /**
     * Parse CLI arguments for run-eval.php.
     *
     * @param  array<int, string> $argv
     * @return array{caseFile: string, timeout: int, dryRun: bool}
     */
    public static function parseArgs(array $argv): array
    {
        $caseFile = '';
        $timeout = 120;
        $dryRun = false;

        for ($i = 1; $i < count($argv); $i++) {
            if ($argv[$i] === '--timeout' && isset($argv[$i + 1])) {
                $timeout = (int) $argv[++$i];
            } elseif ($argv[$i] === '--dry-run') {
                $dryRun = true;
            } elseif (!str_starts_with($argv[$i], '--')) {
                $caseFile = $argv[$i];
            }
        }

        return ['caseFile' => $caseFile, 'timeout' => $timeout, 'dryRun' => $dryRun];
    }

    /**
     * Compute the suite exit code from per-verdict counts.
     *
     * 0 — all pass (mixed pass+skip with no failures is still 0).
     * 1 — any FAIL/TIMEOUT/INVALID, or any SKIPPED when $failOnSkip is set.
     * 2 — every case SKIPPED (silent-suite guard); $failOnSkip promotes to 1.
     *
     * @param int  $pass
     * @param int  $fail
     * @param int  $timeout
     * @param int  $skip
     * @param int  $invalid
     * @param bool $failOnSkip
     * @return int
     */
    public static function computeSuiteExitCode(
        int $pass,
        int $fail,
        int $timeout,
        int $skip,
        int $invalid,
        bool $failOnSkip,
    ): int {
        $total = $pass + $fail + $timeout + $skip + $invalid;

        if ($fail > 0 || $timeout > 0 || $invalid > 0) {
            return 1;
        }

        if ($failOnSkip && $skip > 0) {
            return 1;
        }

        if ($total > 0 && $skip === $total) {
            return 2;
        }

        return 0;
    }

    /**
     * Probe once for the setsid(1) binary and cache the result.
     *
     * macOS and some BSDs do not ship setsid(1); on those platforms
     * executeCommand() runs commands unprefixed and killProcessTree()
     * uses a best-effort fallback (no process-group tree-kill).
     *
     * @return bool
     */
    protected function hasSetSid(): bool
    {
        if ($this->hasSetSid !== null) {
            return $this->hasSetSid;
        }

        if (DIRECTORY_SEPARATOR === '\\') {
            return $this->hasSetSid = false;
        }

        return $this->hasSetSid = $this->isBinaryOnPath('setsid');
    }

    /**
     * Execute a shell command and capture stdout, stderr, and exit code.
     *
     * Uses non-blocking pipes to interleave reads on stdout and stderr,
     * avoiding pipe-buffer deadlocks, and enforces the wall-clock
     * $timeout via proc_terminate. A cross-platform polling loop with
     * stream_select is used to wait for pipe data.
     *
     * @param  string $cmd  Shell command to execute.
     * @param  int $timeout  Timeout in seconds.
     * @return array{stdout: string, stderr: string, exitCode: int, timed_out: bool, degraded_kill: bool}
     */
    public function executeCommand(string $cmd, int $timeout): array
    {
        // On POSIX with setsid(1), launch via exec setsid so the process
        // runs in its own process group. The PID from proc_get_status then
        // identifies the group, enabling posix_kill(-$pid, SIGKILL) to
        // tree-kill on timeout. macOS/BSD lack setsid(1): run unprefixed
        // and fall back to a best-effort kill in killProcessTree().
        // --wait: forces fork+wait on Linux where setsid forks by default.
        if ($this->hasSetSid()) {
            $cmd = PHP_OS_FAMILY === 'Linux'
                ? 'exec setsid --wait ' . $cmd
                : 'exec setsid ' . $cmd;
        }

        $descriptors = [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];

        $process = proc_open($cmd, $descriptors, $pipes);
        if (!is_resource($process)) {
            return ['stdout' => '', 'stderr' => "Failed to start process: {$cmd}", 'exitCode' => -1, 'timed_out' => false, 'degraded_kill' => false];
        }

        fclose($pipes[0]);

        stream_set_blocking($pipes[1], false);
        stream_set_blocking($pipes[2], false);

        $status = proc_get_status($process);
        $pid = $status['pid'];

        return $this->readPipes($process, $pipes, $timeout, $pid);
    }

    /**
     * Read stdout and stderr pipes until both EOF or timeout expires.
     *
     * Uses stream_select to wait for pipe data without blocking,
     * interleaving reads on stdout and stderr to avoid pipe-buffer
     * deadlock. Enforces a wall-clock timeout — on Windows via
     * taskkill /t /f, on POSIX via posix_kill(-$pid, SIGKILL) against
     * the process group (set up by exec setsid in executeCommand).
     *
     * @param  resource $process
     * @param  array{0: resource, 1: resource, 2: resource} $pipes
     * @param  int $timeout  Timeout in seconds.
     * @param  int $pid  Process group leader PID for tree-kill.
     * @return array{stdout: string, stderr: string, exitCode: int, timed_out: bool, degraded_kill: bool}
     */
    private function readPipes($process, array $pipes, int $timeout, int $pid): array
    {
        $stdout = '';
        $stderr = '';
        $timedOut = false;
        $startNs = hrtime(true);
        $timeoutNs = $timeout * 1_000_000_000;

        while (true) {
            $read = [];
            $write = [];
            $except = [];
            if (!feof($pipes[1])) {
                $read[] = $pipes[1];
            }
            if (!feof($pipes[2])) {
                $read[] = $pipes[2];
            }

            if (empty($read)) {
                break;
            }

            $elapsedNs = hrtime(true) - $startNs;
            $remainingNs = $timeoutNs - $elapsedNs;

            if ($remainingNs <= 0) {
                $timedOut = true;
                break;
            }

            $remainingSec = (int) ($remainingNs / 1_000_000_000);
            $remainingUsec = (int) (($remainingNs % 1_000_000_000) / 1000);

            $ready = @stream_select($read, $write, $except, $remainingSec, $remainingUsec);

            if ($ready === false) {
                $timedOut = true;
                break;
            }

            if ($ready === 0) {
                $timedOut = true;
                break;
            }

            foreach ($read as $pipe) {
                $chunk = fread($pipe, 8192);
                if ($chunk === false || $chunk === '') {
                    continue;
                }
                if ($pipe === $pipes[1]) {
                    $stdout .= $chunk;
                } elseif ($pipe === $pipes[2]) {
                    $stderr .= $chunk;
                }
            }
        }

        if ($timedOut) {
            $this->killProcessTree($process, $pid);
            $stdout .= (string) stream_get_contents($pipes[1]);
            $stderr .= (string) stream_get_contents($pipes[2]);
        }

        fclose($pipes[1]);
        fclose($pipes[2]);

        $exitCode = proc_close($process);

        $degradedKill = $timedOut && (!$this->hasSetSid() || !function_exists('posix_kill'));

        return [
            'stdout'        => trim($stdout),
            'stderr'        => trim($stderr),
            'exitCode'      => $exitCode,
            'timed_out'     => $timedOut,
            'degraded_kill' => $degradedKill,
        ];
    }

    /**
     * Kill a process and its entire child tree.
     *
     * On Windows, proc_terminate only signals the shell wrapper (cmd.exe)
     * but not child processes. taskkill /t ensures the full tree is
     * terminated so stream_get_contents does not block.
     *
     * On POSIX with setsid, the process runs in its own process group,
     * so posix_kill(-$pid, SIGKILL) kills the entire group.
     *
     * On POSIX without setsid (macOS/BSD) or without the posix extension,
     * walks the full descendant tree via pgrep -P and kills each process
     * individually, then terminates the parent. This handles the extra
     * shell layer proc_open introduces (string commands run via sh -c),
     * which can place the workload at grandchild depth.
     *
     * @param resource $process
     * @param int $pid    Process group leader PID (equal to PGID via setsid).
     * @return void
     */
    private function killProcessTree($process, int $pid): void
    {
        if (DIRECTORY_SEPARATOR === '\\') {
            exec("taskkill /f /t /pid {$pid} 2>NUL");
            proc_terminate($process, 9);
        } elseif ($this->hasSetSid() && function_exists('posix_kill')) {
            // Negative PID: kill the entire process group (setsid'd).
            // SIGKILL comes from PCNTL extension; fall back to integer 9
            // when only posix (not pcntl) is available.
            posix_kill(-$pid, defined('SIGKILL') ? SIGKILL : 9);
        } else {
            // No setsid (macOS/BSD) or no posix extension: the process is
            // not a group leader, so posix_kill(-$pid) would signal the
            // wrong group. Walk the full descendant tree and kill each
            // process individually, then terminate the parent. The walk
            // handles the extra shell layer proc_open introduces on Unix
            // (string commands run via sh -c), which can place the workload
            // at grandchild depth — invisible to a flat pkill -P.
            foreach ($this->collectDescendantPids($pid) as $descPid) {
                if (function_exists('posix_kill')) {
                    posix_kill($descPid, defined('SIGKILL') ? SIGKILL : 9);
                } else {
                    exec('kill -9 ' . escapeshellarg((string) $descPid) . ' 2>/dev/null');
                }
            }
            proc_terminate($process, 9);
        }
    }

    /**
     * Recursively collect all descendant PIDs of $rootPid via pgrep -P.
     *
     * Walks the process tree breadth-first so children are discovered
     * while their parents are still alive (and thus still listed as
     * PPID by pgrep). Returns PIDs in discovery order (siblings before
     * nieces), excluding $rootPid itself.
     *
     * @param int $rootPid  PID whose descendants to collect.
     * @return list<int>    Descendant PIDs, excluding $rootPid.
     */
    private function collectDescendantPids(int $rootPid): array
    {
        $pids = [];
        $queue = [$rootPid];
        while ($queue !== []) {
            $parent = array_shift($queue);
            exec('pgrep -P ' . escapeshellarg((string) $parent) . ' 2>/dev/null', $children);
            foreach ($children as $child) {
                $child = (int) trim($child);
                if ($child > 0 && !in_array($child, $pids, true)) {
                    $pids[] = $child;
                    $queue[] = $child;
                }
            }
        }
        return $pids;
    }

    /**
     * Return true if $stderr contains any error-severity line.
     *
     * @param  string $stderr
     * @return bool
     */
    private function detectErrorSeverity(string $stderr): bool
    {
        return (bool) preg_match(self::ERROR_SEVERITY_PATTERN, $stderr);
    }

    /**
     * Check if the pass criteria can be resolved deterministically (no LLM judge).
     *
     * Returns an EvalResult if the criteria can be resolved, or null if an
     * LLM judge is required.
     *
     * @param  EvalCase $case
     * @param  string $stdout   Captured stdout from the agent run.
     * @param  string $stderr   Captured stderr from the agent run.
     * @param  int $exitCode    Exit code from the agent run.
     * @return EvalResult|null
     */
    public function checkDeterministic(
        EvalCase $case,
        string $stdout,
        string $stderr,
        int $exitCode,
    ): ?EvalResult {
        $checks = [];

        switch ($case->passCriteria) {
            case 'exit code zero':
                $pass = $exitCode === 0;
                $checks['exit_code'] = ['expected' => 0, 'actual' => $exitCode, 'pass' => $pass];
                $verdict = $pass ? 'PASS' : 'FAIL';
                break;

            case 'no errors in output':
                $matched = $this->detectErrorSeverity($stderr);
                $checks['stderr_severity'] = ['pass' => !$matched, 'matched' => $matched];
                $verdict = $matched ? 'FAIL' : 'PASS';
                break;

            case 'output contains expected string':
                if ($case->expectedString === null || $case->expectedString === '') {
                    $checks['expected_string'] = ['needle' => '', 'found' => false, 'pass' => false];
                    $verdict = 'FAIL';
                } else {
                    $found = str_contains($stdout, $case->expectedString);
                    $checks['expected_string'] = [
                        'needle' => $case->expectedString,
                        'found' => $found,
                        'pass' => $found,
                    ];
                    $verdict = $found ? 'PASS' : 'FAIL';
                }
                break;

            case 'manual inspection required':
                $verdict = 'UNDETERMINED';
                break;

            default:
                return null;
        }

        return new EvalResult(
            name: $case->name,
            agent: $case->agent,
            passCriteria: $case->passCriteria,
            verdict: $verdict,
            deterministicChecks: $checks,
            judgeUsed: false,
        );
    }
    /**
     * Build the prompt for the LLM judge.
     *
     * @param  EvalCase $case
     * @param  string $agentOutput  Captured stdout + stderr from the agent run.
     * @return string
     */
    public function buildJudgePrompt(EvalCase $case, string $agentOutput): string
    {
        $behaviors = '';
        foreach ($case->expectedBehavior as $i => $behavior) {
            $n = $i + 1;
            $behaviors .= "{$n}. {$behavior}\n";
        }

        return <<<PROMPT
You are evaluating whether an AI agent's output satisfies expected behaviors.
Below is the eval case and the agent's full output. For each expected behavior,
answer YES if the output demonstrates it, NO if it does not, or UNCLEAR if
you cannot determine. Provide a one-sentence rationale per answer.

Eval case: {$case->name}
Description: {$case->description}

Expected behaviors:
{$behaviors}
Agent output:
---
{$agentOutput}
---

Respond with ONLY a valid JSON array. No prose, no markdown fences.
[{"behavior": "<exact text>", "verdict": "YES|NO|UNCLEAR", "rationale": "<one sentence>"}, ...]
PROMPT;
    }

    /**
     * Parse the judge's JSON response into a behaviors array.
     *
     * @param  string $response  Raw response from the judge (may include markdown fences).
     * @return array<int, array{behavior: string, verdict: string, rationale: string}>
     */
    public static function parseJudgeResponse(string $response): array
    {
        $response = trim($response);
        $response = preg_replace('/^```(?:json)?\s*\n?/', '', $response);
        $response = preg_replace('/\n?```\s*$/', '', $response);

        $decoded = json_decode($response, true);

        if (!is_array($decoded)) {
            return [];
        }

        return array_map(function (array $item): array {
            return [
                'behavior' => $item['behavior'] ?? '',
                'verdict' => strtoupper($item['verdict'] ?? 'UNCLEAR'),
                'rationale' => $item['rationale'] ?? '',
            ];
        }, $decoded);
    }

    /**
     * Build an EvalResult from the judge's parsed behaviors.
     *
     * @param  EvalCase $case
     * @param  array<int, array{behavior: string, verdict: string, rationale: string}> $behaviors
     * @param  int $durationMs
     * @return EvalResult
     */
    public function buildJudgeResult(EvalCase $case, array $behaviors, int $durationMs): EvalResult
    {
        if (count($behaviors) === 0) {
            return new EvalResult(
                name: $case->name,
                agent: $case->agent,
                passCriteria: $case->passCriteria,
                verdict: 'INVALID',
                durationMs: $durationMs,
                judgeUsed: true,
                error: 'Judge returned no behaviors',
            );
        }

        if (count($behaviors) !== count($case->expectedBehavior)) {
            return new EvalResult(
                name: $case->name,
                agent: $case->agent,
                passCriteria: $case->passCriteria,
                verdict: 'INVALID',
                behaviors: $behaviors,
                durationMs: $durationMs,
                judgeUsed: true,
                error: sprintf(
                    'Judge assessed %d of %d expected behaviors',
                    count($behaviors),
                    count($case->expectedBehavior),
                ),
            );
        }

        $allYes = true;
        foreach ($behaviors as $b) {
            if ($b['verdict'] !== 'YES') {
                $allYes = false;
                break;
            }
        }

        return new EvalResult(
            name: $case->name,
            agent: $case->agent,
            passCriteria: $case->passCriteria,
            verdict: $allYes ? 'PASS' : 'FAIL',
            behaviors: $behaviors,
            deterministicChecks: [],
            durationMs: $durationMs,
            judgeUsed: true,
        );
    }

    /**
     * Run the LLM judge against the captured agent output.
     *
     * @param  EvalCase $case
     * @param  string $agentOutput  Captured stdout + stderr from the agent run.
     * @return EvalResult
     */
    public function runJudge(EvalCase $case, string $agentOutput): EvalResult
    {
        $judgeCmd = $this->buildJudgeCommand($case, $agentOutput);

        $start = hrtime(true);
        $output = $this->executeCommand($judgeCmd, $this->timeout);
        $elapsed = (int) ((hrtime(true) - $start) / 1_000_000);

        if ($output['timed_out']) {
            return new EvalResult(
                name: $case->name,
                agent: $case->agent,
                passCriteria: $case->passCriteria,
                verdict: 'TIMEOUT',
                durationMs: $elapsed,
                judgeUsed: true,
                error: "Judge timed out after {$this->timeout} seconds",
                degradedKill: $output['degraded_kill'],
            );
        }

        $behaviors = self::parseJudgeResponse($output['stdout']);

        if ($behaviors === [] && $output['stdout'] !== '') {
            $preview = mb_substr($output['stdout'], 0, 200);

            return new EvalResult(
                name: $case->name,
                agent: $case->agent,
                passCriteria: $case->passCriteria,
                verdict: 'INVALID',
                durationMs: $elapsed,
                judgeUsed: true,
                error: "Judge output is unparseable (not valid JSON): {$preview}",
            );
        }

        return $this->buildJudgeResult($case, $behaviors, $elapsed);
    }

    /**
     * Check if opencode is available in PATH.
     *
     * Scans PATH directly with is_executable() rather than routing through
     * executeCommand(): on Linux executeCommand() prepends `exec setsid
     * --wait`, and setsid(1) execs the target via execvp() with no shell,
     * so a shell builtin like `command` is never found (exit 127). A native
     * PATH scan is shell-free, cross-platform, and unit-testable.
     *
     * @return bool
     */
    public function isOpenCodeAvailable(): bool
    {
        return $this->isBinaryOnPath('opencode');
    }

    /**
     * Resolve a binary name against PATH using is_executable().
     *
     * @param  string $binary Binary name without a directory component.
     * @return bool
     */
    private function isBinaryOnPath(string $binary): bool
    {
        if ($binary === '' || str_contains($binary, '/')) {
            return false;
        }

        $path = (string) getenv('PATH');
        if ($path === '') {
            return false;
        }

        foreach (explode(':', $path) as $dir) {
            $dir = rtrim($dir, '/');
            if ($dir === '') {
                continue; // skip empty entries (would otherwise match CWD)
            }
            $candidate = $dir . '/' . $binary;
            clearstatcache(true, $candidate);
            if (is_file($candidate) && is_executable($candidate)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Create a disposable detached git worktree of the repo root.
     *
     * The worktree shares the source repo's object database but has its own
     * working tree and (detached) HEAD, so an agent running inside it cannot
     * mutate the source working tree. The caller MUST remove it via
     * removeWorktree() in a finally path.
     *
     * @return string  Absolute path to the new worktree directory.
     * @throws \RuntimeException  If git is unavailable or worktree creation fails.
     */
    public function createWorktree(): string
    {
        $worktree = sys_get_temp_dir() . '/eval-worktree-' . bin2hex(random_bytes(8));

        $cmd = sprintf(
            'git -C %s worktree add --detach %s 2>&1',
            escapeshellarg($this->repoRoot),
            escapeshellarg($worktree),
        );

        $output = [];
        $exitCode = 0;
        exec($cmd, $output, $exitCode);

        if ($exitCode !== 0 || !is_dir($worktree)) {
            throw new \RuntimeException(
                'Failed to create git worktree: ' . implode("\n", $output),
            );
        }

        return $worktree;
    }

    /**
     * Remove a worktree created by createWorktree().
     *
     * Safe to call even if the directory was already removed. Never throws —
     * intended for use in a finally path where cleanup must not mask the
     * primary result.
     *
     * @param string $path  Absolute path returned by createWorktree().
     */
    public function removeWorktree(string $path): void
    {
        if (!is_dir($path)) {
            return;
        }

        $cmd = sprintf(
            'git -C %s worktree remove --force %s 2>&1',
            escapeshellarg($this->repoRoot),
            escapeshellarg($path),
        );
        exec($cmd);

        if (is_dir($path)) {
            // Fallback: remove the directory directly if git refused.
            $this->removeDirectory($path);

            // Prune orphaned .git/worktrees/<id>/ metadata so git worktree
            // list stays clean and future worktree adds don't collide.
            $pruneCmd = sprintf(
                'git -C %s worktree prune 2>&1',
                escapeshellarg($this->repoRoot),
            );
            exec($pruneCmd);
        }
    }

    /**
     * Recursively remove a directory (cross-platform).
     *
     * @param  string $path
     * @return void
     */
    private function removeDirectory(string $path): void
    {
        if (DIRECTORY_SEPARATOR === '\\') {
            exec('rd /s /q ' . escapeshellarg($path) . ' 2>NUL');
        } else {
            exec('rm -rf ' . escapeshellarg($path));
        }
    }
}

// vim: ft=php sts=4 sw=4 ts=4 et :

// vim: ft=php sts=4 sw=4 ts=4 et :
