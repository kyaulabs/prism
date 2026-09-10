'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {parseFrontmatter} = require('./frontmatter-parser');

const root = path.resolve(process.argv[2] ?? process.cwd());
let checked = 0;
const errors = [];
function walk(directory, kind) {
    for (const entry of fs.readdirSync(directory, {withFileTypes:true})) {
        const file = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) { errors.push(`${file}: symlinked resource`); continue; }
        if (entry.isDirectory()) { walk(file, kind); continue; }
        if (kind === 'skills' ? entry.name !== 'SKILL.md' : !entry.name.endsWith('.md')) continue;
        const meta = parseFrontmatter(fs.readFileSync(file, 'utf8'));
        if (typeof meta.description !== 'string' || !meta.description.trim() || meta.description.length > 1024) errors.push(`${file}: invalid description`);
        if (kind === 'skills' && (meta.name !== path.basename(directory) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(meta.name) || meta.name.length > 64)) errors.push(`${file}: invalid skill name`);
        checked++;
    }
}
try {
    for (const name of fs.readdirSync(path.join(root,'packages'))) {
        const directory = path.join(root,'packages',name);
        const manifest = JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8'));
        for (const kind of ['skills','prompts']) for (const resource of manifest.pi?.[kind] ?? []) walk(path.join(directory,resource),kind);
    }
} catch (error) { errors.push(error.message); }
for (const error of errors) console.error(error);
console.log(`${checked} skill/prompt resources checked; ${errors.length} errors.`);
process.exitCode = errors.length ? 1 : 0;
