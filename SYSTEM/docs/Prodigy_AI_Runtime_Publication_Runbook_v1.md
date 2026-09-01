# Prodigy AI Runtime v0.1.0 Publication Runbook

## Published boundary

- Repository: `https://github.com/prodigykimm-png/prodigy-ai-runtime`
- Visibility: private
- Default branch: `main`
- Verified commit: `d4380537a4a1766b21cc7540a57ba9ee270ef635`
- Release tag: annotated, unsigned `v0.1.0`
- License: none
- Published history: the seven commits reachable from the verified commit
- Release assets:
  - `prodigy-ai-runtime-0.1.0.zip`
  - `prodigy-ai-runtime-0.1.0.json`
  - `prodigy-ai-runtime-0.1.0.zip.sha256`

GitHub reports this Release as platform-mutable, so immutability is enforced by policy and
the publication audit's stored Release identity. Do not replace an asset or move `v0.1.0`
after publication. A correction must use a new version and tag.

## Consumer rollback

1. Disable `prodigy-ai-runtime` in Obsidian.
2. Select a previously retained ZIP and verify its adjacent SHA-256 sidecar.
3. Extract exactly `main.js`, `manifest.json`, and `versions.json`.
4. Run the production artifact-only installer with `PRODIGY_VAULT` and
   `PRODIGY_PLUGIN_SOURCE`.
5. Re-enable the plugin and verify its handshake and deterministic Project failure or
   consent state.
6. Preserve `data.json` and device SecretStorage. Never restore another device's routes,
   grants, or secret values.

## Publication revocation

If `v0.1.0` is unsafe, first prevent new consumption by marking the Release description
withdrawn, then publish a corrected version whose notes identify the superseded release.
Do not silently replace assets or retarget the tag.

Deleting the Release, deleting the tag, changing repository visibility, removing the
repository, or rewriting published history each requires a new explicit external-write
approval. If deletion is approved, retain the publication receipt and local verified
artifacts so the action remains auditable.

## Access revocation

The repository is private. Remove a collaborator or rotate GitHub credentials through the
GitHub access-control surface; do not change runtime credentials or Obsidian SecretStorage
as part of repository access remediation. Those stores are independent boundaries.

Do not change the repository to public while the seven-commit history contains the
local-machine author address recorded in the publication receipt. Public visibility needs
new approval and a fresh history/privacy decision.
