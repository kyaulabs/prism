<?php

declare(strict_types=1);

# $KYAULabs: PrismJsoncDocument.php kyau@cosmos.kyaulabs 2026/07/29 -0700 Exp $




namespace KYAULabs\Prism;

require_once __DIR__ . '/PrismJsoncException.php';

/**
 * Dependency-free, round-trip JSONC document boundary for ADR-0043.
 *
 * A real stateful byte scanner (states: normal, string, line-comment,
 * block-comment) tokenizes the source into trivia, punctuation, string, and
 * scalar tokens with start/end offsets. Comments and trailing commas are
 * blanked to whitespace (preserving newlines) for a final
 * {@see json_decode} that decodes objects as {@see \stdClass} and arrays as
 * PHP lists, so `{}` and `[]` never collapse. A recursive-descent structural
 * parser walks the significant tokens to retain value spans and object
 * closing braces for the comment-preserving {@see self::withValues()} patcher.
 *
 * Every rejected input fails closed via {@see PrismJsoncException}.
 */
final class PrismJsoncDocument
{
    public const int MAX_BYTES = 1_048_576;

    public const int MAX_DEPTH = 64;

    private function __construct(
        private string $source,
        private \stdClass $root,
        private array $tree,
    ) {
    }

    /**
     * Parse a JSONC source string into a round-trip document.
     *
     * @param  string $source  Raw JSONC source.
     * @return self
     * @throws PrismJsoncException  If the source is malformed JSONC.
     */
    public static function parse(string $source): self
    {
        if (\strlen($source) > self::MAX_BYTES) {
            throw new PrismJsoncException('input exceeds maximum size of ' . self::MAX_BYTES . ' bytes');
        }

        [$tokens, $cleaned] = self::tokenize($source);
        self::blankTrailingCommas($tokens, $cleaned);
        $tree = self::parseDocument($tokens, $source);

        try {
            $value = json_decode($cleaned, false, self::MAX_DEPTH + 1, JSON_THROW_ON_ERROR);
        } catch (\JsonException $e) {
            throw new PrismJsoncException('malformed JSONC: ' . $e->getMessage(), 0, $e);
        }

        if (!($value instanceof \stdClass)) {
            throw new PrismJsoncException('JSONC root must be an object');
        }

        return new self($source, $value, $tree);
    }

    /**
     * Parse a JSONC file into a round-trip document.
     *
     * Refuses symlink inputs via {@see is_link()} (lstat-based, never
     * following the link) before reading.
     *
     * @param  string $path  Filesystem path to a JSONC file.
     * @return self
     * @throws PrismJsoncException  On a symlink, missing file, or malformed content.
     */
    public static function fromFile(string $path): self
    {
        if (\is_link($path)) {
            throw new PrismJsoncException('refusing symlink input: ' . $path);
        }

        if (!\is_file($path)) {
            throw new PrismJsoncException('cannot read file: ' . $path);
        }

        $contents = @\file_get_contents($path);

        if ($contents === false) {
            throw new PrismJsoncException('cannot read file: ' . $path);
        }

        return self::parse($contents);
    }

    /**
     * Return the decoded root object.
     *
     * @return \stdClass
     */
    public function root(): \stdClass
    {
        return $this->root;
    }

    /**
     * Return the original (or patched) source text.
     *
     * @return string
     */
    public function source(): string
    {
        return $this->source;
    }

    /**
     * Atomically write the document to disk at the requested mode.
     *
     * Refuses a symlink target via {@see is_link()} (lstat-based), writes a
     * same-directory temporary file, applies the mode, reparses the bytes to
     * validate, then renames atomically. The temporary file is removed on any
     * failure.
     *
     * @param  string $path  Destination path.
     * @param  int $mode     Octal file mode (e.g. 0644 or 0600).
     * @return void
     * @throws PrismJsoncException  On a symlink target or any I/O failure.
     */
    public function writeAtomic(string $path, int $mode): void
    {
        if (\is_link($path)) {
            throw new PrismJsoncException('refusing symlink write target: ' . $path);
        }

        self::parse($this->source);

        $dir = \dirname($path);
        $temp = @\tempnam($dir, '.prism_');

        if ($temp === false) {
            throw new PrismJsoncException('cannot create temporary file in ' . $dir);
        }

        try {
            if (@\file_put_contents($temp, $this->source) === false) {
                throw new PrismJsoncException('cannot write temporary file');
            }

            if (!@\chmod($temp, $mode)) {
                throw new PrismJsoncException('cannot set file mode');
            }

            if (!@\rename($temp, $path)) {
                throw new PrismJsoncException('cannot rename temporary file to ' . $path);
            }
        } catch (\Throwable $e) {
            if (\is_file($temp)) {
                @\unlink($temp);
            }
            throw $e;
        }
    }

