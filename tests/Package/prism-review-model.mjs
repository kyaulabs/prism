// $KYAULabs: prism-review-model.mjs kyau@aura.kyaulabs 2026/09/08 -0700 Exp $

import {ModelRuntime} from '@earendil-works/pi-coding-agent';

const credentials = {
    async read() { return undefined; },
    async list() { return []; },
    async modify() { throw new Error('credential mutation forbidden'); },
    async delete() { throw new Error('credential mutation forbidden'); },
};
const runtime = await ModelRuntime.create({credentials, modelsPath: null,
    refreshOnCreate: false, allowModelNetwork: false});
const model = runtime.getModels().find(value => value.contextWindow > 0);
if (!model) throw new Error('no built-in fixture model available');
process.stdout.write(JSON.stringify({PI_PROVIDER: model.provider, PI_MODEL: model.id,
    PI_REASONING_LEVEL: 'off'}) + '\n');

// vim: ft=javascript sts=4 sw=4 ts=4 et :
