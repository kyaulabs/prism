<?php

declare(strict_types=1);

# $KYAULabs: PrismJsoncDocumentTest.php kyau@cosmos.kyaulabs 2026/07/29 -0700 Exp $




require_once dirname(__DIR__, 3) . '/.github/scripts/PrismJsoncDocument.php';

use KYAULabs\Prism\PrismJsoncDocument;
use KYAULabs\Prism\PrismJsoncException;

describe('PrismJsoncDocument::parse', function (): void {
    it('parses full JSONC without treating comment markers in strings as comments', function (): void {
        $source = <<<'JSONC'
{
  // line
  "url": "https://example.test/a/*literal*/", // trailing
  "escaped": "quote: \" and slash: \\",
  /* block
     comment */
  "items": [1, 2,],
}
JSONC;

        $document = PrismJsoncDocument::parse($source);

        expect($document->root()->url)->toBe('https://example.test/a/*literal*/')
            ->and($document->root()->escaped)->toBe('quote: " and slash: \\')
            ->and($document->root()->items)->toBe([1, 2]);
    });

    it('decodes objects as stdClass and arrays as lists so empty kinds never collapse', function (): void {
        $document = PrismJsoncDocument::parse('{"obj": {"inner": 1}, "arr": [2, 3], "empty_obj": {}, "empty_arr": []}');

        $root = $document->root();

        expect($root->obj)->toBeObject()
            ->and($root->obj)->not->toBeArray()
            ->and($root->obj->inner)->toBe(1)
            ->and($root->arr)->toBeArray()
            ->and($root->arr)->not->toBeObject()
            ->and($root->arr)->toBe([2, 3])
            ->and($root->empty_obj)->toBeObject()
            ->and($root->empty_arr)->toBeArray()
            ->and($root->empty_obj)->not->toBe($root->empty_arr);
    });
});

describe('nesting depth boundary', function (): void {
    it('accepts nesting at the maximum depth of 64', function (): void {
        $depth = 64;
        $source = str_repeat('{"a":', $depth) . '1' . str_repeat('}', $depth);

        $document = PrismJsoncDocument::parse($source);

        expect($document->root())->toBeObject();
    });

    it('rejects nesting beyond the maximum depth of 64', function (): void {
        $depth = 65;
        $source = str_repeat('{"a":', $depth) . '1' . str_repeat('}', $depth);

        expect(fn (): PrismJsoncDocument => PrismJsoncDocument::parse($source))
            ->toThrow(PrismJsoncException::class);
    });
});

describe('duplicate key rejection', function (): void {
    it('rejects escaped-equivalent duplicate keys', function (): void {
        $source = '{"key": 1, "\u006bey": 2}';

        expect(fn (): PrismJsoncDocument => PrismJsoncDocument::parse($source))
            ->toThrow(PrismJsoncException::class);
    });
});

describe('malformed number rejection', function (): void {
    it('rejects malformed numbers', function (string $number): void {
        $source = '{"n": ' . $number . '}';

        expect(fn (): PrismJsoncDocument => PrismJsoncDocument::parse($source))
            ->toThrow(PrismJsoncException::class);
    })->with(['leading-zero' => '01', 'trailing-dot' => '1.', 'bare-exponent' => '1e']);
});

describe('control character rejection', function (): void {
    it('rejects unescaped control characters inside strings', function (): void {
        $source = '{"s": "a' . "\x00" . 'b"}';

        expect(fn (): PrismJsoncDocument => PrismJsoncDocument::parse($source))
            ->toThrow(PrismJsoncException::class);
    });
});

describe('multiple root rejection', function (): void {
    it('rejects multiple root values', function (): void {
        $source = '{}{}';

        expect(fn (): PrismJsoncDocument => PrismJsoncDocument::parse($source))
            ->toThrow(PrismJsoncException::class);
    });
});