    /**
     * Patch owned value spans, preserving every unrelated byte.
     *
     * Existing values are replaced right to left so earlier offsets stay
     * valid. Missing leaves are inserted before the owning object's closing
     * brace, recursively creating missing object ancestors. Values that
     * already match are skipped; when every requested value already matches
     * the source is returned byte-identical. The patched source is reparsed
     * before being returned.
     *
     * @param  array<string, mixed> $dotPathValues  Dot-path => replacement value.
     * @return self
     * @throws PrismJsoncException  On a scalar-ancestor collision or reparsed malformed result.
     */
    public function withValues(array $dotPathValues): self
    {
        $edits = [];

        foreach ($dotPathValues as $dotPath => $value) {
            $segments = self::parseDotPath($dotPath);
            $edit = $this->computeEdit($segments, $value);
            if ($edit !== null) {
                $edits[] = $edit;
            }
        }

        if ($edits === []) {
            return self::parse($this->source);
        }

        usort($edits, static fn (array $a, array $b): int => $b['start'] <=> $a['start']);

        $result = $this->source;
        foreach ($edits as $edit) {
            $result = substr($result, 0, $edit['start']) . $edit['text'] . substr($result, $edit['end']);
        }

        return self::parse($result);
    }

    /**
     * Compute the source edit (or null for an idempotent no-op) for one path.
     *
     * Walks the node tree, replacing an existing leaf, inserting a missing
     * leaf (creating missing ancestors), or throwing on a scalar ancestor
     * that cannot be descended into.
     *
     * @param  list<string> $segments
     * @param  mixed $value
     * @return array|null  Edit map with 'start', 'end', 'text'; or null.
     * @throws PrismJsoncException  On a scalar-ancestor collision.
     */
    private function computeEdit(array $segments, mixed $value): ?array
    {
        $count = \count($segments);
        $node = $this->tree;
        $path = '';

        for ($depth = 0; $depth < $count; $depth++) {
            $segment = $segments[$depth];
            $path = ($path === '' ? '' : $path . '.') . $segment;

            if ($node['kind'] !== 'object') {
                throw new PrismJsoncException('scalar ancestor collision at ' . $path);
            }

            if (!isset($node['props'][$segment])) {
                $tail = \array_slice($segments, $depth + 1);
                $encodedValue = self::encodeObjectPath($tail, $value);

                return $this->buildInsertionEdit($node, $segment, $encodedValue);
            }

            $childNode = $node['props'][$segment]['value'];

            if ($depth === $count - 1) {
                if (self::valuesEqual($this->resolveValue($segments), $value)) {
                    return null;
                }

                return ['start' => $childNode['start'], 'end' => $childNode['end'], 'text' => self::encodeValue($value)];
            }

            if ($childNode['kind'] !== 'object') {
                throw new PrismJsoncException('scalar ancestor collision at ' . $path);
            }

            $node = $childNode;
        }

        return null;
    }

    /**
     * Encode a chain of missing object segments wrapping the final value.
     *
     * encodeObjectPath([], v) => the encoded value; encodeObjectPath([a,b], v)
     * => {"a": {"b": <value>}}.
     *
     * @param  list<string> $segments
     * @param  mixed $value
     * @return string
     */
    private static function encodeObjectPath(array $segments, mixed $value): string
    {
        if ($segments === []) {
            return self::encodeValue($value);
        }

        $key = self::encodeKeyString(\array_shift($segments));

        return '{' . $key . ': ' . self::encodeObjectPath($segments, $value) . '}';
    }

