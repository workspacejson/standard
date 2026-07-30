---
"@workspacejson/spec": patch
---

Reconcile the schema `$id` host to the bare canonical domain, per ADR-005.

The schema's `$id` was `https://www.workspacejson.dev/schema/v1.json` while every
package manifest and documentation reference uses `https://workspacejson.dev`
without the `www.` prefix. Both hosts serve the schema, so nothing was broken,
but the two strings disagreed — and `versioning.md` instructs consumers to
hash-check the materialized schema, which means the `$id` string is part of the
contract surface.

The `$id` is now `https://workspacejson.dev/schema/v1.json`, matching the bare
canonical domain. The filename `v1.json` is unchanged. The `www.` host continues
to serve the schema; the change is about which string is canonical, not which
URL works.

This change is folded into the same release as the ADR-004 root `version`
widening so consumers experience one schema-byte transition covering both
changes, rather than two consecutive pin invalidations.

ADR-005 also settles two questions that were open alongside the host, so that
this is the only identity change: the file is **not** renamed — `v1.json` stays,
and the `v1` remains a legacy naming artifact rather than a version claim — and
no sibling schema document will be introduced, with future profiles continuing to
ride the `generated.specVersion` enum. Neither decision changes any bytes now;
recording them is what keeps a later rename from costing a second pin.
