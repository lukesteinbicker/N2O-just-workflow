# Database Setup for Debugging

How to connect to and manage Neon database (development branch) for debugging.

> **Note:** This project uses Neon database on the development branch. All database operations use `DATABASE_URL_DEV` environment variable.
>
> **Important:** Update examples in this file as you add more tables, functions, and triggers to your schema. Currently, the database only has the `user` table (BetterAuth schema).

## Database Architecture

This project uses:
- **Neon PostgreSQL** - Serverless PostgreSQL database
- **Development branch** - Always uses `DATABASE_URL_DEV` connection string
- **HTTP mode** - Configured for serverless connections (no WebSockets)

## Running Migrations

```bash
# Run all pending migrations
cd packages/database && pnpm migrate:dev

# Or from monorepo root
pnpm --filter @repo/database migrate:dev

# Check migration status
cd packages/database && pnpm migrate:dev:status

# Rollback last migration
cd packages/database && pnpm migrate:dev:down

# Rollback all migrations
cd packages/database && pnpm migrate:dev:down --all
```

## Seeding Database

```bash
# Seed development database
cd packages/database && pnpm seed:dev

# Or from monorepo root
pnpm --filter @repo/database seed:dev
```

## Resetting Database

```bash
# Rollback all migrations
cd packages/database && pnpm migrate:dev:down --all

# Re-run all migrations
cd packages/database && pnpm migrate:dev:up

# Seed database
cd packages/database && pnpm seed:dev
```

## Verifying Connection

```bash
# Test database connection
psql $DATABASE_URL_DEV -c "SELECT 1;"

# Check migration status
cd packages/database && pnpm migrate:dev:status

# View tables
psql $DATABASE_URL_DEV -c "\dt"
```

## Connection Issues?

### Check Environment Variables

```bash
# Verify connection string is set
echo $DATABASE_URL_DEV

# Check .env.local file (from monorepo root)
grep DATABASE_URL_DEV .env.local
```

### Common Causes

| Issue | Solution |
|-------|----------|
| Connection string not set | Set `DATABASE_URL_DEV` in `.env.local` |
| Invalid connection string | Verify format: `postgresql://user:password@host/database?sslmode=require` |
| Network connectivity | Check internet connection, Neon service status |
| Migration failed | Check migration logs, verify `DATABASE_URL_DEV_ADMIN` is set |

### Check Migration Logs

```bash
# View migration status
cd packages/database && pnpm migrate:dev:status

# Check Neon dashboard for query logs
# Access via https://console.neon.tech
```

## Environment Variables

Key environment variables for development:

```bash
# Development database connection (required)
DATABASE_URL_DEV=postgresql://user:password@host.neon.tech/database?sslmode=require

# Admin connection for migrations (required)
DATABASE_URL_DEV_ADMIN=postgresql://user:password@host.neon.tech/database?sslmode=require

# These are in .env.local at monorepo root
```

Verify your `.env.local` file has both `DATABASE_URL_DEV` and `DATABASE_URL_DEV_ADMIN` set before running migrations.

## Neon Dashboard

Access Neon dashboard for:
- Query logs and performance
- Database metrics
- SQL editor (alternative to psql)
- Branch management

Visit: https://console.neon.tech

