"use strict";
// Real Markdown and immutable receipts in a disposable filesystem Vault. Only
// official approval APIs issue authority; no trusted row/receipt is injected.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const VIEWS = path.resolve(__dirname, "../../../../../Views");
const load = name => require(path.join(VIEWS, name));
const {createTrustedFixture} = require("./fixtures/llmwiki-canonical-v2-trust-fixture.js");
const store = load("knowledge-candidate-store.js"), trust = load("llmwiki-canonical-trust.js");
const obsidian = load("llmwiki-obsidian-adapter.js"), writer = load("llmwiki-operation-writer.js");
const claims = load("llmwiki-claim-provenance.js"), canonical = load("llmwiki-canonical-packet.js");
const operations = load("llmwiki-operation-contract.js"), evidence = load("llmwiki-evidence-contract.js");
const promotion = load("llmwiki-promotion-contract.js"), reader = load("llmwiki-resurfacing-read-adapter.js");
const wikiRead = load("llmwiki-wiki-read-adapter.js");
const NOW = "2026-09-09T12:00:00.000Z";
const stable = v => Array.isArray(v) ? `[${v.map(stable).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}` : JSON.stringify(v);
function diskVault(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "llmwiki-update-integrity-"));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const files=new Map(); let canonicalWrites=0;
  const absolute=p=>{ const r=path.resolve(root,p); assert.ok(r.startsWith(root+path.sep)); return r; };
  const vault={getAbstractFileByPath:p=>files.get(p)||null,getFiles:()=>[...files.values()].filter(f=>f.extension),
    async read(f){return fs.readFileSync(absolute(f.path),"utf8");},
    async create(p,bytes){ fs.mkdirSync(path.dirname(absolute(p)),{recursive:true}); fs.writeFileSync(absolute(p),bytes,{flag:"wx"}); const f={path:p,basename:path.basename(p,path.extname(p)),extension:path.extname(p).slice(1)};files.set(p,f); if(p.startsWith("ZETA/PERMANENT/"))canonicalWrites++;return f;},
    async modify(f,bytes){fs.writeFileSync(absolute(f.path),bytes);if(f.path.startsWith("ZETA/PERMANENT/"))canonicalWrites++;},
    async delete(f){fs.unlinkSync(absolute(f.path));files.delete(f.path);},
    async createFolder(p){fs.mkdirSync(absolute(p),{recursive:true});files.set(p,{path:p});}};
  const app={vault,metadataCache:{getFileCache(f){try{return {frontmatter:store.parseLifecycleDocument(fs.readFileSync(absolute(f.path),"utf8"))};}catch{return {frontmatter:{}};}}}};
  return {root,app,get canonicalWrites(){return canonicalWrites;}};
}
async function setup(t) {
  const a=await createTrustedFixture({authorizedOnly:true});
  const disk=diskVault(t),adapter=obsidian.createObsidianAdapter(disk.app);
  await disk.app.vault.create("ZETA/LITERATURE/fixture.md",a.source.source_text);
  const created=await writer.commitApprovedCanonicalV2({packet:a.packet,authorization:a.authorization,adapter},{now:NOW});
  assert.equal(created.status,"committed",JSON.stringify(created));
  const first=await reader.create().read({app:disk.app}); assert.equal(first.rows.length,1);assert.equal(trust.isVerifiedRow(first.rows[0]),true);
  const before=await adapter.readCanonical(a.packet.target_path);
  const originalAuthorities=(await adapter.readFinalizedCanonicalAuthorities()).map(obsidian.finalizedCanonicalAuthorityData);
  const originalAuditFiles=Object.fromEntries(await Promise.all(disk.app.vault.getFiles().filter(f=>f.path.startsWith(".llmwiki-audit/immutable/") && !f.path.endsWith("/head.json")).map(async f=>[f.path,await disk.app.vault.read(f)])));
  const text="Apply the approved item only to an indoor synthetic model.";
  const source={source_id:"source_added_b",source_kind:"immutable_source",source_revision:trust.sha256(text),extractor_revision:trust.sha256("extractor-b"),source_text:text,source_content_hash:trust.sha256(text),provider_window:{start:0,end:text.length}};
  await disk.app.vault.create("ZETA/LITERATURE/probe-b.md",text);
  const combined=claims.createClaimSet({source_snapshots:[a.source,source],claims:[a.source,source].map(s=>({origin:"source_extract",text:s.source_text,citations:[{source_id:s.source_id,provider_span:{start:0,end:s.source_text.length,span_digest:s.source_content_hash}}]}))});assert.equal(combined.ok,true,JSON.stringify(combined));
  const accepted=claims.transitionClaimSet(combined.value,{claim_set_hash:combined.value.claim_set_hash,claim_ids:combined.value.claims.map(c=>c.claim_id),status:"accepted",authorized_by:"fixture_reviewer",authorized_at:NOW});assert.equal(accepted.ok,true);
  const promotionInput={...a.promotion_input,statement:`${a.source.source_text} ${text}`,evidence:[...a.promotion_input.evidence,{evidence_id:"evidence_added_b",source_ref:source.source_id,strength:"strong"}],claims:[...a.promotion_input.claims,{claim_id:"claim_added_b",statement:text,evidence_refs:["evidence_added_b"],origin:"source_extract",review_status:"accepted"}]};
  const promotionReceipt=promotion.evaluatePromotion(promotionInput);assert.equal(promotionReceipt.canonical_write_eligible,true,JSON.stringify(promotionReceipt));
  const document={...a.document,statement:promotionInput.statement,body:`${a.document.body}\n${a.source.source_text}\n\n## Additional condition\n${text}\n`,updated:NOW,sources:[...a.document.sources,{source_id:source.source_id,span:{start:0,end:text.length}}],claim_set_hash:accepted.value.claim_set_hash,promotion_receipt_hash:trust.sha256(stable(promotionReceipt))};
  const op=operations.parseCanonicalOperation(JSON.stringify({operation_id:"operation_disk_update_b",proposal_id:"proposal_disk_update_b",proposal_kind:"update",payload_hash:trust.sha256(stable(document))}));assert.equal(op.ok,true);
  const assembled=await canonical.assembleCanonicalPacket({run_id:"run_disk_update_b",operation:op.value,target_path:a.packet.target_path,canonical_document:document,source_citations:[{source_id:a.source.source_id,content_hash:a.source.source_content_hash,locators:["ZETA/LITERATURE/fixture.md#L1"]},{source_id:source.source_id,content_hash:source.source_content_hash,locators:["ZETA/LITERATURE/probe-b.md#L1"]}],consent_hash:"c".repeat(64),expires_at:"2099-01-01T00:00:00.000Z",nonce:"nonce_disk_update_b_0001"},adapter);assert.equal(assembled.ok,true,JSON.stringify(assembled));
  const assessed=evidence.evaluateEvidence({operation_id:op.value.operation_id,claims:[{claim_id:"claim_added_b",text,changed:true,citation_ids:["citation_added_b"]}],citations:[{citation_id:"citation_added_b",source_id:source.source_id,source_span:{locator:"ZETA/LITERATURE/probe-b.md#L1",start:0,end:text.length},source_length:text.length,source_content_hash:source.source_content_hash,extractor_revision:source.extractor_revision}],verification:{verified_at:NOW,owner:{owner_id:"fixture_reviewer",owner_type:"human"},validity_conditions:["source remains current"],invalidation_conditions:["source withdrawn"],stale_triggers:[{trigger_id:"trigger_added_b",kind:"extractor_revision_changed",source_id:source.source_id}]},current_source_snapshots:{[source.source_id]:{source_length:text.length,content_hash:source.source_content_hash,extractor_revision:source.extractor_revision}},triggered_conditions:[]});assert.equal(assessed.ok,true,JSON.stringify(assessed));
  const v2=writer.authorizeCanonicalV2({packet:assembled.value,canonical_id:document.canonical_id,claim_set:accepted.value,promotion_input:promotionInput,promotion_receipt:promotionReceipt});assert.equal(v2.ok,true,JSON.stringify(v2));
  const approvalInput={packet:assembled.value,canonical_id:document.canonical_id,evidence:assessed.value,canonical_v2_authorization:v2.value,compensation_plan:{strategy:"restore_exact_before_bytes",target_path:assembled.value.target_path,before_sha256:assembled.value.before_sha256}};
  const approved=writer.authorizeCanonicalUpdate(approvalInput);assert.equal(approved.ok,true,JSON.stringify(approved));
  return {a,disk,adapter,source,document,before,originalAuthorities,originalAuditFiles,approvalInput,packet:assembled.value,authorization:approved.value,request:{packet:assembled.value,authorization:approved.value,adapter}};
}
async function assertReadable(f){const live=await f.adapter.readCanonical(f.packet.target_path);assert.equal(live.bytes,f.packet.after_bytes);const rows=(await reader.create().read({app:f.disk.app})).rows;assert.equal(rows.length,1);assert.equal(trust.isVerifiedRow(rows[0]),true);assert.equal(rows[0].claim_set_hash,f.document.claim_set_hash);assert.deepEqual(rows[0].sources.map(s=>s.source_id).sort(),[f.a.source.source_id,f.source.source_id].sort());const snapshot=wikiRead.buildSnapshot({collection_revision:live.revision,assets:rows});assert.equal(snapshot.counts.verified,1);
  const authority=(await f.adapter.readFinalizedCanonicalAuthorities()).map(obsidian.finalizedCanonicalAuthorityData).find(x=>x.revision===live.revision);
  assert.ok(authority);assert.equal(authority.canonical_v2_authority.claim_set_hash,f.document.claim_set_hash);
  assert.equal(authority.canonical_v2_authority.canonical_sha256,live.revision);
  for(const [p,bytes] of Object.entries(f.originalAuditFiles))assert.equal(await f.disk.app.vault.read(f.disk.app.vault.getAbstractFileByPath(p)),bytes,"old immutable approval must remain unchanged");
  if(process.env.LLMWIKI_INTEGRITY_ARTIFACT_DIR){const out=path.resolve(process.env.LLMWIKI_INTEGRITY_ARTIFACT_DIR);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,"before.md"),f.before.bytes);fs.writeFileSync(path.join(out,"after.md"),live.bytes);fs.writeFileSync(path.join(out,"update-authority-reader.json"),JSON.stringify({fixture:"isolated_on_disk_vault",provider_calls:0,operational_writes:0,old_authorities:f.originalAuthorities,authority,reader:{count:rows.length,verified:trust.isVerifiedRow(rows[0]),source_ids:rows[0].sources.map(x=>x.source_id),canonical_revision:rows[0].canonical_revision},canonical_writes:f.disk.canonicalWrites},null,2));}
  return live;}
