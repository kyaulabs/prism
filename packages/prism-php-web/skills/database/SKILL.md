---
name: database
description: Use when designing or modifying the MariaDB schema, writing SQL, or changing the <app>.sql convention. Covers schema design, migrations (no ORM), indexing/EXPLAIN, and SQL style. Injection prevention lives in security-coding.
---

This project uses **raw SQL and Aurora's SQL handler — no ORM**. Schema
discipline is manual.

## Schema file convention

- Project root: `<app>.sql` — the canonical schema (CREATE TABLE statements).
- Treat it as source of truth for the current schema shape.
- Apply schema changes via a migration file under `backend/migrations/` named
  `YYYYMMDDThhmmss_<short_description>.sql` (ISO-8601 timestamp prefix). See
  "Migrations" below.

## Schema design

- `InnoDB` engine, `utf8mb4` charset, `utf8mb4_unicode_ci` collation — on every
  table. Do not rely on server defaults.
- Surrogate primary key: `id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY`.
- Foreign keys explicit, with `ON DELETE` and `ON UPDATE` specified (default
  `RESTRICT`; use `CASCADE` only when you mean it).
- `NOT NULL` by default. Allow NULL only when the absence of a value is
  meaningful and distinct from the default.
- Timestamps: `created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP` and
  `updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE
  CURRENT_TIMESTAMP`.
- Money: store as integer minor units (cents), never FLOAT/DECIMAL for
  currency unless you have a specific reason.
- Enums: prefer a lookup table with a FK over `ENUM` when the set of values
  may grow.

```sql
CREATE TABLE `orders` (
    `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id`    BIGINT UNSIGNED NOT NULL,
    `total_cents` BIGINT         NOT NULL,
    `status`     VARCHAR(32)    NOT NULL DEFAULT 'pending',
    `created_at` TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_orders_user` (`user_id`),
    CONSTRAINT `fk_orders_user`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

## Migrations (no ORM)

- One migration per change, timestamp-prefixed: `20260702T214200_add_orders_table.sql`.
- Migrations are **forward-only**. Do not write down-migrations; revert by
  writing a new forward migration that undoes the prior one.
- Each migration must be idempotent where practical (use `IF NOT EXISTS` on
  creates, guard alters).
- Apply migrations in timestamp order; record applied migrations in a
  `schema_migrations` table.
- After applying, regenerate or update `<app>.sql` to reflect the new shape.

## Indexing

- Index foreign keys unless the table is tiny.
- Index columns used in `WHERE`, `JOIN`, and `ORDER BY` for hot queries.
- Prefer composite indexes ordered by selectivity (most-selective first), but
  only when the query actually filters on the leading column(s).
- Do not index low-cardinality columns in isolation (a boolean alone is
  useless).
- Verify with `EXPLAIN` before merging — look for `type: ALL` (full scan) on
  large tables.

```sql
EXPLAIN SELECT * FROM orders WHERE user_id = 123 ORDER BY created_at DESC;
```

## SQL style

- Keywords UPPERCASE, identifiers `backtick_quoted`.
- One column per line in multi-line statements.
- End every statement with `;`.
- `SELECT` explicit columns, never `SELECT *` in production code (schema
  changes silently break it).
- `INSERT` always lists columns: `INSERT INTO t (a, b) VALUES (?, ?)`.
- Use `... IN (...)` for small sets; for large sets, a join against a values
  table or a temp table.

## Rules

- Never store secrets in the DB schema (no password column holds plaintext —
  see `security-coding`).
- Never run write queries while using the `debug` skill — suggest read-only
  verification only.
- Back up before destructive migrations in production.
- Keep `<app>.sql` and the migration files in sync — both are committed.
