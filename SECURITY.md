# Security

If you discover a security issue in `@workspacejson/spec`, `@workspacejson/rules`,
or the workspace.json specification itself, please report it privately through
this repository's GitHub security advisory workflow.

Do not open a public issue for a sensitive vulnerability before coordinated
disclosure.

## What to include

- a short summary of the issue
- the affected package, schema path, or API surface
- reproduction steps
- whether the issue affects published packages or only local development
- whether the issue affects the normative schema or only reference behavior

## What not to include

- public issue reports for sensitive vulnerabilities before coordinated disclosure
- secrets, tokens, or private repository data

## Scope

This repository owns the specification, schema, types, validation semantics and
deterministic rules. Issues in repository generation belong to
`workspacejson/cli`; issues in host adapters belong to
`workspacejson/integrations`; issues in the published website belong to
`workspacejson/site`.

## Publication note

`@workspacejson/spec` and `@workspacejson/rules` are currently published from
`workspace-json/agents-audit`. Until that authority transfers, coordinate any
security release with that repository.
