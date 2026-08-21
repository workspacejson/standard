# Redactions

This file records every redaction applied to raw experiment artifacts before
committing them to this evidence directory.

## Redaction policy

Artifacts were copied byte-for-byte from `/tmp/meta323/` except where they
contained local machine paths or import paths. No credentials, authorization
headers, API keys, Doppler values, or secret environment values were found
in any artifact.

## Redactions applied

### verdict.json and all-results.json files

| Source artifact pattern | Field redacted | Replacement | Reason |
| -- | -- | -- | -- |
| `scenario-*/{arm}/run-*/verdict.json` | `artifactDir` | `<redacted:local-path>` | Local machine path |
| `degraded-evidence/*/run-*/verdict.json` | `artifactDir` | `<redacted:local-path>` | Local machine path |
| `preflight-rejected/scenario-*/{arm}/run-*/verdict.json` | `artifactDir` | `<redacted:local-path>` | Local machine path |
| `scenario-all-results.json` | `artifactDir` (nested) | `<redacted:local-path>` | Local machine path |
| `degraded-all-results.json` | `artifactDir` (nested) | `<redacted:local-path>` | Local machine path |
| `preflight-rejected/all-results.json` | `artifactDir` (nested) | `<redacted:local-path>` | Local machine path |

### Protocol scripts

| Source file | Redacted content | Replacement | Reason |
| -- | -- | -- | -- |
| `protocol/run-scenarios-v2.mjs` | `/Users/user1/dev/.../reviewer.js` import path | `<reviewer-dist-path>/reviewer.js` | Local machine path |
| `protocol/run-scenarios-v2.mjs` | `/tmp/meta323/scenario-results-v2` output path | `<output-dir>/scenario-results` | Local machine path |
| `protocol/run-degraded.mjs` | `/Users/user1/dev/.../reviewer.js` import path | `<reviewer-dist-path>/reviewer.js` | Local machine path |
| `protocol/run-degraded.mjs` | `/tmp/meta323/degraded-results` output path | `<output-dir>/degraded-results` | Local machine path |
| `protocol/run-scenarios-preflight.mjs` | Same import and output path redactions as above | Same replacements | Local machine path |

## Items checked and found clean

The following were checked and found to contain no sensitive material:

- `request.json` files: no Authorization headers, no API keys, no Bearer tokens
- `response.json` files: no API keys, no credentials
- `receipt.json` files: no credentials, no sensitive paths
- `protocol/*.mjs` files: reference `process.env.OPENROUTER_API_KEY` but do not contain the key value