test("on-disk A create → B approved supplement → existing verified reader and Wiki candidate reuse",async t=>{const f=await setup(t);const result=await writer.commitApprovedUpdate(f.request,{now:NOW});assert.equal(result.status,"committed",JSON.stringify(result));await assertReadable(f);assert.equal(f.disk.app.vault.getFiles().filter(x=>x.path.startsWith("ZETA/PERMANENT/")).length,1);const writes=f.disk.canonicalWrites;await writer.commitApprovedUpdate(f.request,{now:NOW});assert.equal(f.disk.canonicalWrites,writes);await assertReadable(f);});
for(const kind of ["source","target"])test(`stale ${kind} refuses the approved update without overwriting current bytes`,async t=>{const f=await setup(t);const p=kind==="source"?"ZETA/LITERATURE/probe-b.md":f.packet.target_path;const changed=(await f.disk.app.vault.read(f.disk.app.vault.getAbstractFileByPath(p)))+"\nUser edit.\n";await f.disk.app.vault.modify(f.disk.app.vault.getAbstractFileByPath(p),changed);const writes=f.disk.canonicalWrites;const result=await writer.commitApprovedUpdate(f.request,{now:NOW});assert.notEqual(result.status,"committed",JSON.stringify(result));assert.equal(result.reason,kind==="source"?"stale_source":"stale_before_write",JSON.stringify(result));assert.equal(f.disk.canonicalWrites,writes);assert.equal(await f.disk.app.vault.read(f.disk.app.vault.getAbstractFileByPath(p)),changed);});
for(const userEdit of [false,true])test(`immutable authority failure resumes without duplicate write; subsequent user edit=${userEdit}`,async t=>{const f=await setup(t);let fail=true;const adapter={...f.adapter,async appendImmutableAudit(...args){if(fail){fail=false;throw new Error("isolated_immutable_failure");}return f.adapter.appendImmutableAudit(...args);}};const request={...f.request,adapter};const first=await writer.commitApprovedUpdate(request,{now:NOW});assert.equal(first.status,"committed_authority_pending",JSON.stringify(first));assert.equal((await f.adapter.readCanonical(f.packet.target_path)).bytes,f.packet.after_bytes);const writes=f.disk.canonicalWrites;if(userEdit)await f.disk.app.vault.modify(f.disk.app.vault.getAbstractFileByPath(f.packet.target_path),f.packet.after_bytes+"\nUser amendment after interrupted apply.\n");const retry=await writer.commitApprovedUpdate(request,{now:NOW});
if(process.env.LLMWIKI_INTEGRITY_ARTIFACT_DIR){fs.writeFileSync(path.join(path.resolve(process.env.LLMWIKI_INTEGRITY_ARTIFACT_DIR),`failure-resume-${userEdit?"user-edit":"unchanged"}.json`),JSON.stringify({first,retry,canonical_writes_before_retry:writes,canonical_writes_after_retry:f.disk.canonicalWrites,markdown_after:(await f.adapter.readCanonical(f.packet.target_path)).bytes},null,2));}
if(userEdit){assert.notEqual(retry.status,"committed",JSON.stringify(retry));assert.equal(f.disk.canonicalWrites,writes+1);assert.match((await f.adapter.readCanonical(f.packet.target_path)).bytes,/User amendment/);}else{assert.equal(retry.status,"committed",JSON.stringify(retry));assert.equal(f.disk.canonicalWrites,writes);await assertReadable(f);}});

