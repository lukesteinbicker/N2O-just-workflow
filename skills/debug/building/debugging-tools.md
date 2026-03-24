# Debugging Tools Reference

Tools and commands for investigating system issues.

> **Note:** This project uses Neon database on the development branch. Connection string is in `DATABASE_URL_DEV` environment variable.
>
> **Important:** Update examples in this file as you add more tables, functions, and triggers to your schema. Currently, the database only has the `user` table (BetterAuth schema).

## psql (PostgreSQL CLI)

### Interactive Session

```bash
# Direct psql connection
psql $DATABASE_URL_DEV

# Or from .env.local
psql "$(grep DATABASE_URL_DEV .env.local | cut -d '=' -f2-)"

# Or use Neon SQL Editor (web-based)
# Access via https://console.neon.tech
```

Useful psql commands inside the session:

| Command | Description |
|---------|-------------|
| `\dt` | List all tables |
| `\dt public.*` | List tables in public schema |
| `\d table_name` | Describe table structure |
| `\df+ function_name` | Describe function with source |
| `\x` | Toggle expanded output (vertical) |
| `\q` | Quit |

### One-off Query

```bash
psql $DATABASE_URL_DEV -c "SELECT ..."
```

### Multi-line SQL with Heredoc

```bash
psql $DATABASE_URL_DEV << 'EOF'
SELECT
  id,
  email,
  created_at
FROM user
ORDER BY created_at DESC
LIMIT 5;
EOF
```

> **Note:** Update examples as you add more tables to your schema. Currently, the database only has the `user` table (BetterAuth schema).

## Database Logs

### View Query Logs

```bash
# Check migration status (includes recent migration logs)
cd packages/database && pnpm migrate:dev:status

# View Neon dashboard for query logs
# Access via https://console.neon.tech
```

### Neon Dashboard

Access Neon dashboard for:
- Query performance metrics
- Error logs
- Connection metrics
- Migration history

Visit: https://console.neon.tech

## Extension Info

### Check Installed Extensions

```bash
psql $DATABASE_URL_DEV -c "
SELECT extname, extversion
FROM pg_extension
ORDER BY extname;
"
```

### Check Specific Extensions

```bash
psql $DATABASE_URL_DEV -c "
SELECT extname, extversion FROM pg_extension
WHERE extname IN ('pgmq', 'pg_cron', 'pg_net', 'http');
"
```

## Function Inspection

> **Note:** Currently, the database doesn't have custom functions. Update this section as you add database functions to your schema.

### View Function Signature

```bash
psql $DATABASE_URL_DEV -c "\df+ public.function_name"
```

### View Function Source

```bash
psql $DATABASE_URL_DEV -c "
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'function_name';
"
```

## Table Inspection

### View Table Schema

```bash
psql $DATABASE_URL_DEV -c "\d public.table_name"
```

### View Indexes

```bash
psql $DATABASE_URL_DEV -c "
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'table_name';
"
```

### View Constraints

```bash
psql $DATABASE_URL_DEV -c "
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.table_name'::regclass;
"
```

## Tips

- Use Neon SQL Editor for complex queries (web-based, no local psql needed)
- Connection string format: `postgresql://user:password@host/database?sslmode=require`
- Use heredocs for multi-line SQL (cleaner than escaped newlines)
- Use `\x` in psql for vertical output on wide tables
- Check Neon dashboard for query performance and logs
- Development branch is always used (configured via `DATABASE_URL_DEV`)