    /**
     * Build the insertion edit for a new property in a container object.
     *
     * Non-empty containers append after the last value; empty containers are
     * expanded to a multi-line form using the closing brace's indentation.
     *
     * @param  array  $container     Object node receiving the property.
     * @param  string $key           Decoded key of the new property.
     * @param  string $encodedValue  Already-encoded value (or nested object).
     * @return array  Edit map with 'start', 'end', 'text'.
     */
    private function buildInsertionEdit(array $container, string $key, string $encodedValue): array
    {
        $propertyText = self::encodeKeyString($key) . ': ' . $encodedValue;

        if ($container['props'] === []) {
            $closeIndent = self::indentBefore($this->source, $container['close']);
            $insertAt = $container['open'] + 1;
            $text = "\n" . $closeIndent . '  ' . $propertyText . "\n" . $closeIndent;

            return ['start' => $insertAt, 'end' => $insertAt, 'text' => $text];
        }

        $lastKey = \array_key_last($container['props']);
        $lastProp = $container['props'][$lastKey];
        $keyIndent = self::indentBefore($this->source, $lastProp['keyStart']);
        $insertAt = $lastProp['value']['end'];
        $text = ",\n" . $keyIndent . $propertyText;

        return ['start' => $insertAt, 'end' => $insertAt, 'text' => $text];
    }

    /**
     * Return the leading whitespace (spaces/tabs) before an offset on its line.
     *
     * @param  string $source
     * @param  int $offset
     * @return string
     */
    private static function indentBefore(string $source, int $offset): string
    {
        $indent = '';
        for ($i = $offset - 1; $i >= 0 && ($source[$i] === ' ' || $source[$i] === "\t"); $i--) {
            $indent = $source[$i] . $indent;
        }

        return $indent;
    }

