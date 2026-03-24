# Debugging: React Infinite Loop in useEffect

## Symptom

```
Error: Maximum update depth exceeded. This can happen when a component
calls setState inside useEffect, but useEffect either doesn't have a
dependency array, or one of the dependencies changes on every render.
```

**Behavior**: Page fails to load, may show error boundary, or browser becomes unresponsive.

---

## Root Cause

Objects or arrays in `useEffect` dependency arrays cause infinite re-renders because JavaScript creates **new references** on each render, even if the content is identical.

```tsx
// Every render: {} !== {} (different references)
const obj = { foo: 'bar' };

useEffect(() => {
  doSomething(obj);
}, [obj]); // obj is "new" every render -> effect runs -> triggers re-render -> repeat
```

---

## Detection Strategy

1. **Check console** for "Maximum update depth exceeded" error
2. **Identify the useEffect** with unstable dependencies
3. **Trace each dependency** - is it created fresh each render?

Common culprits:
- Object literals: `{ key: value }`
- Array literals: `[item1, item2]`
- Function returns: `useMyHook()` returning new object
- Inline callbacks passed as props

---

## Solutions (in order of preference)

### Solution 1: Use Zustand/store selectors directly

**When it works**: The unstable reference is a store action (function from a store).

**Why preferred**: Store actions are inherently stable - no memoization needed.

```tsx
// BROKEN - wrapping stable store action makes it unstable
function useRegisterPageContext() {
  const context = useContext(PageContextContext);

  const register = useCallback((data) => {
    context?.register(data);  // context changes -> register changes
  }, [context]);  // <-- context changes when store updates!

  return { register };
}

// FIXED - use store selector directly
function useRegisterPageContext() {
  const register = usePageContextStore((state) => state.register);
  const clear = usePageContextStore((state) => state.clear);
  return { register, clear };  // These never change
}
```

---

### Solution 2: Create the object inside the effect

**When it works**: The object is only needed inside the effect.

```tsx
// BROKEN - object created outside effect
function MyComponent({ userId }) {
  const config = { userId, timestamp: Date.now() };  // New every render

  useEffect(() => {
    initializeWithConfig(config);
  }, [config]);  // Infinite loop!
}

// FIXED - create inside effect
function MyComponent({ userId }) {
  useEffect(() => {
    const config = { userId, timestamp: Date.now() };
    initializeWithConfig(config);
  }, [userId]);  // Primitive dependency, stable
}
```

---

### Solution 3: useMemo with primitive dependencies

**When it works**: The object must exist outside the effect AND solutions 1-2 don't apply.

```tsx
// BROKEN - inline object in hook call
function CampaignPageWrapper({ campaignId }) {
  const { data: campaign } = useGetCampaign({ campaignId });

  useRegisterCampaignContext({
    campaign: campaign ? {           // New object every render!
      id: campaign.id,
      name: campaign.name,
    } : null,
  });
}

// FIXED - memoize with primitive dependencies
function CampaignPageWrapper({ campaignId }) {
  const { data: campaign } = useGetCampaign({ campaignId });

  const campaignContext = useMemo(
    () => campaign ? {
      id: campaign.id,
      name: campaign.name,
    } : null,
    [campaign?.id, campaign?.name]  // Primitives, not objects
  );

  useRegisterCampaignContext({ campaign: campaignContext });
}
```

---

### Solution 4: useCallback for function returns

**When it works**: A custom hook returns functions that are used as dependencies.

```tsx
// BROKEN - new object with functions every render
function useClientHooks() {
  const handleA = useCallback(() => { /* ... */ }, []);
  const handleB = useCallback(() => { /* ... */ }, []);

  return {  // New object every render!
    actionA: handleA,
    actionB: handleB,
  };
}

// FIXED - memoize the return object
function useClientHooks() {
  const handleA = useCallback(() => { /* ... */ }, []);
  const handleB = useCallback(() => { /* ... */ }, []);

  return useMemo(
    () => ({ actionA: handleA, actionB: handleB }),
    [handleA, handleB]
  );
}
```

---

## Prevention Checklist

Before adding a useEffect:

- [ ] Are all dependencies primitives (string, number, boolean)?
- [ ] If objects/arrays, are they from a store selector?
- [ ] If from a custom hook, does that hook memoize its return?
- [ ] If inline, can I create inside the effect instead?
- [ ] If none of the above, have I wrapped in useMemo with primitive deps?

---

## Escalate When

- The fix requires understanding complex component architecture -> `building-react-components`
- The fix requires changing Zustand store configuration -> `building-react-components`
- Multiple components affected -> `building-react-components`

## What You Can Fix

- Identifying which useEffect has unstable deps
- Applying useMemo/useCallback patterns
- Moving object creation inside useEffect
- Switching to store selectors

---

## Related

- **building-react-components** for component architecture patterns
- **building-react-components** for complex state management issues
- React 19's compiler will auto-memoize, reducing need for manual fixes
