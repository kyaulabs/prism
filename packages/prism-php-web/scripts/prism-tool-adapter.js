// $KYAULabs: prism-tool-adapter.js git@aura.kyaulabs 2026/08/14 -0700 Exp $







'use strict';

const {inspect, resolveTool} = require('./toolchain/project');
const {resolveCandidate} = require('./toolchain/transaction');

function resolve(options) {
	return resolveCandidate(options);
}

module.exports = {inspect, resolve, resolveTool};







// vim: ft=javascript sts=4 sw=4 ts=4 noet :
