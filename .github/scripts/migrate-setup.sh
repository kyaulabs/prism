#!/usr/bin/env bash
# $KYAULabs: migrate-setup.sh kyau@cosmos.kyaulabs 2026/08/03 -0700 Exp $





# migrate-setup.sh — One-way dual-path migration engine (ADR-0043, ADR-0049).
#
# A thin shell coordinator over prism_manifest.php's `migrate`,
# `migrate-preview`, and `upgrade-v6` commands. It renames BOTH legacy
# setup.json manifests to schema-v6 prism.jsonc:
#   project: $REPO_ROOT/.opencode/setup.json → $REPO_ROOT/prism.jsonc   (0644)
#   user:    $HOME/.config/opencode/setup.json → $HOME/.config/opencode/prism.jsonc (0600)
#
# Per tier the decision tree is:
#   - both old + new absent       → nothing to do (skip).
#   - old absent, new present     → upgrade-v6 patches the target to schema v6
#                                   in place (a v5 target gains the required
#                                   frontend defaults), then validate.
#   - old present, new absent     → `migrate` writes the canonical v6 target,
#                                   reparses+verifies it, then deletes old.
#   - both present                → project each side to v6 via `migrate-preview`
#                                   and compare. Equal → upgrade the target in
#                                   place, then delete the redundant old
#                                   (project: only when untracked; tracked old is
#                                   retained for the branch cutover).
#                                   Divergent → fail without touching either.
#
# Idempotent, refuses downgrade (source version > 6), refuses symlinks, and
# never deletes a legacy file unless its verified v6 replacement is in place.
# Explicit MIGRATE_* env vars override every path so tests never touch the real
# $HOME or real repo files.

set -euo pipefail

if ! command -v php >/dev/null 2>&1; then
    echo "✗ php is required to migrate prism manifests" >&2
    exit 1
fi

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
# Resolve symlinks so path-prefix matching works when /tmp → /private/tmp (macOS).
REPO_ROOT=$(cd "$REPO_ROOT" && pwd -P)
CLI="$REPO_ROOT/.github/scripts/prism_manifest.php"

PROJECT_OLD="${MIGRATE_PROJECT_OLD:-$REPO_ROOT/.opencode/setup.json}"
PROJECT_NEW="${MIGRATE_PROJECT_NEW:-$REPO_ROOT/prism.jsonc}"
USER_OLD="${MIGRATE_USER_OLD:-$HOME/.config/opencode/setup.json}"
USER_NEW="${MIGRATE_USER_NEW:-$HOME/.config/opencode/prism.jsonc}"

# path_exists <path> — true if path is a symlink or a regular file. A symlink
# (even broken) counts as present so it is routed to the PHP layer, which
# refuses symlinks rather than silently following them.
path_exists() {
    [ -L "$1" ] || [ -f "$1" ]
}

# is_legacy_tracked <legacy> — true when <legacy> is git-tracked inside
# REPO_ROOT. Paths outside the repo are never tracked. Used only for the project
# tier so a still-tracked .opencode/setup.json is retained during the branch
# transition (Task 13 deletes it after cutover); an untracked copy (the
# downstream-upgrade case) is removed after equality verification.
is_legacy_tracked() {
    local legacy="$1" rel
    # Resolve directory symlinks so the prefix match works when
    # /tmp → /private/tmp on macOS. pwd -P is POSIX, works on both platforms.
    legacy="$(cd "$(dirname "$legacy")" && pwd -P)/$(basename "$legacy")"
    case "$legacy" in
        "$REPO_ROOT"/*)
            rel="${legacy#"$REPO_ROOT"/}"
            git -C "$REPO_ROOT" ls-files --error-unmatch -- "$rel" >/dev/null 2>&1
            ;;
        *)
            return 1
            ;;
    esac
}

# process_tier <old> <new> <project|user> <octal-mode> — run one tier through
# the decision tree. Returns non-zero on any failure; never deletes old unless
# its verified v6 replacement exists.
process_tier() {
    local old="$1" new="$2" tier="$3" mode="$4"
    local old_present=0 new_present=0
    if path_exists "$old"; then old_present=1; fi
    if path_exists "$new"; then new_present=1; fi

    # Both absent → this tier is already settled (or never existed).
    if [ "$old_present" -eq 0 ] && [ "$new_present" -eq 0 ]; then
        return 0
    fi

    # Old absent, new present → upgrade the target to schema v6 in place, then
    # confirm it validates. An existing v5 target gains the required frontend
    # defaults (project tier) or just the version bump (user tier).
    if [ "$old_present" -eq 0 ]; then
        if ! php "$CLI" upgrade-v6 "$new" "$tier" "$mode"; then
            echo "✗ $tier target $new could not be upgraded to schema v6" >&2
            return 1
        fi
        if ! php "$CLI" validate "$new" "$tier" >/dev/null; then
            echo "✗ $tier target $new is not a valid v6 manifest" >&2
            return 1
        fi
        return 0
    fi

    # Old present, new absent → migrate: write canonical v6, verify, delete old.
    if [ "$new_present" -eq 0 ]; then
        if ! php "$CLI" migrate "$old" "$new" "$tier" "$mode"; then
            echo "✗ $tier migration of $old → $new failed" >&2
            return 1
        fi
        echo "✓ Migrated $tier: $old → $new" >&2
        return 0
    fi

    # Both present → compare v6 projections; never migrate onto an existing target.
    local legacy_proj target_proj
    if ! legacy_proj=$(php "$CLI" migrate-preview "$old" "$tier"); then
        echo "✗ $tier legacy $old could not be projected to v6" >&2
        return 1
    fi
    if ! target_proj=$(php "$CLI" migrate-preview "$new" "$tier"); then
        echo "✗ $tier target $new could not be projected to v6" >&2
        return 1
    fi

    if [ "$legacy_proj" != "$target_proj" ]; then
        echo "✗ $tier legacy and target diverge; leaving both untouched" >&2
        return 1
    fi

    # Semantically equal → upgrade the target in place first so a v5 target
    # becomes a real v6 manifest before the legacy is retained or removed.
    if ! php "$CLI" upgrade-v6 "$new" "$tier" "$mode"; then
        echo "✗ $tier target $new could not be upgraded to schema v6" >&2
        return 1
    fi

    # The legacy is now redundant.
    if [ "$tier" = project ] && is_legacy_tracked "$old"; then
        echo "⚠ Retaining tracked $tier legacy $old during branch transition" >&2
        echo "  It will be removed by Task 13 after the repository cutover." >&2
        return 0
    fi

    if ! rm -f -- "$old"; then
        echo "✗ cannot remove redundant $tier legacy $old" >&2
        return 1
    fi
    echo "✓ Removed redundant $tier legacy $old (target already present)" >&2
    return 0
}

process_tier "$PROJECT_OLD" "$PROJECT_NEW" project 0644
process_tier "$USER_OLD" "$USER_NEW" user 0600

echo "✓ Migration complete" >&2






# vim: ft=sh sts=4 sw=4 ts=4 et :
