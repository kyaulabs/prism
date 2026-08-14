// $KYAULabs: audit.js git@aura.kyaulabs 2026/08/14 -0700 Exp $





'use strict';

const MAX_AUDIT_BYTES = 1048576;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)?)$/;
const ADVISORY_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function emptyTotals() {
	return {critical: 0, high: 0, moderate: 0, low: 0};
}

function parseAuditResult(result) {
	if (result?.error || typeof result?.stdout !== 'string') throw new Error('audit execution failed');
	if (Buffer.byteLength(result.stdout) > MAX_AUDIT_BYTES) throw new Error('audit output limit');
	let document;
	try {
		document = JSON.parse(result.stdout);
	} catch {
		throw new Error('audit output is malformed');
	}
	if (document === null || typeof document !== 'object' || Array.isArray(document)) {
		throw new Error('audit output is malformed');
	}
	return document;
}

function normalizeSeverity(value) {
	if (value === 'medium') return 'moderate';
	if (['critical', 'high', 'moderate', 'low'].includes(value)) return value;
	return 'moderate';
}

function normalizeComposerAudit(result) {
	const document = parseAuditResult(result);
	if (
		document.advisories === null ||
		typeof document.advisories !== 'object' ||
		Array.isArray(document.advisories)
	) {
		throw new Error('Composer audit output is malformed');
	}
	const totals = emptyTotals();
	const findings = [];
	for (const [packageName, advisories] of Object.entries(document.advisories)) {
		if (!PACKAGE_NAME.test(packageName) || !Array.isArray(advisories)) {
			throw new Error('Composer audit output is malformed');
		}
		for (const advisory of advisories) {
			if (advisory === null || typeof advisory !== 'object' || Array.isArray(advisory)) {
				throw new Error('Composer audit output is malformed');
			}
			const severity = normalizeSeverity(advisory.severity);
			const id = ADVISORY_ID.test(advisory.advisoryId) ? advisory.advisoryId : 'unknown';
			totals[severity] += 1;
			findings.push({ecosystem: 'composer', package: packageName, id, severity});
		}
	}
	return {totals, findings};
}

function normalizeNpmAudit(result) {
	const document = parseAuditResult(result);
	const sourceTotals = document.metadata?.vulnerabilities;
	if (
		sourceTotals === null ||
		typeof sourceTotals !== 'object' ||
		Array.isArray(sourceTotals) ||
		document.vulnerabilities === null ||
		typeof document.vulnerabilities !== 'object' ||
		Array.isArray(document.vulnerabilities)
	) {
		throw new Error('npm audit output is malformed');
	}
	for (const key of ['info', 'low', 'moderate', 'high', 'critical']) {
		if (!Number.isInteger(sourceTotals[key]) || sourceTotals[key] < 0) {
			throw new Error('npm audit output is malformed');
		}
	}
	const totals = {
		critical: sourceTotals.critical,
		high: sourceTotals.high,
		moderate: sourceTotals.moderate,
		low: sourceTotals.low + sourceTotals.info,
	};
	const findings = [];
	for (const [packageName, vulnerability] of Object.entries(document.vulnerabilities)) {
		if (
			!PACKAGE_NAME.test(packageName) ||
			vulnerability === null ||
			typeof vulnerability !== 'object' ||
			Array.isArray(vulnerability) ||
			!Array.isArray(vulnerability.via)
		) {
			throw new Error('npm audit output is malformed');
		}
		const severity = normalizeSeverity(vulnerability.severity);
		for (const advisory of vulnerability.via) {
			if (advisory === null || typeof advisory !== 'object' || Array.isArray(advisory)) continue;
			const source = String(advisory.source ?? 'unknown');
			const id = ADVISORY_ID.test(source) ? source : 'unknown';
			findings.push({ecosystem: 'npm', package: packageName, id, severity});
		}
	}
	return {totals, findings};
}

module.exports = {normalizeComposerAudit, normalizeNpmAudit};





// vim: ft=javascript sts=4 sw=4 ts=4 noet :
