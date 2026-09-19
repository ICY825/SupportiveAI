# ADR 0003: layout overrides narrow geometry authority

Status: accepted
Date: 2026-09-19

## Decision

The extracted dataset remains authoritative for what physical entities exist on
a floor. It is not the final authority on where a desk may stand when the
drawing conflicts with the occupied office. A person with responsibility for
the floor may save a placement that conflicts only with `EXTRACTED` or
`UNVERIFIED` geometry.

The compensations are part of the decision: the override records the actor,
the timestamp, a required reason, and the conflicts that were outstanding.
Reconciliation reports those placements as overrides, separately from stale
drawing drift. Overlapping desks, placements outside the floor plate, and
conflicts with `SOURCE_VERIFIED` geometry remain hard refusals.

This narrows the geometry portion of ADR 0002 §4. It does not make the layout
database a second source of floor entities, and it does not alter seat
assignment ownership.

## Rationale

Desks move in the real office without the admin room being told. The drawing is
evidence of what was extracted, while the saved override is evidence of the
named decision that reality outranks that evidence for one placement.
