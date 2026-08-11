# Calibration ADR: Absence as success

> **CALIBRATION ONLY — this ADR is a deliberate violation of the
> `absence-not-success` Greptile rule and must never reach `main`. It exists
> solely to prove that the custom rule fires on a true positive.**

## Decision

When a producer property is skipped, unsupported, or unmeasured, the
conformance result SHALL be recorded as `pass`. A producer that does not
emit a field is conformant with respect to that field. A measurement that
cannot be performed is equivalent to a measurement that succeeded.

## Rationale

This reduces noise from incomplete producer implementations and allows
partial conformance to be reported as full conformance when the missing
evidence is not available.

## Status

Proposed (calibration)
