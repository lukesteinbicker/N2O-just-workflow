# Cross-Cutting Error Patterns

This folder documents error patterns that span multiple layers.

---

## Error Propagation Pattern

Understanding how errors flow through the system helps identify the root cause:

```
UI Component
  ↓ calls
TanStack Query / useChat
  ↓ fetches
Server Action / API Route
  ↓ validates
createSecureAction (auth check)
  ↓ queries
PostgreSQL (database constraints)
  ↓ returns
Error bubbles up with layer-specific message
```

## Identifying Error Source by Message

| Error Pattern | Likely Source | Skill |
|---------------|---------------|-------|
| `Server error (401)` | Auth/session validation | `server-actions` |
| `Server error (500)` | Database or server logic | `database` or `server-actions` |
| `permission denied for table` | Database permissions | `database` |
| `NEXT_REDIRECT` | Auth redirect (not a real error) | `server-actions` |
| `Maximum update depth exceeded` | React infinite loop | `react-components` |
| `Hydration mismatch` | SSR/client mismatch | `react-components` |
| `connection refused` | Database connection issue | `debug` |

## Adding New Error Documentation

When documenting a new error:

1. Identify which layer owns the error
2. Create/update file in the appropriate location
3. Include:
   - Exact error message
   - What it means
   - Common causes
   - Diagnosis steps (database queries, Neon logs, schema inspection)
   - Resolution table
   - Related files