test("prepared authority audit finalization failure resumes without rewriting Markdown",async t=>{
  const f=await setup(t);let fail=true;
  const adapter={...f.adapter,async repairAudit(...args){if(fail){fail=false;throw new Error("isolated_finalize_failure");}return f.adapter.repairAudit(...args);},async finalizeAudit(...args){if(fail){fail=false;throw new Error("isolated_finalize_failure");}return f.adapter.finalizeAudit(...args);}};
  const request={...f.request,adapter};
  const first=await writer.commitApprovedUpdate(request,{now:NOW});
  assert.equal(first.status,"committed_authority_pending",JSON.stringify(first));
  assert.equal(first.reason,"authority_audit_finalize_failed");
  assert.equal((await f.adapter.readCanonical(f.packet.target_path)).bytes,f.packet.after_bytes);
  const writes=f.disk.canonicalWrites;
  const retry=await writer.commitApprovedUpdate(request,{now:NOW});
  assert.equal(retry.status,"committed",JSON.stringify(retry));
  assert.equal(f.disk.canonicalWrites,writes);await assertReadable(f);
});
test("cloned approval authority cannot authorize changed claim/source bindings",async t=>{
  const f=await setup(t);
  const cloned=JSON.parse(JSON.stringify(f.approvalInput.canonical_v2_authorization));
  const rejected=writer.authorizeCanonicalUpdate({...f.approvalInput,canonical_v2_authorization:cloned});
  assert.equal(rejected.ok,false,JSON.stringify(rejected));
  const without={...f.approvalInput};delete without.canonical_v2_authorization;
  const legacy=writer.authorizeCanonicalUpdate(without);
  if(legacy.ok){const result=await writer.commitApprovedUpdate({...f.request,authorization:legacy.value},{now:NOW});assert.notEqual(result.status,"committed",JSON.stringify(result));}
  assert.equal((await f.adapter.readCanonical(f.packet.target_path)).bytes,f.before.bytes);
  assert.equal(f.disk.canonicalWrites,1);
});

