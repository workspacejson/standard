# Summary

Describe what changed and why.

## Verification

- [ ] `pnpm -r typecheck`
- [ ] `pnpm -r build`
- [ ] `pnpm -r test`
- [ ] `pnpm run check:architecture`
- [ ] `pnpm run check:architecture:test`
- [ ] `pnpm run check:schema`
- [ ] `pnpm run check:examples`
- [ ] `pnpm run release:verify-packs`

## Boundary check

- [ ] No producer, host-integration or site code added (see `OWNERSHIP.md`)
- [ ] No `@marcelle-labs/*`, private Vreko source or `workspace.vreko.json` reference
- [ ] No prescriptive policy field and no daemon assumption introduced
- [ ] The four stable read paths are unchanged
- [ ] No new ambient `declare module` for a standard-owned package

## Release impact

- [ ] Schema bytes unchanged, or the change is intentional and described below
- [ ] Package name, version, `bin`, `exports` and `files` unchanged, or described below
- [ ] Changeset added if this is release-facing

## Notes

Call out any user-facing behavior, compatibility impact, or follow-up work.
