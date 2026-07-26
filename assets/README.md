# Assets

Brand assets used by this repository's documentation.

| File | Dimensions | Used by |
| -- | -- | -- |
| `workspace-json-lockup-light.png` | 1520 × 360 | Package READMEs, light interfaces |
| `workspace-json-lockup-dark.png` | 1520 × 360 | Package READMEs, dark interfaces |

Both are referenced through a `<picture>` element with a
`prefers-color-scheme: dark` source, so the lockup stays legible in either
theme, with the light variant as the fallback `<img>`.

## Why these are vendored

The package READMEs previously loaded these images from the historical
repository this one was extracted from. That made this repository's rendered
documentation depend on a repository that is being frozen — a cross-repository
reference that would break the moment its visibility or default branch changed.

Vendoring them removes that dependency. The images are referenced by
repository-relative path, which GitHub resolves directly.

**Known limitation.** npm resolves relative image paths in a README against the
`repository` field of the package manifest. That resolution requires the
repository to be publicly readable. Until this repository's visibility changes —
a separate authority action — the lockup will not render on the npm package
pages, though it renders correctly on GitHub. This is recorded rather than
worked around, because the alternatives are worse: an absolute URL to a frozen
repository reintroduces the dependency, and a URL to this repository resolves to
nothing while it is private.

These assets are not included in either package tarball. Neither package's
`files` list covers `assets`, so they add nothing to published package weight.
