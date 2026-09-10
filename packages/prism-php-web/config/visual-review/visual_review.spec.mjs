// $KYAULabs: visual_review.spec.mjs setup@prism 2026/08/25 +0000 Exp $

import {createRequire} from 'node:module';
import {test} from 'playwright/test';
import {
	applyVisualReviewActions,
	assertCaptureOrigin,
	expandVisualReviewCases,
	loadVisualReviewConfig,
	publishVisualReviewEvidence,
	revisionIdentity,
} from './visual_review.mjs';

const require = createRequire(import.meta.url);
const playwrightVersion = require('playwright/package.json').version;
const captures = expandVisualReviewCases(loadVisualReviewConfig());
const revision = revisionIdentity();

test.use({headless: true, serviceWorkers: 'block'});

for (const capture of captures) {
	test(`${capture.caseId} ${capture.stateId} ${capture.viewportId}`, async ({browser}) => {
		const errors = [];
		const context = await browser.newContext({
			viewport: capture.viewport,
			colorScheme: capture.colorScheme,
		});
		try {
			const page = await context.newPage();
			page.on('console', (message) => {
				if (message.type() === 'error') errors.push(message.text());
			});
			page.on('pageerror', (error) => errors.push(error.message));
			await page.goto(capture.url, {waitUntil: 'domcontentloaded'});
			assertCaptureOrigin(page.url(), capture.url);
			if (capture.readySelector !== null) {
				await page.locator(capture.readySelector).waitFor({state: 'visible'});
			}
			await applyVisualReviewActions(page, capture.actions);
			assertCaptureOrigin(page.url(), capture.url);
			await publishVisualReviewEvidence(page, capture, {
				playwright: playwrightVersion,
				chromium: browser.version(),
			}, revision, errors);
		} finally {
			await context.close();
		}
	});
}

// vim: ft=javascript sts=4 sw=4 ts=4 et :
