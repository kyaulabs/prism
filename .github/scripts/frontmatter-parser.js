#!/usr/bin/env node
// $KYAULabs: frontmatter-parser.js kyau@nova 2026/07/05 -0700 Exp $

// Extract a YAML frontmatter key's value from a Markdown file.
// Usage: node frontmatter-parser.js <file> <key>
// Prints the value to stdout (empty string if not found).
// Exits 1 on parse error.

'use strict';

const fs = require('fs');
const yaml = require('js-yaml');

const file = process.argv[2];
const key  = process.argv[3];

if (!file || !key) {
	console.error('Usage: node frontmatter-parser.js <file> <key>');
	process.exit(2);
}

let content;
try {
	content = fs.readFileSync(file, 'utf8');
} catch (e) {
	console.error(`Error reading file: ${e.message}`);
	process.exit(1);
}

// Extract frontmatter between first two --- lines
// Strip \r for CRLF safety, strip BOM (U+FEFF) for Windows editors
content = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

const lines = content.split('\n');
if (lines[0] !== '---') {
	// No frontmatter
	process.stdout.write('');
	process.exit(0);
}

let fmLines = [];
let foundClosing = false;
for (let i = 1; i < lines.length; i++) {
	if (lines[i] === '---') {
		foundClosing = true;
		break;
	}
	fmLines.push(lines[i]);
}

if (!foundClosing) {
	// No closing --- delimiter
	process.stdout.write('');
	process.exit(0);
}

const fmText = fmLines.join('\n');

let doc;
try {
	doc = yaml.load(fmText);
} catch (e) {
	console.error(`YAML parse error in ${file}: ${e.message}`);
	process.exit(1);
}

if (doc === null || doc === undefined || typeof doc !== 'object') {
	process.stdout.write('');
	process.exit(0);
}

const value = doc[key];
if (value === undefined || value === null) {
	process.stdout.write('');
} else {
	process.stdout.write(String(value));
}

process.exit(0);
// vim: ft=javascript sts=4 sw=4 ts=4 noet :
