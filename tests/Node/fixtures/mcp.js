'use strict';

// Harmless, local, dependency-free stdio MCP fixture. Stdout is protocol only.
const readline = require('node:readline');
readline.createInterface({input: process.stdin}).on('line', line => {
    const request = JSON.parse(line);
    if (request.id === undefined) return;
    let result;
    if (request.method === 'initialize') result = {
        protocolVersion: request.params.protocolVersion,
        capabilities: {tools: {}}, serverInfo: {name: 'prism-fixture', version: '1.0.0'},
    };
    else if (request.method === 'tools/list') result = {tools: [{
        name: 'echo', description: 'Echo a synthetic fixture value',
        inputSchema: {type: 'object', properties: {value: {type: 'string'}}, required: ['value']},
        outputSchema: {type: 'object', properties: {value: {type: 'string'}}, required: ['value']},
        annotations: {readOnlyHint: true, openWorldHint: false},
    }]};
    else if (request.method === 'tools/call') result = {
        content: [{type: 'text', text: request.params.arguments.value}],
        structuredContent: {value: request.params.arguments.value},
    };
    else if (request.method === 'ping') result = {};
    else {
        process.stdout.write(JSON.stringify({jsonrpc: '2.0', id: request.id, error: {code: -32601, message: 'Unknown fixture method'}}) + '\n');
        return;
    }
    process.stdout.write(JSON.stringify({jsonrpc: '2.0', id: request.id, result}) + '\n');
});
