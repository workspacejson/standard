# Assets

Brand assets used by this repository's documentation.

## Package README lockups

| File | Dimensions | Used by |
| -- | -- | -- |
| `workspace-json-lockup-light.png` | 1520 × 360 | Package READMEs, light interfaces |
| `workspace-json-lockup-dark.png` | 1520 × 360 | Package READMEs, dark interfaces |

Both are referenced through a `<picture>` element with a
`prefers-color-scheme: dark` source, so the lockup stays legible in either
theme, with the light variant as the fallback `<img>`.

## Campaign asset pack

Four concepts across seven files, produced for the launch campaign.
`PRODUCTION-RECEIPT.md` records the source file, the preflight results, and the
deviations that were recorded rather than resolved locally.

| File | Concept | Exported | 1x canvas | Theme |
| -- | -- | -- | -- | -- |
| `readme-hero-dark.png` | README hero, above the fold | 2560 × 800 | 1280 × 400 | dark (canonical) |
| `readme-hero-light.png` | README hero | 2560 × 800 | 1280 × 400 | light |
| `surfaces-dark.png` | Four stable surfaces | 2560 × 1120 | 1280 × 560 | dark |
| `surfaces-light.png` | Four stable surfaces | 2560 × 1120 | 1280 × 560 | light |
| `topology-dark.png` | Producer → committed artifact → consumer | 2560 × 1280 | 1280 × 640 | dark |
| `topology-light.png` | Producer → committed artifact → consumer | 2560 × 1280 | 1280 × 640 | light |
| `social-card.png` | GitHub / social unfurl | 1200 × 630 | 1200 × 630 | dark only |

Each export is exactly 2x its 1x canvas, except the social card, which is
authored at its final unfurl size. The three README pairs are referenced at
their 1x widths through a `<picture>` element, on the same
`prefers-color-scheme: dark` pattern as the lockups. The social card is dark
only by design and takes no light pair.

Alt text for all four concepts is recorded in `PRODUCTION-RECEIPT.md` § 3 and
should be used verbatim, since each string states the claim the asset makes.

These files are staged for README integration, which is tracked separately. They
are not yet referenced by any README in this repository.

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
