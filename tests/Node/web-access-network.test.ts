// $KYAULabs: web-access-network.test.ts kyau@aura.kyaulabs 2026/08/26 -0700 Exp $

import assert from 'node:assert/strict';
import test from 'node:test';
import {
    parsePublicUrl,
    resolvePublicTarget,
    validateLoopbackUrl,
} from '../../packages/prism-core/extensions/web-access/network.ts';
import {WebAccessError} from '../../packages/prism-core/extensions/web-access/errors.ts';

function hasCode(code: string) {
    return (error: unknown): boolean => error instanceof WebAccessError && error.code === code;
}

test('parsePublicUrl normalizes public HTTP URLs and internationalized hosts', () => {
    assert.equal(parsePublicUrl('https://example.com/path?q=1').href, 'https://example.com/path?q=1');
    assert.equal(parsePublicUrl('http://bücher.example/').hostname, 'xn--bcher-kva.example');
    assert.equal(parsePublicUrl('https://93.184.216.34/').hostname, '93.184.216.34');
    assert.equal(parsePublicUrl('https://[2606:4700:4700::1111]/').hostname, '[2606:4700:4700::1111]');
});

test('parsePublicUrl rejects credentials fragments schemes and blocked literals', () => {
    for (const input of [
        'https://user@example.com/',
        'https://user:pass@example.com/',
        'https://example.com/#fragment',
        'ftp://example.com/',
        'file:///etc/passwd',
        'not a URL',
    ]) {
        assert.throws(() => parsePublicUrl(input), hasCode('WEB_ACCESS_INVALID_URL'), input);
    }
    for (const input of [
        'http://127.0.0.1/',
        'http://10.0.0.1/',
        'http://169.254.1.1/',
        'http://[::1]/',
        'http://[::ffff:127.0.0.1]/',
    ]) {
        assert.throws(() => parsePublicUrl(input), hasCode('WEB_ACCESS_TARGET_BLOCKED'), input);
    }
});

test('resolvePublicTarget accepts public IPv4 and IPv6 answers', async () => {
    const ipv4 = await resolvePublicTarget(new URL('https://v4.example/'), {
        lookup: async () => [{address: '93.184.216.34', family: 4}],
    });
    assert.deepEqual(ipv4, {
        url: new URL('https://v4.example/'),
        address: '93.184.216.34',
        family: 4,
    });
    const ipv6 = await resolvePublicTarget(new URL('https://v6.example/'), {
        lookup: async () => [{address: '2606:4700:4700::1111', family: 6}],
    });
    assert.equal(ipv6.address, '2606:4700:4700::1111');
    assert.equal(ipv6.family, 6);
});

test('resolvePublicTarget rejects every non-public IPv4 class', async () => {
    const blocked = [
        '0.0.0.0',
        '10.0.0.1',
        '100.64.0.1',
        '127.0.0.1',
        '169.254.1.1',
        '172.16.0.1',
        '192.0.0.1',
        '192.0.2.1',
        '192.88.99.1',
        '192.168.0.1',
        '198.18.0.1',
        '198.51.100.1',
        '203.0.113.1',
        '224.0.0.1',
        '240.0.0.1',
        '255.255.255.255',
    ];
    for (const address of blocked) {
        await assert.rejects(
            () => resolvePublicTarget(new URL('https://blocked.example/'), {
                lookup: async () => [{address, family: 4}],
            }),
            hasCode('WEB_ACCESS_TARGET_BLOCKED'),
            address,
        );
    }
});