test("recorded six-condition proposal reaches final canonical Markdown through official approval and reader",async t=>{
  // Local integration evidence replay: the source expectations predate provider output.
  const artifact=path.resolve(VIEWS,"../../artifacts/llmwiki-productization-20260909");
  const fixture=JSON.parse(fs.readFileSync(path.join(artifact,"expectations.json"))).cases.find(x=>x.id==="conditions");
  const replay=JSON.parse(fs.readFileSync(path.join(artifact,"proposal-preservation-replay.json"))).outputs.find(x=>x.id==="conditions");
  const recorded=JSON.parse(fs.readFileSync(path.join(artifact,"live-inspection.json"))).results.find(x=>x.id==="conditions").result;
  const baseline=await createTrustedFixture({authorizedOnly:true});
  const disk=diskVault(t),adapter=obsidian.createObsidianAdapter(disk.app);
  await disk.app.vault.create(fixture.virtual_path,fixture.text);
  const source={source_id:recorded.answers[0].citation.source_id,source_kind:"immutable_source",source_revision:trust.sha256(fixture.text),extractor_revision:trust.sha256("synthetic-conditions-extractor"),source_text:fixture.text,source_content_hash:trust.sha256(fixture.text),provider_window:{start:0,end:fixture.text.length}};
  const claimset=claims.createClaimSet({source_snapshots:[source],claims:recorded.answers.map(row=>({origin:"source_extract",text:row.text,citations:[{source_id:source.source_id,provider_span:{start:row.citation.start,end:row.citation.start+row.citation.excerpt.length,span_digest:trust.sha256(row.citation.excerpt)}}]}))});assert.equal(claimset.ok,true,JSON.stringify(claimset));
  const accepted=claims.transitionClaimSet(claimset.value,{claim_set_hash:claimset.value.claim_set_hash,claim_ids:claimset.value.claims.map(x=>x.claim_id),status:"accepted",authorized_by:"fixture_reviewer",authorized_at:NOW});assert.equal(accepted.ok,true);
  const promotionInput={...baseline.promotion_input,title:fixture.question,statement:recorded.answers.map(x=>x.text).join(" "),evidence:[{evidence_id:"evidence_conditions",source_ref:source.source_id,strength:"strong"}],claims:recorded.answers.map((x,i)=>({claim_id:`claim_condition_${i}`,statement:x.text,evidence_refs:["evidence_conditions"],origin:"source_extract",review_status:"accepted"})),principle_boundaries:{conditions:["실내 모형 장치"],exclusions:["실외 모형"],invalidation_conditions:["Source revision changes"]}};
  const receipt=promotion.evaluatePromotion(promotionInput);assert.equal(receipt.canonical_write_eligible,true,JSON.stringify(receipt));
  const document={...baseline.document,canonical_id:"knowledge_conditions_842",title:fixture.question,statement:promotionInput.statement,body:replay.markdown,sources:[{source_id:source.source_id,span:{start:0,end:fixture.text.length}}],claim_set_hash:accepted.value.claim_set_hash,promotion_receipt_hash:trust.sha256(stable(receipt))};
  const operation=operations.parseCanonicalOperation(JSON.stringify({operation_id:"operation_conditions_842",proposal_id:"proposal_conditions_842",proposal_kind:"create",payload_hash:trust.sha256(stable(document))}));assert.equal(operation.ok,true);
  const packet=await canonical.assembleCanonicalPacket({run_id:"run_conditions_842",operation:operation.value,canonical_document:document,source_citations:[{source_id:source.source_id,content_hash:source.source_content_hash,locators:recorded.answers.map(x=>x.citation.locator)}],consent_hash:"c".repeat(64),expires_at:"2099-01-01T00:00:00.000Z",nonce:"nonce_conditions_842_0001"},adapter);assert.equal(packet.ok,true,JSON.stringify(packet));
  const approved=writer.authorizeCanonicalV2({packet:packet.value,canonical_id:document.canonical_id,claim_set:accepted.value,promotion_input:promotionInput,promotion_receipt:receipt});assert.equal(approved.ok,true,JSON.stringify(approved));
  const result=await writer.commitApprovedCanonicalV2({packet:packet.value,authorization:approved.value,adapter},{now:NOW});assert.equal(result.status,"committed",JSON.stringify({result,path:packet.value.target_path,after_hash:packet.value.after_sha256,recomputed:trust.sha256(packet.value.after_bytes),run:packet.value.run_id,operation:packet.value.operation.operation_id}));
  const actual=await adapter.readCanonical(packet.value.target_path);const rows=(await reader.create().read({app:disk.app})).rows;
  assert.equal(rows.length,1);assert.equal(trust.isVerifiedRow(rows[0]),true);
  for(const row of recorded.answers){assert.ok(actual.bytes.includes(row.text));assert.equal(fixture.text.slice(row.citation.start,row.citation.start+row.citation.excerpt.length),row.citation.excerpt);}
  for(const exact of ["실내 모형 장치","10분","전원 표시","점검 시간을 기록","실외 모형에는 적용하지","즉시 중단하고 재개하지"])assert.ok(actual.bytes.includes(exact),exact);
  if(process.env.LLMWIKI_INTEGRITY_ARTIFACT_DIR){const out=path.resolve(process.env.LLMWIKI_INTEGRITY_ARTIFACT_DIR);fs.writeFileSync(path.join(out,"conditions-final-canonical.md"),actual.bytes);fs.writeFileSync(path.join(out,"conditions-final-verification.json"),JSON.stringify({provider_result:"recorded real response replay",actual_provider_calls:0,claim_count:accepted.value.claims.length,reader_verified:trust.isVerifiedRow(rows[0]),revision:actual.revision,source_hash:source.source_content_hash,operational_writes:0},null,2));}
});

