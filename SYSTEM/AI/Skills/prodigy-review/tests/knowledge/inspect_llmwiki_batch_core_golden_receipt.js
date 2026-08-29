"use strict";

/*
 * Task 2 manual QA channel: Node receipt inspector.
 *
 * Runs the hub sandbox twice against the CURRENT runtime and emits a
 * machine-readable verification receipt proving or refuting:
 *
 *   1. one click/run-id binding (exactly one explicit click produces exactly
 *      one logical run id; a duplicate click returns the same id), and
 *   2. no INBOX/Processed state can appear without an observed approval
 *      event inside the same bound run.
 *
 * Exit code is 0 only when both proofs hold. Today the batch core facade does
 * not exist, so the receipt reports contract_unmet with the named gaps — that
 * is the expected manual QA output until the implementation task lands.
 */

const { buildPages, runHub } = require("./knowledge_hub_integration_harness.js");

const INBOX_SOURCE = `---
type: "literature_note"
source_kind: "public"
source_id: "source_batch_qa_inspector"
source_url: "https://example.com/batch-qa-inspector"
source_title: "배치 QA 인스펙터"
---
# 배치 QA 인스펙터

수동 검증 채널 픽스처 본문입니다.
`;

async function inspect() {
  const transportWork = [];
  const { app, window: hubWindow } = await runHub({
    pages: buildPages(),
    extraFiles: {
      "INBOX/batch-qa-inspector.md": INBOX_SOURCE,
      "SYSTEM/PRIVATE/prodigy.local.json": JSON.stringify({
        defaultProvider: "openrouter",
        aiProfiles: { schema_version: 1, llmwiki: { direct_provider_key: "", omniroute_provider_key: "" } },
      }),
    },
    llmWikiControllerOptions: {
      inboxAnalysisTransport: async (work) => {
        transportWork.push(work.source_id);
        return { ok: false, reason: "batch_core_not_implemented" };
      },
    },
  });
  await hubWindow.KnowledgeExplorerHub.whenKnowledgeInboxSettled();

  const core = hubWindow.KnowledgeExplorerHub.llmWikiBatchCore || null;
  const processedFiles = () => app.vault.getMarkdownFiles().filter((file) => /^INBOX\/Processed\//u.test(file.path)).map((file) => file.path);

  const receipt = {
    schema_version: "task2_golden_receipt_inspection_v1",
    generated_at: new Date().toISOString(),
    checks: {
      click_run_id_binding: {
        status: "unproven",
        detail: "llmWikiBatchCore.startBatchRun unavailable",
        clicks_observed: 0,
        distinct_run_ids: null,
      },
      no_processed_without_approval: {
        status: processedFiles().length === 0 ? "held" : "violated",
        detail: processedFiles().length === 0
          ? "no Processed path exists without any approval event"
          : `Processed paths appeared without approval: ${processedFiles().join(", ")}`,
        processed_paths_without_approval: processedFiles(),
      },
      discovery_only_mount: {
        status: transportWork.length === 0 ? "held" : "violated",
        detail: `${transportWork.length} provider analysis work item(s) dispatched by mount without any click`,
        provider_calls_on_mount: transportWork.length,
      },
    },
    verdict: "contract_unmet",
    unmet_reasons: [],
  };

  if (core && typeof core.startBatchRun === "function") {
    const first = await core.startBatchRun({});
    const second = await core.startBatchRun({});
    const ids = [first && first.run_id, second && second.run_id].filter(Boolean);
    const binding = receipt.checks.click_run_id_binding;
    binding.clicks_observed = 2;
    binding.distinct_run_ids = [...new Set(ids)].length;
    binding.status = ids.length === 2 && new Set(ids).size === 1 ? "held" : "violated";
    binding.detail = binding.status === "held"
      ? `duplicate click returned existing run id ${ids[0]}`
      : `clicks produced run ids ${JSON.stringify(ids)}`;
  }

  for (const check of Object.values(receipt.checks)) {
    if (check.status !== "held") receipt.unmet_reasons.push(check.check_id || check.detail);
  }
  receipt.verdict = receipt.unmet_reasons.length === 0 ? "contract_met" : "contract_unmet";

  console.log(JSON.stringify(receipt, null, 2));
  process.exitCode = receipt.verdict === "contract_met" ? 0 : 1;
}

inspect().catch((error) => {
  console.error("inspector_failed", error);
  process.exitCode = 1;
});
