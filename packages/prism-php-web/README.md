# Prism PHP/Web

An ordinary project-local Pi module for PHP 8.5+, Aurora, MariaDB, nginx, SCSS,
vanilla JavaScript and Pest 5. Install with `pi install -l` using a package or
local directory, then use `setup-php-web` to select relevant native tools.

The module supplies skills, prompts, a changed-file coverage helper and optional
visual-review examples. It has no provisioning protocol, transaction engine or
Core-version handshake. Existing project conventions and explicit instructions
override module defaults.

Run Composer/npm executables directly. Changed-file PHP coverage defaults to
**90%**; `scripts/coverage-gate.php` accepts `--min=N` when explicitly requested.
Do not impose an additional aggregate threshold unless the project requests it.

Visual-review examples live in `config/visual-review/`. Copy/adapt them only when
selected, preserving project customization. Setup uses actual applicable files
from `kyaulabs/template`, not a duplicate scaffold renderer. See `skills/` and
`docs/` for stack-specific guidance.