test("recorded unresolved conflict remains intact and is ineligible for canonical promotion",async()=>{
  const artifact=path.resolve(VIEWS,"../../artifacts/llmwiki-productization-20260909");
  const replay=JSON.parse(fs.readFileSync(path.join(artifact,"proposal-preservation-replay.json"))).outputs.find(x=>x.id==="conflict");
  const baseline=await createTrustedFixture({authorizedOnly:true});
  const input={...baseline.promotion_input,relation_status:"conflict",statement:replay.markdown};
  const receipt=promotion.evaluatePromotion(input);assert.equal(receipt.canonical_write_eligible,false,JSON.stringify(receipt));
  assert.match(replay.markdown,/10분/);assert.match(replay.markdown,/20분/);assert.match(replay.markdown,/우선순위/);assert.match(replay.markdown,/상충/);
  if(process.env.LLMWIKI_INTEGRITY_ARTIFACT_DIR)fs.writeFileSync(path.join(path.resolve(process.env.LLMWIKI_INTEGRITY_ARTIFACT_DIR),"conflict-promotion-verification.json"),JSON.stringify({actual_provider_calls:0,canonical_writes:0,relation_status:input.relation_status,promotion:receipt,review_markdown:replay.markdown,limitation:"review proposal preserved; Candidate writer not exercised by this test"},null,2));
});

