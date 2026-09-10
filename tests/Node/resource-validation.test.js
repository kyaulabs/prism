'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const script = path.resolve(__dirname, '../../packages/prism-core/scripts/validate-resources.js');

test('resource validation accepts ordinary Pi skills and rejects malformed metadata without a launcher', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-resources-'));
    t.after(() => fs.rmSync(root, {recursive:true,force:true}));
    const directory = path.join(root,'packages/example/skills/example');
    fs.mkdirSync(directory,{recursive:true});
    fs.writeFileSync(path.join(root,'packages/example/package.json'),JSON.stringify({pi:{skills:['./skills']}}));
    const skill = path.join(directory,'SKILL.md');
    fs.writeFileSync(skill,'---\nname: example\ndescription: Use for an example.\n---\n# Example\n');
    const run = () => spawnSync(process.execPath,[script,root],{encoding:'utf8'});
    assert.equal(run().status,0);
    fs.writeFileSync(skill,'---\nname: wrong\n---\n# Example\n');
    const result=run();
    assert.equal(result.status,1);
    assert.match(result.stderr,/invalid skill name/);
    assert.match(result.stderr,/invalid description/);
});
