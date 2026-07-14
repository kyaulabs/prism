<?php

declare(strict_types=1);

# $KYAULabs: Verdict.php kyau@nova 2026/07/13 -0700 Exp $






/**
 * Terminal outcome of a single eval case.
 *
 * Six case-level verdicts.  Behavior-level strings ('YES', 'NO',
 * 'UNCLEAR') returned by parseJudgeResponse() are intentionally excluded
 * — they describe individual behavior assessments, not the overall case
 * result, and live in behavior arrays only.
 *
 * @package KYAULabs\Eval
 */

namespace KYAULabs\Eval;

enum Verdict: string
{
    case Pass = 'PASS';
    case Fail = 'FAIL';
    case Timeout = 'TIMEOUT';
    case Invalid = 'INVALID';
    case Skipped = 'SKIPPED';
    case Undetermined = 'UNDETERMINED';
}


// vim: ft=php sts=4 sw=4 ts=4 et :