    /**
     * JSON-encode a property key string with stable, unescaped output.
     *
     * @param  string $key
     * @return string
     */
    private static function encodeKeyString(string $key): string
    {
        try {
            return json_encode($key, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        } catch (\JsonException $e) {
            throw new PrismJsoncException('cannot encode key', 0, $e);
        }
    }

    /**
     * Tokenize the source into offset-tagged tokens and a comment-blanked copy.
     *
     * @param  string $source  Raw JSONC source.
     * @return array{0: list<array>, 1: string}  Tokens and comment-blanked source.
     */
    private static function tokenize(string $source): array
    {
        $len = \strlen($source);
        $tokens = [];
        $cleaned = $source;
        $i = 0;

        while ($i < $len) {
            $start = $i;
            $ch = $source[$i];

            if (self::isWs($ch)) {
                $i++;
                while ($i < $len && self::isWs($source[$i])) {
                    $i++;
                }
                $tokens[] = ['kind' => 'trivia', 'start' => $start, 'end' => $i];
                continue;
            }

            if ($ch === '/' && $i + 1 < $len && $source[$i + 1] === '/') {
                $i += 2;
                while ($i < $len && $source[$i] !== "\n") {
                    $i++;
                }
                self::blankRange($cleaned, $source, $start, $i);
                $tokens[] = ['kind' => 'trivia', 'start' => $start, 'end' => $i];
                continue;
            }

            if ($ch === '/' && $i + 1 < $len && $source[$i + 1] === '*') {
                $close = self::findBlockCommentEnd($source, $i + 2, $len);

                if ($close === null) {
                    throw new PrismJsoncException('unterminated block comment');
                }

                $i = $close;
                self::blankRange($cleaned, $source, $start, $i);
                $tokens[] = ['kind' => 'trivia', 'start' => $start, 'end' => $i];
                continue;
            }

            if ($ch === '{' || $ch === '}' || $ch === '[' || $ch === ']' || $ch === ':' || $ch === ',') {
                $tokens[] = ['kind' => 'punct', 'value' => $ch, 'start' => $i, 'end' => $i + 1];
                $i++;
                continue;
            }

            if ($ch === '"') {
                $i++;
                while ($i < $len) {
                    if ($source[$i] === '\\' && $i + 1 < $len) {
                        $i += 2;
                    } elseif ($source[$i] === '"') {
                        $i++;
                        break;
                    } else {
                        $i++;
                    }
                }
                $tokens[] = ['kind' => 'string', 'start' => $start, 'end' => $i];
                continue;
            }

            $i++;
            while ($i < $len && !self::isDelim($source[$i])) {
                $i++;
            }
            $tokens[] = ['kind' => 'scalar', 'start' => $start, 'end' => $i];
        }

        return [$tokens, $cleaned];
    }

    /**
     * Blank trailing commas (followed only by trivia then a close) in cleaned.
     *
     * @param  list<array> $tokens  Token list from {@see self::tokenize()}.
     * @param  string $cleaned       Comment-blanked source (modified by-ref).
     * @return void
     */
    private static function blankTrailingCommas(array $tokens, string &$cleaned): void
    {
        $count = \count($tokens);

        foreach ($tokens as $idx => $tok) {
            if ($tok['kind'] !== 'punct' || $tok['value'] !== ',') {
                continue;
            }
            $k = $idx + 1;
            while ($k < $count && $tokens[$k]['kind'] === 'trivia') {
                $k++;
            }
            if (
                $k < $count && $tokens[$k]['kind'] === 'punct'
                && ($tokens[$k]['value'] === '}' || $tokens[$k]['value'] === ']')
            ) {
                $cleaned[$tok['start']] = ' ';
            }
        }
    }

    /**
     * Parse the document token stream into a span-bearing node tree.
     *
     * @param  list<array> $tokens  Token list.
     * @param  string $source        Original source (for key decoding).
     * @return array  Root node.
     * @throws PrismJsoncException  On structural errors.
     */
    private static function parseDocument(array $tokens, string $source): array
    {
        $count = \count($tokens);
        $pos = 0;
        $node = self::parseValue($tokens, $count, $pos, $source, 0);
        self::skipTrivia($tokens, $count, $pos);

        if ($pos < $count) {
            throw new PrismJsoncException('unexpected trailing content');
        }

        return $node;
    }

    /**
     * Parse a single value node at the cursor.
     *
     * @param  list<array> $tokens  Token list.
     * @param  int $count            Token count.
     * @param  int $pos              Cursor (advanced by-ref).
     * @param  string $source        Original source.
     * @param  int $depth            Current nesting depth (root = 0).
     * @return array  Value node.
     * @throws PrismJsoncException  On structural errors.
     */
    private static function parseValue(array $tokens, int $count, int &$pos, string $source, int $depth): array
    {
        self::skipTrivia($tokens, $count, $pos);

        if ($pos >= $count) {
            throw new PrismJsoncException('unexpected end of input');
        }

        $tok = $tokens[$pos];

        if ($tok['kind'] === 'punct' && $tok['value'] === '{') {
            self::guardDepth($depth);

            return self::parseObject($tokens, $count, $pos, $source, $depth);
        }

        if ($tok['kind'] === 'punct' && $tok['value'] === '[') {
            self::guardDepth($depth);

            return self::parseArray($tokens, $count, $pos, $source, $depth);
        }

        if ($tok['kind'] === 'string') {
            $pos++;

            return ['kind' => 'string', 'start' => $tok['start'], 'end' => $tok['end']];
        }

        if ($tok['kind'] === 'scalar') {
            $pos++;

            return ['kind' => 'scalar', 'start' => $tok['start'], 'end' => $tok['end']];
        }

        throw new PrismJsoncException('unexpected token');
    }

    /**
     * Parse an object node, recording each property's key start and value span.
     *
     * @param  list<array> $tokens
     * @param  int $count
     * @param  int $pos
     * @param  string $source
     * @param  int $depth
     * @return array  Object node.
     * @throws PrismJsoncException
     */
    private static function parseObject(array $tokens, int $count, int &$pos, string $source, int $depth): array
    {
        $open = $tokens[$pos]['start'];
        $pos++;
        $props = [];

        self::skipTrivia($tokens, $count, $pos);
        if ($pos < $count && $tokens[$pos]['kind'] === 'punct' && $tokens[$pos]['value'] === '}') {
            $close = $tokens[$pos]['start'];
            $pos++;

            return ['kind' => 'object', 'open' => $open, 'close' => $close, 'start' => $open, 'end' => $close + 1, 'props' => $props];
        }

        while (true) {
            self::skipTrivia($tokens, $count, $pos);
            if ($pos >= $count) {
                throw new PrismJsoncException('unterminated object');
            }

            $tok = $tokens[$pos];
            if ($tok['kind'] !== 'string') {
                throw new PrismJsoncException('expected property key');
            }

            $keyStart = $tok['start'];
            $decodedKey = self::decodeKey($source, $tok['start'], $tok['end']);
            if (\array_key_exists($decodedKey, $props)) {
                throw new PrismJsoncException('duplicate object key');
            }
            $pos++;

            self::skipTrivia($tokens, $count, $pos);
            if ($pos >= $count || $tokens[$pos]['kind'] !== 'punct' || $tokens[$pos]['value'] !== ':') {
                throw new PrismJsoncException('expected colon after property key');
            }
            $pos++;

            $valueNode = self::parseValue($tokens, $count, $pos, $source, $depth + 1);
            $props[$decodedKey] = ['keyStart' => $keyStart, 'value' => $valueNode];

            self::skipTrivia($tokens, $count, $pos);
            if ($pos >= $count) {
                throw new PrismJsoncException('unterminated object');
            }

            $tok = $tokens[$pos];
            if ($tok['kind'] === 'punct' && $tok['value'] === ',') {
                $pos++;
                self::skipTrivia($tokens, $count, $pos);
                if ($pos < $count && $tokens[$pos]['kind'] === 'punct' && $tokens[$pos]['value'] === '}') {
                    break;
                }
                continue;
            }

            if ($tok['kind'] === 'punct' && $tok['value'] === '}') {
                break;
            }

            throw new PrismJsoncException('expected comma or closing brace');
        }

        $close = $tokens[$pos]['start'];
        $pos++;

        return ['kind' => 'object', 'open' => $open, 'close' => $close, 'start' => $open, 'end' => $close + 1, 'props' => $props];
    }

    /**
     * Parse an array node, recording each element's value span.
     *
     * @param  list<array> $tokens
     * @param  int $count
     * @param  int $pos
     * @param  string $source
     * @param  int $depth
     * @return array  Array node.
     * @throws PrismJsoncException
     */
    private static function parseArray(array $tokens, int $count, int &$pos, string $source, int $depth): array
    {
        $open = $tokens[$pos]['start'];
        $pos++;
        $elems = [];

        self::skipTrivia($tokens, $count, $pos);
        if ($pos < $count && $tokens[$pos]['kind'] === 'punct' && $tokens[$pos]['value'] === ']') {
            $close = $tokens[$pos]['start'];
            $pos++;

            return ['kind' => 'array', 'open' => $open, 'close' => $close, 'start' => $open, 'end' => $close + 1, 'elems' => $elems];
        }

        while (true) {
            $elems[] = self::parseValue($tokens, $count, $pos, $source, $depth + 1);

            self::skipTrivia($tokens, $count, $pos);
            if ($pos >= $count) {
                throw new PrismJsoncException('unterminated array');
            }

            $tok = $tokens[$pos];
            if ($tok['kind'] === 'punct' && $tok['value'] === ',') {
                $pos++;
                self::skipTrivia($tokens, $count, $pos);
                if ($pos < $count && $tokens[$pos]['kind'] === 'punct' && $tokens[$pos]['value'] === ']') {
                    break;
                }
                continue;
            }

            if ($tok['kind'] === 'punct' && $tok['value'] === ']') {
                break;
            }

            throw new PrismJsoncException('expected comma or closing bracket');
        }

        $close = $tokens[$pos]['start'];
        $pos++;

        return ['kind' => 'array', 'open' => $open, 'close' => $close, 'start' => $open, 'end' => $close + 1, 'elems' => $elems];
    }

    /**
     * Advance the cursor past any leading trivia tokens.
     *
     * @param  list<array> $tokens
     * @param  int $count
     * @param  int $pos
     * @return void
     */
    private static function skipTrivia(array $tokens, int $count, int &$pos): void
    {
        while ($pos < $count && $tokens[$pos]['kind'] === 'trivia') {
            $pos++;
        }
    }

    /**
     * Enforce the maximum nesting depth before opening a container.
     *
     * The custom parser owns the accepted-64/rejected-65 boundary; the
     * json_decode depth parameter is only a defensive safety net.
     *
     * @param  int $depth  Container nesting depth (root = 0).
     * @return void
     * @throws PrismJsoncException  When depth exceeds MAX_DEPTH.
     */
    private static function guardDepth(int $depth): void
    {
        if ($depth >= self::MAX_DEPTH) {
            throw new PrismJsoncException('maximum nesting depth exceeded');
        }
    }

    /**
     * Decode a property key token, resolving escape sequences for comparison.
     *
     * @param  string $source  Original source.
     * @param  int $start      Key token start offset.
     * @param  int $end        Key token end offset.
     * @return string  Decoded key.
     * @throws PrismJsoncException  If the key is malformed.
     */
    private static function decodeKey(string $source, int $start, int $end): string
    {
        $raw = \substr($source, $start, $end - $start);

        try {
            $decoded = json_decode($raw, false, self::MAX_DEPTH + 1, JSON_THROW_ON_ERROR);
        } catch (\JsonException $e) {
            throw new PrismJsoncException('malformed property key', 0, $e);
        }

        if (!\is_string($decoded)) {
            throw new PrismJsoncException('property key must be a string');
        }

        return $decoded;
    }

    /**
     * Validate a dot path and split it into segments.
     *
     * @param  string $dotPath
     * @return list<string>
     * @throws PrismJsoncException  If a segment is invalid.
     */
    private static function parseDotPath(string $dotPath): array
    {
        if ($dotPath === '') {
            throw new PrismJsoncException('empty dot path');
        }

        $segments = \explode('.', $dotPath);
        foreach ($segments as $segment) {
            if (!\preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $segment)) {
                throw new PrismJsoncException('invalid dot path segment: ' . $segment);
            }
        }

        return $segments;
    }

