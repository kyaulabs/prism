<?php

declare(strict_types=1);

# $KYAULabs: PrismOpenCodeConfig.php kyau@cosmos.kyaulabs 2026/07/30 -0700 Exp $




namespace KYAULabs\Prism;

require_once __DIR__ . '/PrismJsoncException.php';

/**
 * Compose owned OpenCode runtime overrides from a resolved Prism manifest.
 *
 * {@see self::compose()} consumes a resolved manifest and an optional
 * inherited inline config string and produces compact, deterministic JSON.
 * It owns exactly two MCP `enabled` leaves, the membership of the
 * hard-pinned quota package, and exactly four literal
 * `agent.frontend.permission.edit` leaves (ADR-0045, ADR-0051); every other
 * key is preserved. Secrets from the resolved env are never copied into the
 * inline output. Malformed or incompatible input always fails closed.
 */
final class PrismOpenCodeConfig
{
    private const string QUOTA_PLUGIN = '@slkiser/opencode-quota';

    /** @var list<string> */
    private const array FRONTEND_EDIT_SUFFIXES = [
        '/*.php',
        '/**/*.php',
        '/*.html',
        '/**/*.html',
    ];

    /**
     * Compose OpenCode runtime config from a resolved manifest.
     *
     * @param  \stdClass    $resolved  Resolved Prism manifest (project + user overlay).
     * @param  string|null  $existing  Inherited OPENCODE_CONFIG_CONTENT value.
     * @return string  Compact, deterministic JSON.
     * @throws PrismJsoncException  On malformed or incompatible existing config.
     */
    public static function compose(\stdClass $resolved, ?string $existing): string
    {
        $config = self::decodeBase($existing);
        $mcp = self::objectProperty($config, 'mcp', 'mcp');
        $deepseek = self::objectProperty($mcp, 'deepseek-websearch', 'mcp.deepseek-websearch');
        $searxng = self::objectProperty($mcp, 'searxng', 'mcp.searxng');

        $deepseek->enabled = self::booleanPath($resolved, 'mcp.deepseek_websearch')
            && self::nonEmptyStringPath($resolved, 'env.deepseek_api_key');
        $searxng->enabled = self::booleanPath($resolved, 'mcp.searxng')
            && self::nonEmptyStringPath($resolved, 'env.searxng_url');

        self::applyFrontendEditRules(
            $config,
            self::requiredNonEmptyStringPath($resolved, 'app'),
        );

        self::applyQuota($config, self::booleanPath($resolved, 'plugins.opencode_quota'));

        return json_encode(
            $config,
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE,
        );
    }

    /**
     * Decode an inherited inline config string, returning an empty object for null/empty.
     *
     * @param  string|null $existing
     * @return \stdClass
     * @throws PrismJsoncException
     */
    private static function decodeBase(?string $existing): \stdClass
    {
        if ($existing === null || $existing === '') {
            return new \stdClass();
        }

        try {
            $decoded = json_decode($existing, false, 64, JSON_THROW_ON_ERROR);
        } catch (\JsonException $error) {
            throw new PrismJsoncException('OPENCODE_CONFIG_CONTENT is not valid JSON', 0, $error);
        }

        if (!($decoded instanceof \stdClass)) {
            throw new PrismJsoncException('OPENCODE_CONFIG_CONTENT must be a JSON object');
        }

        return $decoded;
    }

    /**
     * Ensure a property exists as a stdClass on a parent, creating it if absent.
     *
     * @param  \stdClass $parent
     * @param  string    $property
     * @param  string    $path     Dotted path for diagnostics.
     * @return \stdClass
     * @throws PrismJsoncException
     */
    private static function objectProperty(\stdClass $parent, string $property, string $path): \stdClass
    {
        if (!property_exists($parent, $property)) {
            $parent->{$property} = new \stdClass();
        }

        if (!($parent->{$property} instanceof \stdClass)) {
            throw new PrismJsoncException('inline config field ' . $path . ' must be an object');
        }

        return $parent->{$property};
    }

    /**
     * Resolve a dotted path to a boolean from the manifest, defaulting to false when absent.
     *
     * @param  \stdClass $root
     * @param  string    $path
     * @return bool
     * @throws PrismJsoncException
     */
    private static function booleanPath(\stdClass $root, string $path): bool
    {
        $value = self::path($root, $path);

        if ($value === null) {
            return false;
        }
        if (!is_bool($value)) {
            throw new PrismJsoncException('manifest field ' . $path . ' must be a boolean');
        }

        return $value;
    }

