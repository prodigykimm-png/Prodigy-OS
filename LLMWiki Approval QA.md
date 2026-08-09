---
cssclasses:
  - prodigy-qa-fixture
qa_fixture_kind: synthetic_component
product_e2e_eligible: false
---
# LLMWiki 합성 컴포넌트 승인 QA

```dataviewjs
const hubPath = "HUB/50 Knowledge.md";
const qaStateKey = "__llmwikiApprovalQaFixtureState";
const reviewModulePaths = Object.freeze([
  "SYSTEM/Views/llmwiki-hash.js",
  "SYSTEM/Views/llmwiki-proposal-bundle.js",
  "SYSTEM/Views/llmwiki-approval-packet.js",
  "SYSTEM/Views/knowledge-explorer-registry.js",
  "SYSTEM/Views/knowledge-candidate-core.js",
  "SYSTEM/Views/evidence-quality-core.js",
  "SYSTEM/Views/knowledge-candidate-store.js",
  "SYSTEM/Views/llmwiki-canonical-packet.js",
  "SYSTEM/Views/llmwiki-approval-review-commit.js",
  "SYSTEM/Views/llmwiki-deterministic-commit.js",
  "SYSTEM/Views/knowledge-explorer-hub-adapter.js",
  "SYSTEM/Views/llmwiki-approval-review-view.js"
]);
const container = dv.container;
container.empty();

window.__llmwikiApprovalQaFixtureContract = Object.freeze({
  fixture_kind: "synthetic_component",
  product_e2e_eligible: false
});
container.createEl("p", { text: "합성 컴포넌트 fixture입니다. 제품 E2E 증거로 사용할 수 없음." });
container.createEl("p", { text: "미리보기 전용이며 canonical Knowledge 파일을 쓰지 않습니다." });
const prepareButton = container.createEl("button", {
  text: "QA 승인 packet 준비",
  attr: { type: "button", "data-action": "prepare-llmwiki-qa-packet", "aria-label": "QA 승인 packet 준비" }
});
const stalePrepareButton = container.createEl("button", {
  text: "QA stale retry packet 준비 (미리보기 전용)",
  attr: { type: "button", "data-action": "prepare-llmwiki-qa-stale-packet", "aria-label": "QA stale retry packet 준비 (미리보기 전용)" }
});
const resetButton = container.createEl("button", {
  text: "QA 상태 초기화",
  attr: { type: "button", "data-action": "reset-llmwiki-qa-packet", "aria-label": "QA 상태 초기화" }
});
const status = container.createEl("p", {
  text: "대기 중: 위 버튼을 눌러 QA packet을 준비하세요.",
  attr: { "data-role": "llmwiki-qa-status", "aria-live": "polite" }
});

const loadProdigyScript = async (modulePath) => {
  const tFile = app.vault.getAbstractFileByPath(modulePath);
  if (!tFile) throw new Error(`Missing review module: ${modulePath}`);
  (new Function(await app.vault.read(tFile)))();
};

const resetQaState = () => {
  const KnowledgeExplorerHub = window.KnowledgeExplorerHub;
  const previous = window[qaStateKey];
  if (!KnowledgeExplorerHub || !previous) {
    status.setText("초기화할 QA 상태가 없습니다.");
    return;
  }
  if (KnowledgeExplorerHub.approvalPacket === previous.installedApprovalPacket) {
    delete KnowledgeExplorerHub.approvalPacket;
    if (previous.hasApprovalPacket) KnowledgeExplorerHub.approvalPacket = previous.approvalPacket;
  }
  if (KnowledgeExplorerHub.commitOptions === previous.installedCommitOptions) {
    delete KnowledgeExplorerHub.commitOptions;
    if (previous.hasCommitOptions) KnowledgeExplorerHub.commitOptions = previous.commitOptions;
  }
  if (KnowledgeExplorerHub.buildCommitRequest === previous.installedBuildCommitRequest) {
    delete KnowledgeExplorerHub.buildCommitRequest;
    if (previous.hasBuildCommitRequest) KnowledgeExplorerHub.buildCommitRequest = previous.buildCommitRequest;
  }
  delete window[qaStateKey];
  status.setText("QA 상태를 초기화했습니다. 파일은 삭제하지 않았습니다.");
};

const openKnowledgeHub = async () => {
  const hubFile = app.vault.getAbstractFileByPath(hubPath);
  if (!hubFile) throw new Error(`Missing Knowledge Hub: ${hubPath}`);
  const leaf = app.workspace.getLeaf(false);
  await leaf.openFile(hubFile);
};

const createPacketBoundPreview = async (approvalPacket, { stale = false } = {}) => {
  const operation = approvalPacket.operations.find((item) => item.proposal_kind === "create");
  if (!operation) throw new Error("Synthetic create operation is missing.");
  const reviewed = operation.reviewed_payload;
  const statement = reviewed.claims[0].text;
  const files = new Map();
  const adapter = {
    readBytes(targetPath) { return files.has(targetPath) ? files.get(targetPath) : null; },
    readReceipt() { return null; },
    commitExact() { return { ok: true, status: "committed", preview: true }; }
  };
  const assembled = await window.LLMWikiCanonicalPacket.assembleCanonicalPacket({
    run_id: approvalPacket.run_id,
    consent_hash: "c".repeat(64),
    operation: {
      operation_id: operation.operation_id,
      proposal_id: operation.proposal_id,
      proposal_kind: "create",
      payload_hash: operation.payload_hash
    },
    canonical_document: {
      title: reviewed.title,
      statement,
      knowledge_domain: "reading",
      knowledge_topics: [],
      application_trigger: "",
      application_contexts: [],
      connections: [],
      invalidation_conditions: [],
      summary: "",
      created: "2026-08-02T00:00:00.000Z",
      updated: "2026-08-02T00:00:00.000Z",
      body: `# ${reviewed.title}\n\n${statement}\n`
    },
    source_citations: operation.source_citations,
    expires_at: "2099-01-01T00:00:00.000Z",
    nonce: `nonce_qa_${approvalPacket.packet_hash.slice(0, 24)}`
  }, adapter);
  if (!assembled.ok) throw new Error(`Canonical preview packet failed: ${assembled.reason}`);
  const authorized = window.LLMWikiApprovalReviewCommit.authorizeCanonicalPacket(assembled.value, {
    action: "approve_selected",
    selection_ids: [operation.operation_id]
  });
  if (!authorized.ok) throw new Error(`Canonical preview authorization failed: ${authorized.reason}`);
  if (stale) files.set(assembled.value.target_path, "QA stale collision bytes\n");
  return ({ packet, authorizationResult }) => {
    if (packet.packet_hash !== approvalPacket.packet_hash
      || authorizationResult.selection_set.length !== 1
      || authorizationResult.selection_set[0] !== operation.operation_id) {
      throw new Error("QA approval selection does not match its canonical packet.");
    }
    return window.LLMWikiApprovalReviewCommit.buildCommitRequest({
      packet: assembled.value,
      authorization: authorized.value,
      adapter
    });
  };
};

