'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
function makeTempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'prism-test-')); }
function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), {recursive:true});
    fs.writeFileSync(filePath, JSON.stringify(value));
}
module.exports = {makeTempDir, writeJson};