test("immutable entry persisted before head update failure resumes the same approval without duplicate entry",async t=>{
  const f=await setup(t);
  const headPath=".llmwiki-audit/immutable/head.json";
  const originalModify=f.disk.app.vault.modify.bind(f.disk.app.vault);let fail=true;
  f.disk.app.vault.modify=async(file,bytes)=>{if(fail&&file.path===headPath){fail=false;throw new Error("isolated_immutable_head_write_failure");}return originalModify(file,bytes);};
  const first=await writer.commitApprovedUpdate(f.request,{now:NOW});
  assert.equal(first.status,"committed_authority_pending",JSON.stringify(first));
  const filesAfterFirst=f.disk.app.vault.getFiles().filter(x=>x.path.startsWith(".llmwiki-audit/immutable/")&&!x.path.endsWith("/head.json"));
  const entryBytes=Object.fromEntries(await Promise.all(filesAfterFirst.map(async f2=>[f2.path,await f.disk.app.vault.read(f2)])));
  const writes=f.disk.canonicalWrites;
  const retry=await writer.commitApprovedUpdate(f.request,{now:NOW});
  if(process.env.LLMWIKI_INTEGRITY_ARTIFACT_DIR)fs.writeFileSync(path.join(path.resolve(process.env.LLMWIKI_INTEGRITY_ARTIFACT_DIR),"immutable-head-failure-resume.json"),JSON.stringify({first,retry,entry_count_after_first:filesAfterFirst.length,entry_count_after_retry:f.disk.app.vault.getFiles().filter(x=>x.path.startsWith(".llmwiki-audit/immutable/")&&!x.path.endsWith("/head.json")).length,canonical_writes_before_retry:writes,canonical_writes_after_retry:f.disk.canonicalWrites},null,2));
  assert.equal(retry.status,"committed",JSON.stringify(retry));
  assert.equal(f.disk.canonicalWrites,writes);
  assert.equal(f.disk.app.vault.getFiles().filter(x=>x.path.startsWith(".llmwiki-audit/immutable/")&&!x.path.endsWith("/head.json")).length,filesAfterFirst.length);
  for(const [p,bytes] of Object.entries(entryBytes))assert.equal(await f.disk.app.vault.read(f.disk.app.vault.getAbstractFileByPath(p)),bytes);
  await assertReadable(f);
});

