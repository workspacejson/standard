export const workspaceJsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://www.workspacejson.dev/schema/v1.json',
  title: 'agents.workspace.json',
  type: 'object',
  required: ['manual', 'generated', 'agents', 'health'],
  additionalProperties: false,
  properties: {
    manual: {
      type: 'object',
      description: 'Human-authored content preserved across regenerations.',
      properties: {
        fragileFiles: {
          type: 'array',
          description: 'Human-annotated fragile files. Read by gsd-plugin v2.42.3.',
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
          description: 'Human-annotated co-change observations. Read by gsd-plugin v2.42.3.',
          items: { type: 'object' },
        },
      },
      additionalProperties: true,
    },
    generated: {
      type: 'object',
      required: ['specVersion', 'generatedAt', 'by'],
      properties: {
        specVersion: { enum: ['0.3', '0.4'] as const },
        generatedAt: { type: 'string', format: 'date-time' },
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
          description: 'Detected frameworks (confidence >= 0.7). Read by gsd-plugin v2.42.3.',
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
            'Per-file behavioral intelligence keyed by relative path. Read by gsd-plugin v2.42.3.',
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
          description: 'Machine-derived co-change pairs. Use generated=true to identify tooling-coupled pairs and skip them when surfacing real source couplings.',
          items: {
            type: 'object',
            required: ['files', 'rate', 'occurrences', 'generated'] as const,
            properties: {
              files: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
              rate: { type: 'number', minimum: 0, maximum: 1 },
              occurrences: { type: 'integer', minimum: 0 },
              generated: { type: 'boolean' },
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
              file: { type: 'string' },
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
      description: 'Cross-tool agent configuration surface.',
    },
    health: {
      type: 'object',
      description:
        'Summary metrics and intelligence state. Per-file detail belongs under generated.fileIndex.',
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
