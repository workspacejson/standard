export const workspaceJsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://workspacejson.dev/schema/v1.json',
  title: 'workspace.json',
  type: 'object',
  required: ['manual', 'generated', 'agents', 'health'],
  additionalProperties: false,
  allOf: [
    {
      if: { required: ['version'], properties: { version: { const: '0.3' } } },
      then: { properties: { generated: { properties: { specVersion: { const: '0.3' } } } } },
    },
    {
      if: { required: ['version'], properties: { version: { const: '0.4' } } },
      then: { properties: { generated: { properties: { specVersion: { const: '0.4' } } } } },
    },
  ],
  properties: {
    version: {
      enum: ['0.3', '0.4'] as const,
      description:
        'Optional mirror of generated.specVersion. When present it MUST equal generated.specVersion; a document where the two disagree is invalid. Absence carries no meaning beyond "written by a producer predating this profile" and must not be read as a signal. See ADR-004.',
    },
    manual: {
      type: 'object',
      description: 'Human-authored content preserved across regenerations.',
      properties: {
        fragileFiles: {
          type: 'array',
          description: 'Human-annotated fragile files. Read by Buildomator.',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              reason: { type: 'string' },
            },
          },
        },
        coChangePatterns: {
          type: 'array',
          description: 'Human-annotated co-change observations. Read by Buildomator.',
          items: { type: 'object' },
        },
      },
      additionalProperties: true,
    },
    generated: {
      type: 'object',
      required: ['specVersion', 'generatedAt', 'by'],
      allOf: [
        {
          $comment:
            'Transitional basis-pinning rule, scoped ENTIRELY to the observation form. basisRevision is declared without constraints at generated level, because a legacy artifact may already carry that key with any value — including a symbolic ref such as "HEAD" — and constraining it globally would invalidate a document that was valid before this amendment. The requirement AND the object-ID pattern therefore live only in this then branch, which applies only once an observation-form entry is present. An EMPTY coChange array triggers nothing: schema validation cannot tell an empty array written by a legacy producer from one written by an observation producer, so an unpinned empty array is defined as legacy/unknown rather than as evidence of zero. New producers carry the stronger obligation, stated in the producer profile.',
          if: {
            required: ['coChange'],
            properties: { coChange: { contains: { required: ['support'] } } },
          },
          then: {
            required: ['basisRevision'],
            properties: {
              basisRevision: {
                type: 'string',
                pattern: '^([0-9a-f]{40}|[0-9a-f]{64})$',
              },
            },
          },
        },
      ],
      properties: {
        specVersion: { enum: ['0.3', '0.4'] as const },
        generatedAt: { type: 'string', format: 'date-time' },
        basisRevision: {
          description:
            'The repository revision the observations in this section were computed from. UNCONSTRAINED HERE, deliberately: a legacy artifact may already carry this key with any value, including a symbolic ref such as "HEAD", and constraining it globally would invalidate a document that was valid before the observation form existed. The contract is imposed by the conditional rule on this object, and applies only where an observation-form coChange entry is present. Under that rule the value is the full-length lowercase hexadecimal Git object name of the commit at the tip of the analyzed history — 40 characters for SHA-1, 64 for SHA-256 — because a pin that does not name exactly one commit permanently cannot be recounted against; abbreviated object names, branch names and tags are rejected there. Declared once here; never repeated per observation. A producer emitting the observation form must declare a conforming value whenever generated.coChange exists at all, including when the array is empty; that stronger obligation belongs to the producer profile, because an empty array carries nothing for schema validation to discriminate on.',
        },
        by: {
          type: 'object',
          required: ['name', 'version'],
          properties: {
            name: { type: 'string' },
            version: { type: 'string' },
          },
        },
        frameworkManifest: {
          type: 'array',
          description: 'Detected frameworks (confidence >= 0.7). Read by Buildomator.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              version: { type: 'string' },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
          },
        },
        fileIndex: {
          type: 'object',
          description:
            'Per-file behavioral intelligence keyed by repository-root-relative POSIX path (forward slashes, no leading "./", no drive letters).',
          additionalProperties: {
            type: 'object',
            properties: {
              fragility: { type: 'number', minimum: 0, maximum: 1 },
              aiModificationCount: { type: 'integer', minimum: 0 },
              humanModificationCount: { type: 'integer', minimum: 0 },
            },
          },
        },
        coChange: {
          type: 'array',
          description:
            'Machine-derived co-change pairs. During the v0.4 transition an entry takes EXACTLY ONE of two forms, discriminated by which sibling of occurrences is present: the LEGACY form carries rate, the OBSERVATION form carries support. An entry carrying both is invalid — the two are different contracts, and a reader cannot know which was measured. An entry carrying neither is invalid. The array is also HOMOGENEOUS: every entry is in the legacy form, or every entry is in the observation form. A mixed array is invalid, because one artifact would then carry two different meanings of occurrences with nothing at the collection level saying so, and a reader aggregating across entries would silently combine them. An empty array satisfies both branches and asserts nothing about which form its producer would have used. New producers emit only the observation form; legacy acceptance exists so that already-published artifacts keep validating, and is removed at the next document-profile change. A qualifying commit is one inside the analysis boundary declared by the producer — the same boundary that governs every other observation in this section, and reachable from generated.basisRevision. This schema does not define that boundary: history window, merge handling, rename following and path normalization are producer-profile concerns. It requires only that one boundary is applied identically to support and occurrences in every entry. The generated flag is a CLASSIFICATION, not an observation, and it is optional in the observation form: an entry that omits it makes no claim either way, and a reader must not read absence as false. See the flag\'s own description for the three-state reading.',
          anyOf: [
            { title: 'every entry in the legacy form', items: { required: ['rate'] as const } },
            { title: 'every entry in the observation form', items: { required: ['support'] as const } },
          ],
          items: {
            type: 'object',
            required: ['files', 'occurrences'] as const,
            $comment:
              "Each branch states BOTH what it requires and what it forbids. Relying on oneOf's exactly-one-match arithmetic alone is not sufficient once a branch carries a constraint the other does not: an entry with rate AND support AND occurrences 0 matched the legacy branch, failed the observation branch on the minimum, and so satisfied oneOf with exactly one match — admitting a both-form entry through the rule written to forbid it. The explicit not clauses make each branch reject the other representation on its own, independently of how many branches happen to match.",
            oneOf: [
              {
                title: 'legacy form',
                required: ['rate', 'generated'] as const,
                not: { required: ['support'] as const },
              },
              {
                title: 'observation form',
                required: ['support'] as const,
                not: { required: ['rate'] as const },
                properties: { occurrences: { minimum: 1 } },
              },
            ],
            properties: {
              files: {
                type: 'array',
                items: { type: 'string' },
                minItems: 2,
                maxItems: 2,
                description:
                  'Unordered pair (set semantics — position is NOT meaningful; join by membership, not index). Each entry is a repository-root-relative POSIX path.',
              },
              rate: {
                type: 'number',
                minimum: 0,
                maximum: 1,
                description:
                  'LEGACY FORM ONLY, and deprecated. A derived value the standard no longer stores: it is continuous, so every new commit moves it, and it forces one analytical reading on every consumer. Retained solely so artifacts published before the observation form keep validating at generated.specVersion 0.4. New producers must not emit it, and must not emit it alongside support. Removed at the next document-profile change.',
              },
              support: {
                type: 'integer',
                minimum: 0,
                description:
                  'OBSERVATION FORM. The number of distinct qualifying commits in which BOTH files changed. Commits are counted, not file events or ordered relationships: a commit that touches either file more than once counts once. Symmetric — swapping the two entries of files does not change it. Never exceeds occurrences, since the commits it counts are a subset of those occurrences counts.',
              },
              occurrences: {
                type: 'integer',
                minimum: 0,
                description:
                  'The denominator, present in both forms — but its referent is determined by the form, so a reader must establish the form before reading it. In the OBSERVATION form (alongside support) it is the number of distinct qualifying commits in which AT LEAST ONE of the two files changed: the symmetric union denominator, counting commits rather than file events, unchanged by swapping the two entries of files. There it is constrained to a MINIMUM OF 1, so support / occurrences is always defined and no reader can produce 0/0, NaN or infinity from a conforming artifact: a pair whose union of qualifying commits is empty was never observed changing at all, so no entry may be emitted for it. Absence of an entry, not a zero denominator, is how an unobserved pair is represented. The standard stores no derived rate, probability, lift or ranking. In the LEGACY form (alongside rate) it carries the pre-amendment meaning, which was never specified normatively, must not be assumed symmetric, and keeps its original minimum of 0 so that published artifacts stay valid. Values must not be compared across the two forms.',
              },
              generated: {
                type: 'boolean',
                description:
                  'OPTIONAL IN THE OBSERVATION FORM, REQUIRED IN THE LEGACY FORM. A classification, not an observation: true asserts the pair is tooling-coupled (a lockfile and its manifest, a generated file and its source) and that a consumer surfacing real source couplings should skip it. Unlike support and occurrences, it cannot be read off the commit graph — it requires a judgement about what a file IS, and no portable deterministic classifier from public repository inputs is specified by this standard. It is therefore THREE-STATE for readers: true means classified tooling-coupled; false means classified NOT tooling-coupled; ABSENT means the producer performed no classification and asserts nothing. A reader must not collapse absent into false — that would convert a producer\'s silence into a positive claim that the pair is a real source coupling, which is exactly the unsupported certainty this form declines to require. A new producer omits the flag unless it implements a public, deterministic, perturbation-tested classifier, and two producers that classify the same pair differently are both conformant, so the flag is not a comparison surface between producers. It stays required in the deprecated legacy form, where every published artifact already carries it and the contract is frozen until that form is removed.',
              },
            },
            additionalProperties: false,
          },
        },
        fragility: {
          type: 'array',
          description: 'Per-file fragility derived from git history. excluded=true means the file was skipped in analysis (generated files, lock files).',
          items: {
            type: 'object',
            required: ['file', 'changeCount', 'revertCount', 'revertRate', 'fragilityScore', 'excluded'] as const,
            properties: {
              file: { type: 'string', description: 'Repository-root-relative POSIX path (forward slashes, no leading "./").' },
              changeCount: { type: 'integer', minimum: 0 },
              revertCount: { type: 'integer', minimum: 0 },
              revertRate: { type: 'number', minimum: 0, maximum: 1 },
              fragilityScore: { type: 'number', minimum: 0, maximum: 1 },
              excluded: { type: 'boolean' },
            },
            additionalProperties: false,
          },
        },
        topology: { type: 'object' },
        conventions: { type: 'array' },
        gitSummary: { type: 'object' },
        hygiene: { type: 'object' },
        warnings: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: true,
    },
    agents: {
      type: 'object',
      description: 'Producer-owned cross-tool agent configuration surface. Regenerated by the producing tool; human evidence belongs under manual.',
    },
    health: {
      type: 'object',
      description:
        'Producer-owned summary metrics and intelligence state. Regenerated by the producing tool; per-file detail belongs under generated.fileIndex.',
      properties: {
        intelligenceState: {
          type: 'string',
          enum: ['INSUFFICIENT_DATA', 'OBSERVING', 'CONFIDENT'],
        },
        observationCount: { type: 'integer', minimum: 0 },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        boundRate: { type: 'number' },
        averageFragility: { type: 'number' },
        fragileFileCount: { type: 'integer', minimum: 0 },
        aiAttributionRate: { type: 'number' },
        rollbackRate: { type: 'number' },
        trend: { type: 'string' },
        lastUpdated: { type: 'string', format: 'date-time' },
        workflowFragility: { type: 'number', minimum: 0, maximum: 1,
          description: 'Aggregate workflow fragility score (0-1). Formally typed in v0.4.' },
        codebaseHealth: { type: 'number', minimum: 0, maximum: 1,
          description: 'Codebase health score (0-1). Formally typed in v0.4.' },
        changeVolatility: { type: 'number', minimum: 0, maximum: 1,
          description: 'Change volatility score (0-1). Formally typed in v0.4.' },
      },
      additionalProperties: true,
    },
  },
} as const;