    /**
     * Resolve a dot path to its decoded value in the root object.
     *
     * @param  list<string> $segments
     * @return mixed  Decoded value, or null if absent.
     */
    private function resolveValue(array $segments): mixed
    {
        $current = $this->root;

        foreach ($segments as $segment) {
            if (!($current instanceof \stdClass) || !\property_exists($current, $segment)) {
                return null;
            }
            $current = $current->{$segment};
        }

        return $current;
    }

    /**
     * Compare two decoded values for idempotency by normalized JSON form.
     *
     * @param  mixed $a
     * @param  mixed $b
     * @return bool
     */
    private static function valuesEqual(mixed $a, mixed $b): bool
    {
        return self::encodeValue($a) === self::encodeValue($b);
    }

    /**
     * JSON-encode a replacement value with stable, unescaped output.
     *
     * @param  mixed $value
     * @return string
     * @throws PrismJsoncException  If the value cannot be encoded.
     */
    private static function encodeValue(mixed $value): string
    {
        try {
            return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        } catch (\JsonException $e) {
            throw new PrismJsoncException('cannot encode value', 0, $e);
        }
    }

    /**
     * Blank a byte range in cleaned, preserving newlines from the original.
     *
     * @param  string $cleaned  Cleaned copy (modified by-ref).
     * @param  string $source   Original source for newline detection.
     * @param  int $start       Range start offset.
     * @param  int $end         Range end offset.
     * @return void
     */
    private static function blankRange(string &$cleaned, string $source, int $start, int $end): void
    {
        for ($i = $start; $i < $end; $i++) {
            if ($source[$i] !== "\n") {
                $cleaned[$i] = ' ';
            }
        }
    }