prepareButton.onclick = async () => {
  try {
    status.setText("QA 승인 packet을 준비하는 중입니다.");
    resetQaState();
    const KnowledgeExplorerHub = window.KnowledgeExplorerHub || (window.KnowledgeExplorerHub = {});
    const previous = {
      hasApprovalPacket: Object.prototype.hasOwnProperty.call(KnowledgeExplorerHub, "approvalPacket"),
      approvalPacket: KnowledgeExplorerHub.approvalPacket,
      hasCommitOptions: Object.prototype.hasOwnProperty.call(KnowledgeExplorerHub, "commitOptions"),
      commitOptions: KnowledgeExplorerHub.commitOptions,
      hasBuildCommitRequest: Object.prototype.hasOwnProperty.call(KnowledgeExplorerHub, "buildCommitRequest"),
      buildCommitRequest: KnowledgeExplorerHub.buildCommitRequest
    };
    for (const modulePath of reviewModulePaths) await loadProdigyScript(modulePath);
    const packet = window.LLMWikiApprovalReviewView.createSyntheticApprovalPacket();
    const buildCommitRequest = await createPacketBoundPreview(packet);
    KnowledgeExplorerHub.approvalPacket = packet;
    KnowledgeExplorerHub.commitOptions = { preview: true };
    KnowledgeExplorerHub.buildCommitRequest = buildCommitRequest;
    window[qaStateKey] = {
      ...previous,
      installedApprovalPacket: KnowledgeExplorerHub.approvalPacket,
      installedCommitOptions: KnowledgeExplorerHub.commitOptions,
      installedBuildCommitRequest: KnowledgeExplorerHub.buildCommitRequest
    };
    status.setText("합성 QA packet을 준비했습니다. preview-only 상태로 Knowledge Hub를 여는 중입니다.");
    await openKnowledgeHub();
  } catch (error) {
    status.setText(`QA packet 준비 실패: ${error.message}`);
  }
};

stalePrepareButton.onclick = async () => {
  try {
    status.setText("QA stale retry packet을 준비하는 중입니다. 미리보기 전용입니다.");
    resetQaState();
    const KnowledgeExplorerHub = window.KnowledgeExplorerHub || (window.KnowledgeExplorerHub = {});
    const previous = {
      hasApprovalPacket: Object.prototype.hasOwnProperty.call(KnowledgeExplorerHub, "approvalPacket"),
      approvalPacket: KnowledgeExplorerHub.approvalPacket,
      hasCommitOptions: Object.prototype.hasOwnProperty.call(KnowledgeExplorerHub, "commitOptions"),
      commitOptions: KnowledgeExplorerHub.commitOptions,
      hasBuildCommitRequest: Object.prototype.hasOwnProperty.call(KnowledgeExplorerHub, "buildCommitRequest"),
      buildCommitRequest: KnowledgeExplorerHub.buildCommitRequest
    };
    for (const modulePath of reviewModulePaths) await loadProdigyScript(modulePath);
    const packet = window.LLMWikiApprovalReviewView.createSyntheticApprovalPacket();
    const buildCommitRequest = await createPacketBoundPreview(packet, { stale: true });
    KnowledgeExplorerHub.approvalPacket = packet;
    KnowledgeExplorerHub.commitOptions = { preview: true };
    KnowledgeExplorerHub.buildCommitRequest = buildCommitRequest;
    window[qaStateKey] = {
      ...previous,
      installedApprovalPacket: KnowledgeExplorerHub.approvalPacket,
      installedCommitOptions: KnowledgeExplorerHub.commitOptions,
      installedBuildCommitRequest: KnowledgeExplorerHub.buildCommitRequest
    };
    status.setText("stale retry QA packet을 준비했습니다. preview-only 상태로 Knowledge Hub를 여는 중입니다.");
    await openKnowledgeHub();
  } catch (error) {
    status.setText(`stale retry packet 준비 실패: ${error.message}`);
  }
};

resetButton.onclick = () => resetQaState();
```