describe('malformed structure rejection', function (): void {
    it('rejects a non-object root', function (string $source): void {
        expect(fn (): PrismJsoncDocument => PrismJsoncDocument::parse($source))
            ->toThrow(PrismJsoncException::class);
    })->with([
        'root array' => '[1, 2]',
        'root scalar' => '42',
        'root string' => '"bare"',
    ]);

    it('rejects malformed object syntax', function (string $source): void {
        expect(fn (): PrismJsoncDocument => PrismJsoncDocument::parse($source))
            ->toThrow(PrismJsoncException::class);
    })->with([
        'missing colon' => '{"a" 1}',
        'non-string key' => '{1: 2}',
        'unterminated object' => '{"a": 1',
        'bare open brace' => '{',
        'value truncated after colon' => '{"a":',
        'unexpected token' => '{:}',
        'trailing junk' => '{"a": 1} junk',
        'missing comma between properties' => '{"a": 1 "b": 2}',
    ]);

    it('rejects malformed array syntax', function (string $source): void {
        expect(fn (): PrismJsoncDocument => PrismJsoncDocument::parse($source))
            ->toThrow(PrismJsoncException::class);
    })->with([
        'empty element' => '[,]',
        'double comma' => '[1,,2]',
        'unterminated array' => '[1, 2',
        'missing comma between elements' => '[1 2]',
    ]);
});

describe('maximum size boundary', function (): void {
    it('rejects input exceeding the maximum byte size', function (): void {
        $huge = '{ "x": "' . str_repeat('a', PrismJsoncDocument::MAX_BYTES) . '" }';

        expect(fn (): PrismJsoncDocument => PrismJsoncDocument::parse($huge))
            ->toThrow(PrismJsoncException::class);
    });
});

describe('unterminated construct rejection', function (): void {
    it('rejects an unterminated string', function (): void {
        expect(fn (): PrismJsoncDocument => PrismJsoncDocument::parse('{"s": "abc'))
            ->toThrow(PrismJsoncException::class);
    });

    it('rejects an unterminated block comment', function (): void {
        expect(fn (): PrismJsoncDocument => PrismJsoncDocument::parse('{"s": 1} /* not closed'))
            ->toThrow(PrismJsoncException::class);
    });
});

describe('PrismJsoncDocument::fromFile', function (): void {
    it('refuses to read a symlink', function (): void {
        $real = tempnam(sys_get_temp_dir(), 'prism_real_');
        file_put_contents($real, '{}');
        $link = $real . '.lnk';
        symlink($real, $link);

        try {
            expect(fn (): PrismJsoncDocument => PrismJsoncDocument::fromFile($link))
                ->toThrow(PrismJsoncException::class);
        } finally {
            @unlink($link);
            @unlink($real);
        }
    });

    it('reads and parses a real file', function (): void {
        $path = tempnam(sys_get_temp_dir(), 'prism_doc_');
        file_put_contents($path, "{\n  // note\n  \"v\": 7,\n}\n");

        try {
            $document = PrismJsoncDocument::fromFile($path);

            expect($document->root()->v)->toBe(7)
                ->and($document->source())->toBe("{\n  // note\n  \"v\": 7,\n}\n");
        } finally {
            @unlink($path);
        }
    });

    it('fails closed when the file cannot be read', function (): void {
        expect(fn (): PrismJsoncDocument => PrismJsoncDocument::fromFile('/nonexistent/prism/path'))
            ->toThrow(PrismJsoncException::class);
    });
});

