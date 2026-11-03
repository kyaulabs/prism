import assert from 'node:assert/strict';
import test from 'node:test';
import {hostFixture, resultText} from './pi-host-fixture.ts';

test('failed managed package warns and is unavailable, while unrelated tools remain usable', async t => {
    const target = await hostFixture(t, {}, {
        packages: ['npm:@prism-fixture/nonexistent@0.0.0'], allowWarnings: true,
        npmCommand: [process.execPath, '-e', 'process.stderr.write("synthetic package boundary failure");process.exit(1)'],
    });
    assert.match(JSON.stringify(target.loader.getExtensions().warnings), /nonexistent/);
    assert.ok(!target.loader.getSkills().skills.some(skill => skill.name === 'setup'));
    assert.ok(!target.session.getAllTools().some(tool => tool.name === 'web_search'));
    assert.equal((await target.script('return 2 + 2;')).isError, false);
    assert.match(resultText(await target.script('return "ordinary recovery";')), /ordinary recovery/);
});
