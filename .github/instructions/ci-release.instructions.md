---
applyTo: ".github/workflows/**/*.yml,.github/workflows/**/*.yaml,.github/RELEASE-AUTHORITY.md,package.json,packages/*/package.json,.changeset/**/*,pnpm-lock.yaml,scripts/verify-package-tarball.mjs"
---

This repository currently has no package publication authority.

Do not add:

- an npm publishing workflow or step;
- `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or another publishing credential;
- publication for packages outside `@workspacejson/spec` and `@workspacejson/rules`;
- a second repository capable of publishing the same package.

A future authority transfer must be coordinated with revocation of the historical repository's authority and must update the architecture guards and their red tests deliberately.

Keep `@workspacejson/spec` and `@workspacejson/rules` in the fixed release group. An intra-repository `workspace:*` dependency is allowed only where packing rewrites and verifies it.

Keep workflow permissions least-privileged. Architecture and clean-room guards run before build and tests.

For manifest, lockfile, CI, or packaging changes, run:

```bash
pnpm install --frozen-lockfile
pnpm run check:architecture
pnpm run check:architecture:test
pnpm run build
pnpm run typecheck
pnpm run test
pnpm run release:verify-packs
```