test("source changed during audit preparation is rechecked before any canonical write",async t=>{
  const f=await setup(t);let changed=false;
  const adapter={...f.adapter,async prepareAudit(...args){const prepared=await f.adapter.prepareAudit(...args);if(!changed){changed=true;await f.disk.app.vault.modify(f.disk.app.vault.getAbstractFileByPath("ZETA/LITERATURE/probe-b.md"),f.source.source_text+"\nSource changed during preparation.\n");}return prepared;}};
  const writes=f.disk.canonicalWrites;
  const result=await writer.commitApprovedUpdate({...f.request,adapter},{now:NOW});
  assert.notEqual(result.status,"committed",JSON.stringify(result));
  assert.equal(result.reason,"stale_source",JSON.stringify(result));
  assert.equal(f.disk.canonicalWrites,writes);
  assert.equal((await f.adapter.readCanonical(f.packet.target_path)).bytes,f.before.bytes);
});

test("pending immutable head repair cannot overwrite a later user edit or rewrite audit entries",async t=>{
  const f=await setup(t);const headPath=".llmwiki-audit/immutable/head.json";
  const modify=f.disk.app.vault.modify.bind(f.disk.app.vault);let fail=true;
  f.disk.app.vault.modify=async(file,bytes)=>{if(fail&&file.path===headPath){fail=false;throw new Error("isolated_head_failure_before_user_edit");}return modify(file,bytes);};
  const first=await writer.commitApprovedUpdate(f.request,{now:NOW});assert.equal(first.status,"committed_authority_pending",JSON.stringify(first));
  const immutableFiles=f.disk.app.vault.getFiles().filter(x=>x.path.startsWith(".llmwiki-audit/immutable/"));
  const immutableBefore=Object.fromEntries(await Promise.all(immutableFiles.map(async file=>[file.path,await f.disk.app.vault.read(file)])));
  const edited=f.packet.after_bytes+"\nUser edit after head failure.\n";
  await modify(f.disk.app.vault.getAbstractFileByPath(f.packet.target_path),edited);
  const writes=f.disk.canonicalWrites;
  const retried=await writer.commitApprovedUpdate(f.request,{now:NOW});
  assert.notEqual(retried.status,"committed",JSON.stringify(retried));assert.equal(retried.reason,"stale_before_write");
  assert.equal(f.disk.canonicalWrites,writes);assert.equal((await f.adapter.readCanonical(f.packet.target_path)).bytes,edited);
  for(const [p,bytes] of Object.entries(immutableBefore))assert.equal(await f.disk.app.vault.read(f.disk.app.vault.getAbstractFileByPath(p)),bytes);
});

test("canonical create immutable authority failure must resume verified authority rather than return a false duplicate",async t=>{
  const a=await createTrustedFixture({authorizedOnly:true}),disk=diskVault(t);
  await disk.app.vault.create("ZETA/LITERATURE/fixture.md",a.source.source_text);
  const actual=obsidian.createObsidianAdapter(disk.app);let fail=true;
  const adapter={...actual,async appendImmutableAudit(...args){if(fail){fail=false;return {ok:false,reason:"isolated_create_immutable_failure"};}return actual.appendImmutableAudit(...args);}};
  const request={packet:a.packet,authorization:a.authorization,adapter};
  const first=await writer.commitApprovedCanonicalV2(request,{now:NOW});assert.equal(first.status,"committed_authority_pending",JSON.stringify(first));
  const writes=disk.canonicalWrites;
  const retry=await writer.commitApprovedCanonicalV2(request,{now:NOW});
  const rows=(await reader.create().read({app:disk.app})).rows;
  assert.equal(rows.length,1,JSON.stringify({first,retry,reader_count:rows.length}));
  assert.equal(trust.isVerifiedRow(rows[0]),true);assert.equal(disk.canonicalWrites,writes);
});

test("canonical create rejects source change during prepared audit before writing Markdown",async t=>{
  const a=await createTrustedFixture({authorizedOnly:true}),disk=diskVault(t);
  await disk.app.vault.create("ZETA/LITERATURE/fixture.md",a.source.source_text);
  const create=disk.app.vault.create.bind(disk.app.vault);let changed=false;
  disk.app.vault.create=async(p,bytes)=>{const file=await create(p,bytes);if(!changed&&p.startsWith(".llmwiki-audit/")&&!p.includes("/immutable/")){changed=true;await disk.app.vault.modify(disk.app.vault.getAbstractFileByPath("ZETA/LITERATURE/fixture.md"),a.source.source_text+"\nNew source condition.\n");}return file;};
  const adapter=obsidian.createObsidianAdapter(disk.app);
  const result=await writer.commitApprovedCanonicalV2({packet:a.packet,authorization:a.authorization,adapter},{now:NOW});
  assert.notEqual(result.status,"committed",JSON.stringify(result));assert.equal(disk.canonicalWrites,0);
});

