<?php

# $KYAULabs: EvalRunner.php SEANBR~1@KYAU-DEV 2025/07/05 -0500 Exp $

declare(strict_types=1);

namespace KYAULabs\Eval;

/**
 * Parsed eval case from a JSON file.
 */
class EvalCase
{
    /** @param string[] $expectedBehavior */
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
     * Execute a shell command and capture stdout, stderr, and exit code.
     *
     * Uses non-blocking pipes to interleave reads on stdout and stderr,
     * avoiding pipe-buffer deadlocks, and enforces the wall-clock
     * $timeout via proc_terminate. A cross-platform polling loop with
     * stream_select is used to wait for pipe data.
     *
     * @param  string $cmd  Shell command to execute.
     * @param  int $timeout  Timeout in seconds.
     * @return array{stdout: string, stderr: string, exitCode: int, timed_out: bool}
     */
    public function executeCommand(string $cmd, int $timeout): array
    {
        // On POSIX, launch via exec setsid so the process runs in its own
        // process group. The PID from proc_get_status then identifies the
        // group, enabling posix_kill(-$pid, SIGKILL) to tree-kill on timeout.
        // --wait: forces fork+wait on Linux where setsid forks by default.
        if (DIRECTORY_SEPARATOR !== '\\') {
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
            return ['stdout' => '', 'stderr' => "Failed to start process: {$cmd}", 'exitCode' => -1, 'timed_out' => false];
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
     * @return array{stdout: string, stderr: string, exitCode: int, timed_out: bool}
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

        return [
            'stdout' => trim($stdout),
            'stderr' => trim($stderr),
            'exitCode' => $exitCode,
            'timed_out' => $timedOut,
        ];
    }

    /**
     * Kill a process and its entire child tree.
     *
     * On Windows, proc_terminate only signals the shell wrapper (cmd.exe)
     * but not child processes. taskkill /t ensures the full tree is
     * terminated so stream_get_contents does not block.
     *
     * On POSIX, the process was launched via exec setsid (own process group),
     * so posix_kill(-$pid, SIGKILL) kills the entire group. Falls back to
     * proc_terminate when the posix extension is unavailable.
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
        } elseif (function_exists('posix_kill')) {
            // Negative PID: kill the entire process group (setsid'd).
            // SIGKILL comes from PCNTL extension; fall back to integer 9
            // when only posix (not pcntl) is available.
            posix_kill(-$pid, defined('SIGKILL') ? SIGKILL : 9);
        } else {
            proc_terminate($process, 9);
        }
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
                $found = $case->expectedString !== null && str_contains($stdout, $case->expectedString);
                $checks['expected_string'] = [
                    'needle' => $case->expectedString ?? '',
                    'found' => $found,
                    'pass' => $found,
                ];
                $verdict = $found ? 'PASS' : 'FAIL';
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
     * @return bool
     */
    public function isOpenCodeAvailable(): bool
    {
        $output = $this->executeCommand('command -v opencode', 5);

        return $output['exitCode'] === 0 && $output['stdout'] !== '';
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