test('resolvePublicTarget rejects every non-public IPv6 class and mapped IPv4', async () => {
    const blocked = [
        '::',
        '::1',
        '::ffff:93.184.216.34',
        '64:ff9b::1',
        '64:ff9b:1::1',
        '100::1',
        '2001::1',
        '2001:2::1',
        '2001:10::1',
        '2001:20::1',
        '2001:db8::1',
        '2002::1',
        '3fff::1',
        'fc00::1',
        'fe80::1',
        'fec0::1',
        'ff00::1',
    ];
    for (const address of blocked) {
        await assert.rejects(
            () => resolvePublicTarget(new URL('https://blocked.example/'), {
                lookup: async () => [{address, family: 6}],
            }),
            hasCode('WEB_ACCESS_TARGET_BLOCKED'),
            address,
        );
    }
});

test('resolvePublicTarget rejects mixed and empty DNS answers', async () => {
    await assert.rejects(
        () => resolvePublicTarget(new URL('https://mixed.example/'), {
            lookup: async () => [
                {address: '93.184.216.34', family: 4},
                {address: '127.0.0.1', family: 4},
            ],
        }),
        hasCode('WEB_ACCESS_TARGET_BLOCKED'),
    );
    await assert.rejects(
        () => resolvePublicTarget(new URL('https://empty.example/'), {
            lookup: async () => [],
        }),
        hasCode('WEB_ACCESS_DNS_FAILED'),
    );
});

test('resolvePublicTarget propagates AbortSignal to DNS and sanitizes failures', async () => {
    const controller = new AbortController();
    let received: AbortSignal | undefined;
    await assert.rejects(
        () => resolvePublicTarget(new URL('https://dns.example/private-canary'), {
            signal: controller.signal,
            lookup: async (_hostname, options) => {
                received = options.signal;
                throw new Error('PRIVATE_DNS_CANARY');
            },
        }),
        (error: unknown) => {
            assert.equal(received, controller.signal);
            assert.ok(error instanceof WebAccessError);
            assert.equal(error.code, 'WEB_ACCESS_DNS_FAILED');
            assert.doesNotMatch(error.message, /PRIVATE_DNS_CANARY|private-canary/);
            return true;
        },
    );
});

test('validateLoopbackUrl accepts only localhost and literal loopback targets', async () => {
    const localhost = await validateLoopbackUrl('http://localhost:8080/', {
        lookup: async () => [
            {address: '127.0.0.1', family: 4},
            {address: '::1', family: 6},
        ],
    });
    assert.equal(localhost.address, '127.0.0.1');
    assert.equal(localhost.url.href, 'http://localhost:8080/');

    const ipv4 = await validateLoopbackUrl('http://127.42.0.1:8080/', {
        lookup: async () => { throw new Error('literal must not resolve'); },
    });
    assert.equal(ipv4.family, 4);

    const ipv6 = await validateLoopbackUrl('https://[::1]:8443/', {
        lookup: async () => { throw new Error('literal must not resolve'); },
    });
    assert.equal(ipv6.family, 6);
});

test('validateLoopbackUrl rejects non-loopback names and mixed localhost answers', async () => {
    await assert.rejects(
        () => validateLoopbackUrl('http://private.example/', {
            lookup: async () => [{address: '127.0.0.1', family: 4}],
        }),
        hasCode('WEB_ACCESS_LOOPBACK_REQUIRED'),
    );
    await assert.rejects(
        () => validateLoopbackUrl('http://localhost/', {
            lookup: async () => [
                {address: '127.0.0.1', family: 4},
                {address: '93.184.216.34', family: 4},
            ],
        }),
        hasCode('WEB_ACCESS_LOOPBACK_REQUIRED'),
    );
    for (const input of [
        'http://user@localhost/',
        'http://localhost/#fragment',
        'ftp://localhost/',
        'http://[::ffff:127.0.0.1]/',
    ]) {
        await assert.rejects(
            () => validateLoopbackUrl(input, {lookup: async () => []}),
            hasCode(input.includes('ffff') ? 'WEB_ACCESS_LOOPBACK_REQUIRED' : 'WEB_ACCESS_INVALID_URL'),
            input,
        );
    }
});

// vim: ft=typescript sts=4 sw=4 ts=4 et :
