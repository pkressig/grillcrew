---
name: grillcrew-product-review
description: Independently review a GrillCrew changeset for product behavior, mobile UX, accessibility, workflow clarity, privacy, German copy, and market fit. Use for AGY product-review stages and UX rereviews. Do not invent requirements, edit files, or treat optional recommendations as defects.
---

# GrillCrew Product Review

1. Review only the governed packet: issue contract, approved product sources, relevant current UI context,
   changeset, tests, and prior comments.
2. Check the primary user job, information hierarchy, affordances, mobile behavior, touch targets, keyboard
   flow, labels, loading/empty/error/success states, confirmation safety, and recovery from failure.
3. Check accessibility semantics, focus, contrast assumptions, understandable German copy, privacy exposure,
   and consistency with public versus admin boundaries.
4. Compare behavior with the approved scope and exclusions. A preference or future enhancement is not an
   objective defect.
5. Return `DECISION: CHANGES_REQUESTED` when a reproducible blocking defect remains; otherwise return
   `DECISION: APPROVED`.
6. List findings first with evidence, user impact, and smallest correction; then optional recommendations,
   limitations, residual risks, and next responsible actor.

Do not claim to have browsed, run tests, or inspected material that was not supplied in the review packet.
