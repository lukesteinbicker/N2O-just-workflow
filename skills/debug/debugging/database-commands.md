# Database Commands for Debugging

Quick reference for investigating issues using Neon database (development branch). These commands help you understand system behavior before writing tests.

> **Note:** This project uses Neon database on the development branch. Connection string is in `DATABASE_URL_DEV` environment variable.
>
> **Important:** Update examples in this file as you add more tables, functions, and triggers to your schema. Currently, the database only has the `user` table (BetterAuth schema).

## Contents

- [Database Access](#database-access)
- [Common Debugging Queries](#common-debugging-queries)
- [Extension Info](#extension-info)
- [Troubleshooting](#troubleshooting)
- [Tips](#tips)

## Database Access

### Interactive Session

```bash
# Option 1: Direct psql connection (requires psql installed locally)
psql $DATABASE_URL_DEV

# Option 2: Using connection string from .env.local
psql "$(grep DATABASE_URL_DEV .env.local | cut -d '=' -f2-)"

# Option 3: Neon SQL Editor (web-based)
# Access via Neon dashboard at https://console.neon.tech
```

### One-off Query

```bash
# Using psql with connection string
psql $DATABASE_URL_DEV -c "SELECT ..."

# Or from .env.local
psql "$(grep DATABASE_URL_DEV .env.local | cut -d '=' -f2-)" -c "SELECT ..."
```

### Multi-line SQL (heredoc)

```bash
psql $DATABASE_URL_DEV << 'EOF'
SELECT
  id,
  name,
  status,
  created_at
FROM your_table
ORDER BY created_at DESC
LIMIT 5;
EOF
```

## Common Debugging Queries

### Check Recent Data

```bash
# Recent records from a table
psql $DATABASE_URL_DEV -c "
SELECT id, name, status, created_at
FROM your_table
ORDER BY created_at DESC LIMIT 5;
"
```

### Check User/Auth

```bash
# Adapt to your auth system (BetterAuth, Supabase Auth, custom)
psql $DATABASE_URL_DEV -c "
SELECT email, id, created_at
FROM users
ORDER BY created_at DESC LIMIT 5;
"
```

### Check Table Schema

```bash
# List all tables
psql $DATABASE_URL_DEV -c "\dt"

# Describe a specific table
psql $DATABASE_URL_DEV -c "\d your_table"
```

> **Note:** Update examples in this file as you add more tables to your schema. Currently, the database only has the `user` table (BetterAuth schema).

## Extension Info

```bash
# Check installed extensions
psql $DATABASE_URL_DEV -c "
SELECT extname, extversion FROM pg_extension
ORDER BY extname;
"
```

## Troubleshooting

### Connection Issues

```bash
# Verify connection string is set
echo $DATABASE_URL_DEV

# Test connection
psql $DATABASE_URL_DEV -c "SELECT 1;"

# Check migration status
cd packages/database && pnpm migrate:dev:status
```

### Reset Database

```bash
# Run migrations (resets schema)
cd packages/database && pnpm migrate:dev:down --all
cd packages/database && pnpm migrate:dev:up

# Seed database
cd packages/database && pnpm seed:dev
```

### Migration Issues

```bash
# Check migration status
cd packages/database && pnpm migrate:dev:status

# Rollback last migration
cd packages/database && pnpm migrate:dev:down

# View migration logs in Neon dashboard
# Access via https://console.neon.tech
```

## Tips

- Use Neon SQL Editor for complex queries (web-based, no local psql needed)
- Connection string format: `postgresql://user:password@host/database?sslmode=require`
- Use heredocs for multi-line SQL (cleaner than escaped newlines)
- Use `\x` in psql for vertical output on wide tables
- Check Neon dashboard for query performance and logs
- Development branch is always used (configured via `DATABASE_URL_DEV`)