    /**
     * Scan for the end of a block comment starting just after the opening slash.
     *
     * @param  string   $source  Original source.
     * @param  int      $start   Offset just past the opening {@literal *}/.
     * @param  int      $len     Source length.
     * @return int|null         Offset one past the closing {@literal *}{@literal /}, or null when unterminated.
     */
    private static function findBlockCommentEnd(string $source, int $start, int $len): ?int
    {
        $i = $start;

        while ($i < $len && !($source[$i] === '*' && $i + 1 < $len && $source[$i + 1] === '/')) {
            $i++;
        }

        if ($i >= $len) {
            return null;
        }

        return $i + 2;
    }

    /**
     * Whether a byte is insignificant whitespace.
     *
     * @param  string $ch
     * @return bool
     */
    private static function isWs(string $ch): bool
    {
        return $ch === ' ' || $ch === "\t" || $ch === "\n" || $ch === "\r";
    }

    /**
     * Whether a byte delimits a scalar token.
     *
     * @param  string $ch
     * @return bool
     */
    private static function isDelim(string $ch): bool
    {
        return self::isWs($ch)
            || $ch === '{' || $ch === '}' || $ch === '[' || $ch === ']'
            || $ch === ':' || $ch === ',' || $ch === '/' || $ch === '"';
    }
}


// vim: ft=php sts=4 sw=4 ts=4 et :
