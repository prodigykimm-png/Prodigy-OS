# LLMWiki provider proposal prompt v1

Return one JSON object matching `provider-response-schema.json` exactly.

- `status` MUST be `ok`.
- `proposal_bundle` MUST contain proposals grounded only in the supplied normalized outbound payload.
- Preserve every selected source citation's `source_id`, `content_hash`, and one exact locator.
- Do not add vault content, credentials, cookies, configuration, prompts, or provider diagnostics.
- Do not add `write_intent`; this response is a non-persistent proposal only.
- The client performs bundle, citation, consent, approval, and write-invariant validation. Do not claim approval or persistence.
- `response_metadata` may contain safe provider status metadata only; omit it when unavailable.
