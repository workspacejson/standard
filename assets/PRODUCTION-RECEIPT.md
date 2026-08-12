# GTM-31 asset pack — production receipt

Produced against: GTM-31 asset design guide v1.0 (visual authority), workspace.json
50-star campaign canonical launch contract + GTM-30 (content authority), and
`workspacejson/standard@main` (normative facts). Source file for all seven
exports: `GTM-31 Asset Pack.dc.html`.

## 1. Replacement matrix

| Existing file | Disposition | Reason |
| -- | -- | -- |
| `assets/workspace-json-lockup-dark.png` (1520 x 360) | **Keep as-is** | Package-README lockup, not one of the four frozen deliverables. Does not conflict with the contract or the guide. |
| `assets/workspace-json-lockup-light.png` (1520 x 360) | **Keep as-is** | Same. |
| `assets/README.md` | **Revise** | Must list the seven new files, their canvases and their `picture` pairing. Not rewritten here: it is repo prose, and GTM-32 owns the README integration. |
| Root `README.md` hero block | **Replace (GTM-32)** | It currently loads the lockup from `raw.githubusercontent.com/workspace-json/agents-audit/...`: a cross-repository reference to the frozen historical repo, and a pre-canon org name. Flagged, not edited, because README integration is GTM-32. |
| `assets/og.png` (2000 x 2000), `assets/logo.png` | **Not present** | The guide's section 01 inventory describes the design-system kit, not this repository. `workspacejson/standard@main` has no `og.png`. Nothing to remove. |
| Kit `assets/logo.png` (the bare `.json` wordmark) | **Superseded as the source asset** | The identity in circulation on workspacejson.dev is the full `workspace.json` lockup (white `workspace`, emerald `.json`). The lockup was cut from the live `og.png` and is the only source asset carried forward, as `lockup-dark.png` / `lockup-light.png`. See deviation 6. |
| Pre-canon exploratory hero/diagram assets | **None found** | The repository holds no other image assets. No obsolete flagship version exists to retire. |

## 2. File manifest

| File | Purpose | Export | 1x canvas | Theme | Replaces |
| -- | -- | -- | -- | -- | -- |
| `readme-hero-dark.png` | README hero, above the fold | 2560 x 800 | 1280 x 400 | dark (canonical) | new |
| `readme-hero-light.png` | Light pair for the hero | 2560 x 800 | 1280 x 400 | light | new |
| `surfaces-dark.png` | "What workspace.json adds", four stable surfaces | 2560 x 1120 | 1280 x 560 | dark | new |
| `surfaces-light.png` | Light pair | 2560 x 1120 | 1280 x 560 | light | new |
| `topology-dark.png` | Producer to committed artifact to consumer | 2560 x 1280 | 1280 x 640 | dark | new |
| `topology-light.png` | Light pair | 2560 x 1280 | 1280 x 640 | light | new |
| `social-card.png` | GitHub / social unfurl | 1200 x 630 | 1200 x 630 | dark only | new |

Reference the three README pairs at their 1x widths through a `picture` element,
per guide section 09.

## 3. Alt text

- **readme-hero:** "The source tree shows what exists now. workspace.json gives repository intelligence a committed, portable contract. The workspace.json lockup sits above the title." (164)
- **surfaces:** "workspace.json carries four stable read paths consumers can rely on. Four cards in a row: recorded fragility, recorded co-change, file index, framework manifest." (163)
- **topology:** "Producers write .agents/workspace.json and consumers read it. Three columns: generators, the committed file, readers." (118)
- **social-card:** "The source tree shows what exists now. workspace.json, an Apache-2.0 open standard for committed repository intelligence. Wordmark above the title." (150)

## 4. Preflight, per file

| Check | Result |
| -- | -- |
| Exported dimensions exactly 2x canvas, or 1200 x 630 social | Pass, all seven |
| PNG-24, sRGB, alpha channel flattened to opaque | Pass |
| Size ceilings (400 KB README, 300 KB social) | Pass: 340 / 169 / 338 / 262 / 376 / 275 / 124 KB |
| Nothing below 13px at 1x | Pass |
| One accent role per asset | Hero and social: the clipped title. Topology: the artifact node. Surfaces: the emerald top hairline. See deviation 3. |
| Node edges and baselines on the 8px grid | Pass |
| Edges orthogonal, single arrowhead at target end | Pass, three edges, all left to right |
| No vendor name, company name or logo in a node | Pass. Host platforms appear only as 13px mono captions beneath their plugin node, per guide 07.1 |
| Light pair exists | Pass for the three README assets; social is dark only per guide 09 |
| Alt text under 200 characters, states the claim | Pass |
| No unpublished number on any asset | Pass. Only `spec v0.4`, which `README.md` states |
| No adoption, endorsement, benchmark or predictive claim | Pass. No star CTA in the banner, per guide 08 and GTM-33 |

## 5. Deviations and conflicts to rule on

These are recorded rather than resolved locally.

1. **Field-path plates render at 13px, not the 14px of guide section 03.**
   `generated.frameworkManifest` is 27 monospace characters. A 270px card with
   24px padding leaves 222px, and 27 characters at 14px Geist Mono need roughly
   227px before plate padding. The path is canonical and cannot be cut, so the
   plate drops to the 13px floor with -0.03em tracking. Sections 03, 05 and 08
   are jointly unsatisfiable at 14px.

2. **`manual.coChangePatterns` sets to four lines, one over the section 06
   maximum.** Its gloss is a canonical string from the launch contract, so
   cutting it would be a local rewrite of canon. Either the gloss needs a
   shorter canonical form or the three-line maximum needs relaxing for this
   card.

3. **Four stable pills coexist with the single accent element.** Section 06
   requires a real-status pill on every surface card, and ADR-003 records all
   four paths as stable surfaces — `manual.fragileFiles` (A-007),
   `manual.coChangePatterns` (A-005), `generated.fileIndex` (A-004) and
   `generated.frameworkManifest` (A-008), in the canonical order — so four
   emerald pills appear alongside the row's emerald hairline. Section 04.3 (status
   colors are load-bearing and are not the accent role) governs here, but
   section 11's "exactly one emerald element" reads literally against it. The
   topology legend's artifact swatch is the same case.

4. **Co-change stability tag.** META-297 records that the producer emitted no
   commit-graph evidence, which bears on whether `manual.coChangePatterns` is a
   currently emitted stable surface. It ships tagged `stable` on ADR-003 A-005
   ("Keep and specify: stable"). Changing that is a content ruling, not artwork.

6. **The brand identity was corrected to the lockup in circulation.** The
   design-system kit carries the bare `.json` wordmark, and guide section 08
   places it in columns 10-12 at 120px height. The identity actually published
   on workspacejson.dev is the full `workspace.json` lockup, whose 7:1 aspect
   cannot occupy a 3-column slot at that height. The hero was recomposed on
   authority from the issue owner: lockup top-left at 48px, display title
   beneath it at 64px over two lines, canonical lead on one line across the
   content width; the mono eyebrow was dropped for vertical room. The social
   card keeps its top-left placement at 56px height. Guide section 08's
   wordmark placement is superseded for both assets; every other rule (margins,
   8px grid, type scale, one accent element) is unchanged.

7. **Root README image references are stale** (see the replacement matrix). Not
   fixed here; it belongs to GTM-32.

No new visual-system rules were introduced, no additional asset concepts were
produced, and no canonical string was rewritten.
