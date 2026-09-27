'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=__dirname,root=path.resolve(base,'../..');
const evidence=JSON.parse(fs.readFileSync(path.join(base,'live-inspection.json'))),expectations=JSON.parse(fs.readFileSync(path.join(base,'expectations.json')));
const hash=require(path.join(root,'SYSTEM/Views/llmwiki-hash.js'));
const service=require(path.join(root,'SYSTEM/Views/llmwiki-wiki-read-service.js'));
const materializer=require(path.join(root,'SYSTEM/Views/llmwiki-inbox-proposal-materializer.js')).createInboxProposalMaterializer();
(async()=>{
 const outputs=[];global.ProdigyAIConsumerRuntime={};
 for(const fixture of expectations.cases){
  const recorded=evidence.results.find(row=>row.id===fixture.id);let calls=0;
  global.ProdigyAIConsumerRuntime.requestStructured=async()=>{calls++;return {payload:structuredClone(recorded.provider_payloads[0].payload)};};
  const app={vault:{getAbstractFileByPath:p=>({path:p}),read:async()=>fixture.text}};
  const answer=await service.answerSourceQuestion({app,source:{path:fixture.virtual_path,content_hash:hash.sha256(fixture.text)},question:fixture.question});assert.equal(answer.ok,true,JSON.stringify(answer));
  const proposal=await service.prepareQuestionProposal({app,answer});assert.equal(proposal.ok,true);
  let proposals=[];const controller={getSnapshot:()=>({risk_packets:proposals}),openPreparedRiskReview(input){proposals=input.proposals;return {ok:true};}};
  const handoff=await service.handoffQuestionProposal({app,proposal,materializer,controller});assert.equal(handoff.ok,true,JSON.stringify(handoff));assert.equal(proposals.length,1);
  const markdown=proposals[0].document.body;
  for(const row of answer.answers)assert.ok(markdown.includes(row.text));
  for(const note of answer.review_notes)assert.ok(markdown.includes(note));
  assert.equal(proposal.proposal_bundle.proposals[0].claims.length,answer.answers.length);
  assert.equal(answer.answers.length,fixture.id==='conditions'?6:2);
  fs.writeFileSync(path.join(base,`proposal-preserved-${fixture.id}.md`),markdown);
  outputs.push({id:fixture.id,claim_count:answer.answers.length,review_notes:answer.review_notes,proposal:proposal.proposal_bundle,markdown,replay_transport_calls:calls,actual_provider_calls:0,canonical_writes:0,handoff:'controller seam; not real Obsidian UI'});
 }
 fs.writeFileSync(path.join(base,'proposal-preservation-replay.json'),JSON.stringify({kind:'recorded real provider payload replay through current proposal/materializer; no new provider call',outputs},null,2)+'\n');
})().catch(e=>{console.error(e);process.exitCode=1;});
