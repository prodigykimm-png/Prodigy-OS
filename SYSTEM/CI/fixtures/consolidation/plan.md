# Prodigy Region Workspace Consolidation - Release Fixture

This tracked fixture preserves the completed consolidation plan structure needed by the clean-checkout release audits. Runtime evidence and personal Vault data are intentionally excluded.

## Invariants

- Collection never applies an Object automatically.
- Human approval dispatches only the four existing domain writers.
- Provider, lineage, Property, responsive UI, and regression contracts remain independently auditable.
- Release receipts are generated only in the release gate temporary hierarchy.

## Dependency waves

- Wave A: Todo 0
- Wave B: Todos 1, 8, 9, 10, 11 after 0
- Wave C: Todo 2 after 1; Todo 12 after 11; Todo 13 after 1, 8, 9, 11, 12
- Wave D: Todos 3 and 4 after 2; Todo 5 after 2 and 4
- Wave E: Todo 6 after 3, 4, 5; Todo 7 after 2, 3, 4, 5, 6
- Wave F: Todo 14 after 7, 8, 9, 13
- Wave G: Todo 15 after all prior Todos

## Todos

- [x] 0. Freeze the clean-checkout contract and ownership inventory
- [x] 1. Define Region source, run, artifact, secret, retention, and approval contracts
- [x] 2. Build immutable state, normalization, correction-aware diff, domain inputs, and trust cores
- [x] 3. Implement official households, market, transaction, and comparable collectors
- [x] 4. Implement supply, permit, jobs, land, admin-code, and boundary collectors
- [x] 5. Preserve approved transit and provider-separated candidate evidence
- [x] 6. Implement SecretStorage collection, scheduling, startup, and manual collection
- [x] 7. Build human approval and hardened domain-writer envelopes
- [x] 8. Add canonical Auction outcomes and deterministic learning projections
- [x] 9. Connect exact Region Knowledge and qualitative evidence
- [x] 10. Implement Workout v2 through the existing writer boundary
- [x] 11. Add network-free Reading manual registration
- [x] 12. Add one shared PARA creator service without fixture PARA objects
- [x] 13. Integrate Property and Korean display contracts once
- [x] 14. Build the mobile-safe Region decision and Auction feedback surfaces
- [x] 15. Document operation, add CI coverage, and run integrated regression

## Final verification wave

- [x] F1. Plan and scope fidelity audit
- [x] F2. Security, lineage, and data-mutation review
- [x] F3. Visual verification limitation receipt
- [x] F4. Final current-run receipt aggregation
