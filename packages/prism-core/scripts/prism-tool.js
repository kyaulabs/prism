#!/usr/bin/env node
// $KYAULabs: prism-tool.js kyau@aura.kyaulabs 2026/08/16 -0700 Exp $




'use strict';

const {main} = require('./prism-tool/cli');

Promise.resolve(main(process.argv.slice(2)))
    .then((code) => {
        process.exitCode = code;
    })
    .catch(() => {
        process.stderr.write('prism-tool: internal failure\n');
        process.exitCode = 4;
    });




// vim: ft=javascript sts=4 sw=4 ts=4 et :
