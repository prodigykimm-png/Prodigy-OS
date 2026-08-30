(function(root){
"use strict";
const decision=root.LLMWikiCandidateDecision||(typeof require==="function"?require("./llmwiki-candidate-decision.js"):null);
const tags=root.LLMWikiTagRegistry||(typeof require==="function"?require("./llmwiki-tag-registry.js"):null);
const VERSION="llmwiki_plan_resolver_v1";
function freeze(v){if(Array.isArray(v))return Object.freeze(v.map(freeze));if(!v||typeof v!=="object")return v;return Object.freeze(Object.fromEntries(Object.entries(v).map(([k,x])=>[k,freeze(x)])));}
function resolve(input){if(!input||typeof input!=="object"||!Array.isArray(input.pages))return freeze({ok:false,reason:"invalid_resolver_input",writer_count:0});const rows=[];for(const page of input.pages){const d=decision.decide({page_identity:page.page_id,content_relation:page.content_relation,candidates:page.candidates||[],source_only_authority:page.source_only_authority===true});const t=tags.resolve({primary_cluster:page.primary_cluster,secondary_cluster:page.secondary_cluster,cross_domain:page.cross_domain===true});rows.push({page_id:page.page_id,decision:d,tag_decision:t,candidate_evidence:Array.isArray(page.candidate_evidence)?page.candidate_evidence:[],status:!d.ok?"safety_blocked":d.action==="hold"||!t.ok?"quality_held":d.status});}return freeze({ok:true,version:VERSION,rows,writer_count:0,provider_count:0});}
const api=freeze({VERSION,resolve});root.LLMWikiPlanResolver=api;if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