describe('PrismJsoncDocument::withValues', function (): void {
    it('patches owned paths while preserving every unrelated byte', function (): void {
        $source = "{\n  // keep\n  \"models\": {\"primary\": \"old\"},\n  \"custom\": 1,\n}\n";

        $patched = PrismJsoncDocument::parse($source)
            ->withValues(['models.primary' => 'new']);

        expect($patched->source())->toBe(
            "{\n  // keep\n  \"models\": {\"primary\": \"new\"},\n  \"custom\": 1,\n}\n",
        );
        expect($patched->withValues(['models.primary' => 'new'])->source())
            ->toBe($patched->source());
    });

    it('creates missing intermediate objects recursively', function (): void {
        $source = "{\n  \"a\": 1,\n}\n";

        $patched = PrismJsoncDocument::parse($source)
            ->withValues(['x.y.z' => 5]);

        expect($patched->source())->toBe(
            "{\n  \"a\": 1,\n  \"x\": {\"y\": {\"z\": 5}},\n}\n",
        );
    });

    it('throws on a scalar-ancestor collision', function (): void {
        $source = '{"a": 1}';

        expect(fn (): PrismJsoncDocument => PrismJsoncDocument::parse($source)
            ->withValues(['a.b' => 2]))
            ->toThrow(PrismJsoncException::class);
    });

    it('throws on an array-ancestor collision', function (): void {
        $source = '{"items": [1, 2]}';

        expect(fn (): PrismJsoncDocument => PrismJsoncDocument::parse($source)
            ->withValues(['items.x' => 3]))
            ->toThrow(PrismJsoncException::class);
    });

    it('rejects dot paths with invalid segments', function (string $dotPath): void {
        expect(fn (): PrismJsoncDocument => PrismJsoncDocument::parse('{}')
            ->withValues([$dotPath => 1]))
            ->toThrow(PrismJsoncException::class);
    })->with([
        'leading digit' => '0bad',
        'numeric segment' => 'a.0',
        'hyphen segment' => 'a-b',
        'empty segment' => 'a..b',
        'empty path' => '',
    ]);

    it('inserts a first key into an empty object using the brace indentation', function (): void {
        $patched = PrismJsoncDocument::parse('{}')
            ->withValues(['a' => 1]);

        expect($patched->source())->toBe("{\n  \"a\": 1\n}")
            ->and($patched->root()->a)->toBe(1);
    });

    it('replaces arrays and typed scalars atomically, preserving sibling bytes', function (): void {
        $source = "{\n  \"items\": [1, 2, 3],\n  \"flag\": false,\n  \"ratio\": 1.5,\n  \"note\": null,\n}\n";

        $patched = PrismJsoncDocument::parse($source)
            ->withValues([
                'items' => [4, 5],
                'flag' => true,
                'ratio' => 2.25,
                'note' => 'kept',
            ]);

        expect($patched->source())->toBe(
            "{\n  \"items\": [4,5],\n  \"flag\": true,\n  \"ratio\": 2.25,\n  \"note\": \"kept\",\n}\n",
        )
            ->and($patched->root()->items)->toBe([4, 5])
            ->and($patched->root()->flag)->toBeTrue()
            ->and($patched->root()->ratio)->toBe(2.25)
            ->and($patched->root()->note)->toBe('kept');
    });

    it('is byte-identical when the same patch is applied twice', function (): void {
        $source = "{\n  \"models\": {\"primary\": \"old\"},\n  \"custom\": 1,\n}\n";
        $doc = PrismJsoncDocument::parse($source);
        $updates = ['models.primary' => 'new', 'network.port' => 8080];

        $once = $doc->withValues($updates);
        $twice = $once->withValues($updates);

        expect($twice->source())->toBe($once->source());
    });
});

describe('PrismJsoncDocument::writeAtomic', function (): void {
    it('writes atomically at the requested mode', function (): void {
        $document = PrismJsoncDocument::parse("{\n  \"v\": 1,\n}\n");
        $path = tempnam(sys_get_temp_dir(), 'prism_write_');
        @unlink($path);

        try {
            $document->writeAtomic($path, 0644);

            clearstatcache(true, $path);
            $written = file_get_contents($path);
            $mode = fileperms($path) & 0777;

            expect($written)->toBe("{\n  \"v\": 1,\n}\n")
                ->and($mode)->toBe(0644);
        } finally {
            @unlink($path);
        }
    });

    it('refuses to write to a symlink target', function (): void {
        $real = tempnam(sys_get_temp_dir(), 'prism_real_');
        $link = $real . '.lnk';
        symlink($real, $link);
        $document = PrismJsoncDocument::parse('{}');

        try {
            expect(fn () => $document->writeAtomic($link, 0644))
                ->toThrow(PrismJsoncException::class);
        } finally {
            @unlink($link);
            @unlink($real);
        }
    });
});


// vim: ft=php sts=4 sw=4 ts=4 et :
