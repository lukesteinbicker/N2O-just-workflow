# Data Investigation

How to find missing or wrong data in the database.

> **Note:** This project uses Neon database on the development branch. Connection string is in `DATABASE_URL_DEV` environment variable.
>
> **Important:** Update examples in this file as you add more tables to your schema. Currently, the database only has the `user` table (BetterAuth schema).

## Common Scenarios

| Scenario | Approach |
|----------|----------|
| Data not showing in UI | Check if data exists, verify query logic |
| Wrong data displayed | Trace data flow, check joins |
| Data missing after operation | Check if operation succeeded, verify application logic |
| Stale data | Check timestamps, caching |

## Finding Missing Data

### Step 1: Does the Data Exist?

```bash
# Check if record exists in table
psql $DATABASE_URL_DEV -c "
SELECT id, email, created_at
FROM user
WHERE id = 'expected-user-id';
"
```

Replace `user` and column names with your actual table and columns.

## Tracing Data Flow

### Check Related Tables

```bash
# Example: Join with related tables
psql $DATABASE_URL_DEV -c "
SELECT u.id, u.email, r.name as role_name
FROM user u
LEFT JOIN user_roles ur ON u.id = ur.user_id
LEFT JOIN roles r ON ur.role_id = r.id
WHERE u.id = 'user-id';
"
```

Update this example as you add more tables and relationships to your schema.

## Checking Operation Results

### Recent Records

```bash
# Find recently created records
psql $DATABASE_URL_DEV -c "
SELECT id, email, created_at
FROM user
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
"
```

Update table and column names to match your schema.

### Check for Errors in Logs

If an operation failed silently, check Neon dashboard for query logs:

```bash
# Check migration status for errors
cd packages/database && pnpm migrate:dev:status

# Or access Neon dashboard
# Visit https://console.neon.tech for query logs and errors
```

## Verifying Data Integrity

### Check Foreign Key References

```bash
# Find orphaned records (no matching parent)
# Example: Find records with broken foreign keys
psql $DATABASE_URL_DEV -c "
SELECT child.*
FROM child_table child
LEFT JOIN parent_table parent ON child.parent_id = parent.id
WHERE parent.id IS NULL;
"
```

Update table names as you add foreign key relationships.

### Check Required Fields

```bash
# Find records with missing required fields
psql $DATABASE_URL_DEV -c "
SELECT id, email
FROM user
WHERE email IS NULL OR email = '';
"
```

Update table and column names to match your schema.

## Common Data Issues

| Issue | Query to Debug |
|-------|---------------|
| Missing required field | `SELECT id, field FROM table WHERE field IS NULL` |
| Wrong status | `SELECT id, status FROM table WHERE id = 'x'` |
| Missing FK | Join with LEFT JOIN, check for NULLs |
| Duplicate | `SELECT email, COUNT(*) FROM user GROUP BY email HAVING COUNT(*) > 1` |

Update examples as you add more tables and fields to your schema.

## Tips

- Use LEFT JOIN to find missing relationships
- Check `created_at`/`updated_at` to understand when data changed
- Use `\x` in psql for easier reading of wide rows
- Update examples in this file as your schema grows
