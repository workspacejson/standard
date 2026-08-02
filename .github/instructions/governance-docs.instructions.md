---
applyTo: "docs/**/*.md,README.md,CONTRIBUTING.md,GOVERNANCE.md,OWNERSHIP.md,MAINTAINERS.md,SUPPORT.md,SECURITY.md,CODE_OF_CONDUCT.md"
---

Public documentation must be understandable without access to private conversations or project-management systems.

- Do not put internal tracker identifiers in public prose except where explicitly permitted for ADR or migration provenance.
- Describe current repository and published behavior, not intended future state.
- State limitations and missing evidence plainly.
- Verify registry-defined package versions before citing them as published.
- Do not describe a proposed ADR as accepted authority.
- Do not silently edit an accepted ADR. Add a superseding ADR that names the earlier record.
- Keep normative requirements in the standard repository, not only on the website.
- Use repository-relative links and commands that actually exist.

Run:

```bash
pnpm run check:docs
pnpm run check:architecture
```
