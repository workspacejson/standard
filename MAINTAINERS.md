# Maintainers

Maintainers review and merge changes to this repository and are accountable for
the compatibility guarantees described in [`GOVERNANCE.md`](./GOVERNANCE.md).

| Maintainer | GitHub | Areas |
| -- | -- | -- |
| Qwynn Marcelle | [@qmarcelle](https://github.com/qmarcelle) | specification, schema, validation semantics, rules engine, governance, releases |

This list is short because it is accurate. It reflects who actually reviews and
merges, not who is nominally associated with the project.

`.github/CODEOWNERS` mirrors this list and is what GitHub uses to request
reviews automatically. The two must be kept in step.

## Becoming a maintainer

There is no application process. Maintainership follows sustained review-quality
contribution — reviewing others' changes, not only landing your own — and is
proposed by an existing maintainer in a pull request that updates both this file
and `.github/CODEOWNERS`.

## Escalation

Architecture decision records name an owner who breaks ties on that decision. See
[`docs/adr/README.md`](./docs/adr/README.md).

For security reports, follow [`SECURITY.md`](./SECURITY.md) rather than
contacting a maintainer directly through a public channel.
