# Applying migrations in this repo

This InsForge project's plan does not support the `insforge db migrations` tool
(`Database migrations are not available on this backend`). Every file in this
directory is applied by hand, as raw SQL, directly against the live database.

## After adding or altering a column/table

PostgREST (InsForge's REST layer) caches the database schema and does not notice DDL
run outside its own migration path. If you add a column and then immediately hit
`Could not find the 'x' column of 'y' in the schema cache` from the app even though
`select column_name from information_schema.columns ...` shows the column exists,
this is why — the column is real, the REST layer just doesn't know about it yet.

**Always run this immediately after applying a migration:**

```sql
NOTIFY pgrst, 'reload schema';
```

This has already caused at least one real production bug (`ppe_stock.size`, August
2026) and is a standing risk for every migration in this directory that was applied
before this note existed. If a "column not found in schema cache" error shows up for
a column that demonstrably exists, this is the first thing to try.

## Applying a migration via the InsForge CLI

`npx @insforge/cli db query "<sql>"` chokes on SQL comments (`--` lines get parsed as
CLI flags). Strip comments first:

```bash
grep -v '^--' path/to/migration.sql | grep -v '^\s*$' > /tmp/clean.sql
SQL=$(cat /tmp/clean.sql)
npx @insforge/cli db query "$SQL" --json
```

Add `--unrestricted` if the migration references a system schema (e.g. `auth.users`).

Then reload the schema cache as above, and verify the change landed with a direct
`information_schema`/`pg_policies`/`pg_proc` query before considering it applied.
