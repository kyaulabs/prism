#!/usr/bin/env bash
# $KYAULabs: fake-prism-tool.sh git@aura.kyaulabs 2026/08/14 -0700 Exp $


#
# Test double for the prism-tool launcher used by hook boundary tests.
# Logs NUL-delimited argv to $PRISM_TOOL_LOG, answers `doctor` with
# $PRISM_DOCTOR_STATUS, and delegates `run <tool> -- args` to the fixture's
# real tools (vendor/bin or node_modules/.bin), honoring per-tool status
# overrides PRISM_<TOOL>_STATUS (uppercase, dashes -> underscores). Tools
# absent from the fixture succeed silently so unrelated behavior tests keep
# their focus.

set -u

printf '%s\0' "$@" >> "${PRISM_TOOL_LOG:-/dev/null}"

if [ "${1:-}" = "doctor" ]; then
	exit "${PRISM_DOCTOR_STATUS:-0}"
fi

if [ "${1:-}" = "run" ]; then
	tool="${2:-}"
	shift 2 2>/dev/null || true
	[ "${1:-}" = "--" ] && shift

	status_var="PRISM_$(printf '%s' "$tool" | tr '[:lower:]' '[:upper:]' | tr '-' '_')_STATUS"
	if [ -n "${!status_var:-}" ]; then
		exit "${!status_var}"
	fi

	case "$tool" in
		commitlint)
			if [ -x node_modules/.bin/commitlint ]; then
				exec node_modules/.bin/commitlint "$@"
			fi
			exit 0
			;;
		php-cs-fixer)
			if [ -x vendor/bin/php-cs-fixer ]; then
				exec vendor/bin/php-cs-fixer "$@"
			fi
			exit 0
			;;
		stylelint)
			if [ -x node_modules/.bin/stylelint ]; then
				exec node_modules/.bin/stylelint "$@"
			fi
			exit 0
			;;
		eslint)
			if [ -x node_modules/.bin/eslint ]; then
				exec node_modules/.bin/eslint "$@"
			fi
			exit 0
			;;
		*)
			exit 2
			;;
	esac
fi

exit 2



# vim: ft=sh sts=4 sw=4 ts=4 et :