test("canonical create rechecks a new Wiki link removed during audit preparation",async t=>{
  const a=await createTrustedFixture({authorizedOnly:true}),disk=diskVault(t);
  await disk.app.vault.create("ZETA/LITERATURE/fixture.md",a.source.source_text);
  await disk.app.vault.create("ZETA/PERMANENT/Related.md","# Related synthetic document\n");
  const adapter=obsidian.createObsidianAdapter(disk.app);
  const document={...a.document,body:a.document.body+"\n[[Related]]\n"};
  const operation=operations.parseCanonicalOperation(JSON.stringify({operation_id:"operation_create_link_race",proposal_id:"proposal_create_link_race",proposal_kind:"create",payload_hash:trust.sha256(stable(document))}));assert.equal(operation.ok,true);
  const packet=await canonical.assembleCanonicalPacket({run_id:"run_create_link_race",operation:operation.value,canonical_document:document,source_citations:a.packet.source_citations,consent_hash:"c".repeat(64),expires_at:"2099-01-01T00:00:00.000Z",nonce:"nonce_create_link_race_0001"},adapter);assert.equal(packet.ok,true,JSON.stringify(packet));
  const authorization=writer.authorizeCanonicalV2({packet:packet.value,canonical_id:document.canonical_id,claim_set:a.claim_set,promotion_input:a.promotion_input,promotion_receipt:a.promotion_receipt});assert.equal(authorization.ok,true,JSON.stringify(authorization));
  const create=disk.app.vault.create.bind(disk.app.vault);let removed=false;
  disk.app.vault.create=async(p,bytes)=>{const f=await create(p,bytes);if(!removed&&p.startsWith(".llmwiki-audit/")&&!p.includes("/immutable/")){removed=true;await disk.app.vault.delete(disk.app.vault.getAbstractFileByPath("ZETA/PERMANENT/Related.md"));}return f;};
  const writes=disk.canonicalWrites;
  const result=await writer.commitApprovedCanonicalV2({packet:packet.value,authorization:authorization.value,adapter},{now:NOW});
  assert.notEqual(result.status,"committed",JSON.stringify(result));assert.equal(disk.canonicalWrites,writes);assert.equal(disk.app.vault.getAbstractFileByPath(packet.value.target_path),null);
});

for(const failure of ["append_throw","first_head_create"])test(`first canonical create ${failure} returns pending and explicit retry repairs authority`,async t=>{
  const a=await createTrustedFixture({authorizedOnly:true}),disk=diskVault(t);
  await disk.app.vault.create("ZETA/LITERATURE/fixture.md",a.source.source_text);
  const actual=obsidian.createObsidianAdapter(disk.app);let fail=true;
  const create=disk.app.vault.create.bind(disk.app.vault);
  if(failure==="first_head_create")disk.app.vault.create=async(p,bytes)=>{if(fail&&p===".llmwiki-audit/immutable/head.json"){fail=false;throw new Error("isolated_first_head_create_failure");}return create(p,bytes);};
  const adapter=failure==="append_throw"?{...actual,async appendImmutableAudit(...args){if(fail){fail=false;throw new Error("isolated_first_append_throw");}return actual.appendImmutableAudit(...args);}}:actual;
  const request={packet:a.packet,authorization:a.authorization,adapter};
  const first=await writer.commitApprovedCanonicalV2(request,{now:NOW});assert.equal(first.status,"committed_authority_pending",JSON.stringify(first));
  const entries=Object.fromEntries(await Promise.all(disk.app.vault.getFiles().filter(x=>x.path.startsWith(".llmwiki-audit/immutable/")&&!x.path.endsWith("/head.json")).map(async file=>[file.path,await disk.app.vault.read(file)])));
  const writes=disk.canonicalWrites;
  const retry=await writer.commitApprovedCanonicalV2(request,{now:NOW});
  const rows=(await reader.create().read({app:disk.app})).rows;assert.equal(rows.length,1,JSON.stringify({first,retry}));assert.equal(trust.isVerifiedRow(rows[0]),true);assert.equal(disk.canonicalWrites,writes);
  for(const [p,bytes] of Object.entries(entries))assert.equal(await disk.app.vault.read(disk.app.vault.getAbstractFileByPath(p)),bytes);
});
