# Database Connection Issues

Debugging Neon database connection, migration, and query issues.

> **Note:** This project uses Neon database on the development branch. Connection string is in `DATABASE_URL_DEV` environment variable.
>
> **Important:** Update examples in this file as you add more tables, functions, and triggers to your schema. Currently, the database only has the `user` table (BetterAuth schema).

## Quick Diagnostics

### Check Connection String

```bash
# Verify connection string is set
echo $DATABASE_URL_DEV

# Check .env.local file (from monorepo root)
grep DATABASE_URL_DEV .env.local
```

Expected format: `postgresql://user:password@host.neon.tech/database?sslmode=require`

### Test Database Connection

```bash
# Simple connection test
psql $DATABASE_URL_DEV -c "SELECT 1;"

# If psql not installed, use Neon SQL Editor
# Access via https://console.neon.tech
```

If this fails, check connection string and network connectivity.

### Check Migration Status

```bash
# View migration status
cd packages/database && pnpm migrate:dev:status

# Check for pending migrations
cd packages/database && pnpm migrate:dev:status | grep -i pending
```

## Connection Issues

### Connection Refused

**Symptoms:**
- `psql: error: connection refused`
- `could not connect to server`

**Diagnosis:**
```bash
# Verify connection string format
echo $DATABASE_URL_DEV

# Test connection
psql $DATABASE_URL_DEV -c "SELECT 1;"
```

**Fixes:**
- Verify `DATABASE_URL_DEV` is set in `.env.local`
- Check connection string format (should include `?sslmode=require`)
- Verify Neon service status (check Neon dashboard)
- Check network connectivity

### Connection Timeout

**Symptoms:**
- `timeout expired`
- Connection hangs

**Diagnosis:**
```bash
# Test with timeout
timeout 5 psql $DATABASE_URL_DEV -c "SELECT 1;"
```

**Fixes:**
- Check internet connection
- Verify Neon service status
- Check firewall/proxy settings
- Try Neon SQL Editor as alternative

### Authentication Failed

**Symptoms:**
- `password authentication failed`
- `authentication failed`

**Diagnosis:**
```bash
# Verify connection string has correct credentials
echo $DATABASE_URL_DEV | grep -o '://[^@]*@'
```

**Fixes:**
- Regenerate connection string in Neon dashboard
- Update `DATABASE_URL_DEV` in `.env.local`
- Verify admin connection string for migrations: `DATABASE_URL_DEV_ADMIN`

## Migration Issues

### Migration Failed

**Symptoms:**
- Migration command exits with error
- Tables not created/updated

**Diagnosis:**
```bash
# Check migration status
cd packages/database && pnpm migrate:dev:status

# Check for errors in output
cd packages/database && pnpm migrate:dev:up 2>&1 | grep -i error
```

**Fixes:**
- Verify `DATABASE_URL_DEV_ADMIN` is set (required for migrations)
- Check Neon dashboard for query logs
- Review migration file syntax
- Rollback and retry: `cd packages/database && pnpm migrate:dev:down` then `pnpm migrate:dev:up`

### Migration Already Applied

**Symptoms:**
- `Migration already applied` error
- Migration status shows applied but schema unchanged

**Diagnosis:**
```bash
# Check migration status
cd packages/database && pnpm migrate:dev:status
```

**Fixes:**
- Verify migration actually ran (check tables in Neon dashboard)
- If migration failed partway, may need manual cleanup
- Check Neon query logs for errors during migration

## Query Issues

### Query Timeout

**Symptoms:**
- Queries hang or timeout
- Slow query performance

**Diagnosis:**
```bash
# Test simple query
psql $DATABASE_URL_DEV -c "SELECT 1;"

# Check query performance in Neon dashboard
# Access via https://console.neon.tech
```

**Fixes:**
- Check Neon dashboard for query performance metrics
- Review query execution plans
- Check for missing indexes
- Verify development branch is active (not paused)

### Permission Denied

**Symptoms:**
- `permission denied for table`
- `permission denied for schema`

**Diagnosis:**
```bash
# Check table permissions
psql $DATABASE_URL_DEV -c "\dp your_table"

# Check schema permissions
psql $DATABASE_URL_DEV -c "\dn+"
```

**Fixes:**
- Verify connection string has correct permissions
- Use admin connection for schema changes: `DATABASE_URL_DEV_ADMIN`
- Check if table exists: `psql $DATABASE_URL_DEV -c "\dt"`

## Common Issues Table

| Issue | Check | Fix |
|-------|-------|-----|
| Connection refused | `echo $DATABASE_URL_DEV` | Set `DATABASE_URL_DEV` in `.env.local` |
| Connection timeout | Test with `psql` | Check network, Neon service status |
| Authentication failed | Verify connection string | Regenerate in Neon dashboard |
| Migration failed | `cd packages/database && pnpm migrate:dev:status` | Check `DATABASE_URL_DEV_ADMIN`, review logs |
| Query timeout | Check Neon dashboard | Review query performance, indexes |
| Permission denied | Check table permissions | Verify connection string, use admin connection for schema changes |

## Viewing Logs

### Neon Dashboard

Access Neon dashboard for:
- Query logs and performance
- Error messages
- Connection metrics
- Migration history

Visit: https://console.neon.tech

### Migration Logs

```bash
# View migration output
cd packages/database && pnpm migrate:dev:up

# Check migration status with details
cd packages/database && pnpm migrate:dev:status
```

## Full Reset

When all else fails:

```bash
# Rollback all migrations
cd packages/database && pnpm migrate:dev:down --all

# Re-run all migrations
cd packages/database && pnpm migrate:dev:up

# Seed database
cd packages/database && pnpm seed:dev
```

**Note:** This will reset your development database. Only use on development branch.

