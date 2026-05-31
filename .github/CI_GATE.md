# CI Gate

Every push and pull request to `main` runs three required jobs in
`.github/workflows/ci.yml`:

| Job   | What it covers                                                            |
|-------|---------------------------------------------------------------------------|
| build | `vite build` — catches type/import/asset regressions                      |
| unit  | `vitest run` — component + lib unit tests                                 |
| e2e   | `playwright test` — smoke (all public routes) + consent flow regression   |

## Blocking merges

To actually block merges on failure, enable branch protection once in the
GitHub repo settings:

1. **Settings → Branches → Add branch protection rule**
2. Branch name pattern: `main`
3. Tick **Require status checks to pass before merging**
4. Select required checks: **build**, **unit**, **e2e**
5. (Recommended) Tick **Require branches to be up to date before merging**

Once enabled, GitHub will refuse to merge any PR where any of the three
checks fail or are missing.

## What the e2e gate guarantees

- `e2e/routes.spec.ts` — every public route renders with no console errors
  and no runtime exceptions; every protected route still redirects
  unauthenticated users to `/auth`.
- `e2e/consent.spec.ts` — GDPR consent banner shows on first visit,
  accept/reject persist correctly, decision survives reload, and the
  signup form stays disabled until all three legal acknowledgements are
  ticked.
- `e2e/avatar.spec.ts` — header user chip stays visible / contrasts with
  the header background on first paint.

If you add a new public route or a new consent-bearing flow, add a case
to the matching spec so the gate keeps protecting it.