    /**
     * Whether a dotted path from the manifest points to a non-empty string.
     *
     * @param  \stdClass $root
     * @param  string    $path
     * @return bool      true when the path exists and holds a non-empty string.
     * @throws PrismJsoncException
     */
    private static function nonEmptyStringPath(\stdClass $root, string $path): bool
    {
        $value = self::path($root, $path);

        if ($value === null) {
            return false;
        }
        if (!is_string($value)) {
            throw new PrismJsoncException('manifest field ' . $path . ' must be a string');
        }

        return $value !== '';
    }

    /**
     * Walk a dotted path into a stdClass tree, returning null on any missing segment.
     *
     * @param  \stdClass $root
     * @param  string    $path
     * @return mixed     The resolved value, or null if any segment is absent.
     */
    private static function path(\stdClass $root, string $path): mixed
    {
        $value = $root;
        foreach (explode('.', $path) as $segment) {
            if (!($value instanceof \stdClass) || !property_exists($value, $segment)) {
                return null;
            }
            $value = $value->{$segment};
        }

        return $value;
    }

    /**
     * Resolve a required non-empty manifest string.
     *
     * @param  \stdClass $root
     * @param  string    $path
     * @return string
     * @throws PrismJsoncException
     */
    private static function requiredNonEmptyStringPath(\stdClass $root, string $path): string
    {
        $value = self::path($root, $path);

        if (!is_string($value) || $value === '') {
            throw new PrismJsoncException('manifest field ' . $path . ' must be a non-empty string');
        }

        return $value;
    }

    /**
     * Append the four owned literal app edit leaves after inherited edit rules.
     *
     * Existing copies of the owned leaves are removed first so catch-all or other
     * inherited rules cannot remain after them. Every unrelated key keeps its
     * value and relative order.
     *
     * @param  \stdClass $config
     * @param  string    $app
     * @return void
     * @throws PrismJsoncException
     */
    private static function applyFrontendEditRules(\stdClass $config, string $app): void
    {
        $agent = self::objectProperty($config, 'agent', 'agent');
        $frontend = self::objectProperty($agent, 'frontend', 'agent.frontend');
        $permission = self::objectProperty($frontend, 'permission', 'agent.frontend.permission');
        $edit = self::objectProperty($permission, 'edit', 'agent.frontend.permission.edit');

        foreach (self::FRONTEND_EDIT_SUFFIXES as $suffix) {
            unset($edit->{$app . $suffix});
        }
        foreach (self::FRONTEND_EDIT_SUFFIXES as $suffix) {
            $edit->{$app . $suffix} = 'allow';
        }
    }

    /**
     * Add or remove the quota plugin from the config's plugin array.
     *
     * @param  \stdClass $config
     * @param  bool      $enabled
     * @return void
     * @throws PrismJsoncException
     */
    private static function applyQuota(\stdClass $config, bool $enabled): void
    {
        if (!property_exists($config, 'plugin')) {
            if ($enabled) {
                $config->plugin = [self::QUOTA_PLUGIN];
            }
            return;
        }
        if (!is_array($config->plugin)) {
            throw new PrismJsoncException('inline config field plugin must be an array');
        }

        $plugins = [];
        foreach ($config->plugin as $entry) {
            $id = self::pluginId($entry);
            if ($id !== self::QUOTA_PLUGIN) {
                $plugins[] = $entry;
            }
        }
        if ($enabled) {
            $plugins[] = self::QUOTA_PLUGIN;
        }
        $config->plugin = $plugins;
    }

    /**
     * Extract a package identifier from a plugin entry.
     *
     * @param  mixed  $entry  A string or tuple-form array.
     * @return string
     * @throws PrismJsoncException
     */
    private static function pluginId(mixed $entry): string
    {
        if (is_string($entry)) {
            return $entry;
        }
        if (is_array($entry) && isset($entry[0]) && is_string($entry[0])) {
            return $entry[0];
        }

        throw new PrismJsoncException('inline config plugin entries must name a package');
    }
}






// vim: ft=php sts=4 sw=4 ts=4 et :
