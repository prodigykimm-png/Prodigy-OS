(function (root) {
  "use strict";

  if (typeof require === "function" && !root.DailyReflectionProposalContract) root.DailyReflectionProposalContract = require("./daily-reflection-proposal-contract.js");

  function clean(value) { return root.DailyReflectionProposalContract.clean(value); }
  function normalized(value) { return clean(value).normalize("NFC").toLocaleLowerCase("ko-KR"); }
  function compactCaseNumber(value) { return normalized(value).replace(/\s+/g, ""); }
  const REGION_NODES = new Set(["서울", "경기", "인천", "부산", "부천", "대구", "대전", "광주", "울산", "세종", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"]);
  function evidenceText(block) { return normalized([block.title, block.experience, block.interpretation, block.change, block.next_experiment].join(" ")); }
  function auctionCaseBase(value) { const match = compactCaseNumber(value).match(/(\d{4}타경\d+)/); return match ? match[1] : ""; }
  function hasTentativeCue(text) { return /것\s*같|거\s*같|듯|수\s*있|가능성|추정|아마/.test(text); }
  function contentWords(value) { return normalized(value).match(/[0-9a-z가-힣]{2,}/g) || []; }
  function wordStem(value) { return clean(value).replace(/(은|는|이|가|을|를|의|와|과|도|로|으로|에서|에게|된|되어|했다|한다|같다)$/u, ""); }
  function relatedWord(left, right) {
    const a = wordStem(left);
    const b = wordStem(right);
    return a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a));
  }
  function unsupportedHan(value, source) { const sourceChars = new Set(clean(source).match(/\p{Script=Han}/gu) || []); return (clean(value).match(/\p{Script=Han}/gu) || []).some((char) => !sourceChars.has(char)); }
  function explicitDirective(text) { const match = clean(text).match(/([가-힣][가-힣0-9\s,·]*(?:하자|해지자|되자|말자))(?=$|[\s.!?。])/); return match ? clean(match[1]) : ""; }
  function hasOperationalCue(text) { return /확인|검토|비교|기록|정리|준비|조사|체크|기준|살핀|살피|피한다|줄인다|늘린다|조정|선택|진행|입찰|촬영/.test(text); }
  function operationalChange(value) { const text = normalized(value); return hasOperationalCue(text) || /신중|조심|주의|책임|절차|판단/.test(text); }
  function sloganChange(value) { return /(힘내|부자|성공|화이팅|파이팅|잘\s*되|꿈)/.test(normalized(value)) && !operationalChange(value); }
  function hasUnchosenExploration(text) { return /던가|눈을\s*돌리|방안(?:을)?\s*찾아봐야겠다/.test(text); }
  function sourceSentences(value) { return clean(value).split(/(?<=[.!?。])\s*/).map(clean).filter(Boolean); }
  function sourceGroundedInterpretation(block, source, hint) {
    const blockWords = new Set(contentWords(evidenceText(block)));
    const hintWords = new Set(contentWords(hint));
    const sentences = sourceSentences(source);
    let best = "";
    let bestScore = 0;
    for (let index = 0; index < sentences.length; index += 1) {
      const sentence = sentences[index];
      if (!(hasTentativeCue(sentence) || /느꼈|생각했|판단했|후회|아쉽|동병상련/.test(sentence))) continue;
      const nearby = [sentences[index - 1], sentence, sentences[index + 1]].filter(Boolean).join(" ");
      const score = contentWords(nearby).filter((word) => Array.from(blockWords).some((blockWord) => relatedWord(word, blockWord))).length
        + (hintWords.size ? contentWords(sentence).filter((word) => Array.from(hintWords).some((hintWord) => relatedWord(word, hintWord))).length * 3 : 0);
      if (score > bestScore) {
        best = sentence;
        bestScore = score;
      }
    }
    return best;
  }
  function knowledgeSupport(label, source) {
    const words = contentWords(label);
    const sourceWords = contentWords(source);
    const supported = words.filter((word) => source.includes(word) || sourceWords.some((sourceWord) => sourceWord.includes(word) || word.includes(sourceWord))).length;
    return { words, supported };
  }
  function unsupportedKnowledge(label, source) { const support = knowledgeSupport(label, source); return !support.words.length || support.supported === 0; }
  function partiallyGroundedKnowledge(label, source) { const support = knowledgeSupport(label, source); return support.words.length > 4 && support.supported <= Math.floor(support.words.length / 2); }
  function sourceEvidenceIdsForName(proposal, name) { const target = normalized(name); return (proposal.evidence_blocks || []).filter((block) => evidenceText(block).includes(target)).map((block) => block.evidence_id); }
  function cleanBusinessCandidate(value) { const tokens = clean(value).split(/\s+/).filter(Boolean); while (tokens.length > 1 && (/^(오늘|어제|이번|그리고|또)$/.test(tokens[0]) || /(와|과|랑|하고|및)$/.test(tokens[0]))) tokens.shift(); if (tokens.length) tokens[tokens.length - 1] = tokens[tokens.length - 1].replace(/[을를도에]$/, ""); return tokens.join(" "); }
  function addExplicitBusinessResources(proposal, source) {
    const existing = new Set((proposal.resource_candidates || []).map((item) => normalized(item.name)));
    for (const match of source.matchAll(/([0-9A-Za-z가-힣&.'·-]+(?:\s+[0-9A-Za-z가-힣&.'·-]+){0,2})(?=\s*(?:을|를|도|에|에서|먹|방문|갔))/g)) {
      const name = cleanBusinessCandidate(match[1]);
      const key = normalized(name);
      const sourceIds = sourceEvidenceIdsForName(proposal, name);
      if (!existing.has(key) && sourceIds.length && name.split(/\s+/).length === 2 && name.split(/\s+/).every((token) => token.length > 1)) proposal.resource_candidates.push({ name, suggested_type: "resource", source_evidence_ids: sourceIds });
      if (sourceIds.length) existing.add(key);
    }
  }
  function localPeopleNameExists(app, person) { const target = normalized(person); const files = app && app.vault && typeof app.vault.getMarkdownFiles === "function" ? app.vault.getMarkdownFiles() : []; return files.some((file) => String(file.path || "").startsWith("PARA/RESOURCES/CONTACTS/") && normalized(file.basename) === target); }
  function addExplicitPeopleLinks(proposal, source, app) {
    const existing = new Set((proposal.object_linking_suggestions || []).filter((item) => normalized(item.object_kind) === "people").map((item) => normalized(item.name)));
    const resourceNames = (proposal.resource_candidates || []).map((item) => normalized(item.name));
    const add = (name) => {
      const person = clean(name).replace(/\s*[\(\（][^\)\）]*[\)\）]\s*/g, "").trim();
      const key = normalized(person);
      const sourceIds = sourceEvidenceIdsForName(proposal, person);
      if (!key || existing.has(key) || REGION_NODES.has(person) || resourceNames.some((resource) => resource.startsWith(key)) || !sourceIds.length || !localPeopleNameExists(app, person)) return;
      proposal.object_linking_suggestions.push({ name: person, object_kind: "people", source_evidence_ids: sourceIds, existence: "unknown" });
      existing.add(key);
    };
    [/([가-힣]{2,4})(?:\s*[\(\（][^\)\）]*[\)\）])?\s*(?:과|와|이랑|랑)(?=\s)/g, /([가-힣]{2,4})의\s+[가-힣]{2,}/g].forEach((pattern) => { for (const match of source.matchAll(pattern)) add(match[1]); });
  }
  function explicitAuctionSubitems(source) {
    const result = new Map();
    const basePattern = /(\d{4}\s*타경\s*\d+)/g;
    let match = basePattern.exec(source);
    while (match) {
      const base = compactCaseNumber(match[1]);
      const subitems = result.get(base) || new Set();
      for (const subMatch of source.slice(match.index, match.index + 100).matchAll(/\(\s*(\d+)\s*\)/g)) subitems.add(subMatch[1]);
      if (subitems.size) result.set(base, subitems);
      match = basePattern.exec(source);
    }
    return result;
  }
  function localAuctionSubitemSuggestions(proposal, source, app) {
    const files = app && app.vault && typeof app.vault.getMarkdownFiles === "function" ? app.vault.getMarkdownFiles() : [];
    const suggestions = [];
    explicitAuctionSubitems(source).forEach((subitems, base) => subitems.forEach((subitem) => {
      const file = files.find((candidate) => {
        const fileBase = compactCaseNumber(candidate && candidate.basename);
        const filePath = normalized(candidate && candidate.path);
        return filePath.startsWith("para/projects/auction/") && fileBase.includes(base) && (fileBase.includes(`_${subitem}`) || fileBase.includes(`(${subitem})`));
      });
      const sourceIds = (proposal.evidence_blocks || []).filter((block) => compactCaseNumber(evidenceText(block)).includes(base) && compactCaseNumber(evidenceText(block)).includes(`(${subitem})`)).map((block) => block.evidence_id);
      if (file && sourceIds.length) suggestions.push({ name: file.basename, object_kind: "auction", source_evidence_ids: sourceIds, existence: "unknown", case_base: base });
    }));
    return suggestions;
  }
  function applyEvidenceFactualityPolicy(proposal, source) {
    const sourceText = normalized(source);
    (proposal.evidence_blocks || []).forEach((block) => {
      const text = evidenceText(block);
      const originalInterpretation = block.interpretation;
      const interpretation = normalized(originalInterpretation);
      if (interpretation && (hasTentativeCue(text) || hasTentativeCue(sourceText)) && !hasTentativeCue(interpretation) && (/원인|때문|과열|확실|단정/.test(interpretation) || /과열/.test(sourceText))) block.interpretation = "";
      if (interpretation && (unsupportedHan(block.interpretation, source) || unsupportedKnowledge(interpretation, sourceText))) block.interpretation = "";
      if (!clean(block.interpretation)) block.interpretation = sourceGroundedInterpretation(block, source, originalInterpretation);
      const directive = explicitDirective(text);
      if (clean(block.change) && sloganChange(block.change)) block.change = "";
      if (directive && !clean(block.change) && operationalChange(directive) && !sloganChange(directive)) block.change = directive;
      const nextDirective = explicitDirective(block.next_experiment);
      if (nextDirective) { if (!clean(block.change) && operationalChange(nextDirective) && !sloganChange(nextDirective)) block.change = nextDirective; block.next_experiment = ""; }
      if (clean(block.change) && sloganChange(block.change)) block.change = "";
      if (clean(block.next_experiment) && (hasUnchosenExploration(text) || hasUnchosenExploration(sourceText))) block.next_experiment = "";
    });
  }
  function applyUncertaintyPolicy(proposal, source) {
    proposal.uncertainties = (proposal.uncertainties || []).filter((item) => contentWords(item).some((word) => source.includes(word)) && !unsupportedKnowledge(normalized(item), source));
  }
  function knowledgeSourceText(proposal, candidate) {
    const ids = new Set(candidate.source_evidence_ids || []);
    return normalized((proposal.evidence_blocks || []).filter((block) => ids.has(block.evidence_id)).map((block) => [block.title, block.experience, block.interpretation, block.change].join(" ")).join(" "));
  }
  function stablePreNodes(context) { return new Set(({ auction: ["auction", "경매"], people: ["people", "관계"], work: ["work", "업무"], personal: ["personal", "개인"], health: ["health", "건강"], decision: ["decision", "의사결정"], project: ["project", "프로젝트"], reading: ["reading", "독서"], workout: ["workout", "운동"], integrity: ["integrity"] })[context] || []); }
  function applyPreRoutingPolicy(proposal, source) {
    const blocksById = new Map((proposal.evidence_blocks || []).map((block) => [block.evidence_id, block]));
    const seen = new Set();
    proposal.pre_routing_suggestions = (proposal.pre_routing_suggestions || []).map((item) => {
      const allowed = new Set();
      (item.source_evidence_ids || []).map((id) => blocksById.get(id)).filter(Boolean).forEach((block) => stablePreNodes(block.context).forEach((node) => allowed.add(node)));
      let path = (item.path || []).filter((node) => source.includes(normalized(node)) || allowed.has(normalized(node)));
      if (path.filter((node) => REGION_NODES.has(clean(node))).length > 1) path = path.filter((node) => !REGION_NODES.has(clean(node)));
      return Object.assign({}, item, { path });
    }).filter((item) => {
      const key = `${(item.source_evidence_ids || []).join("|")}::${(item.path || []).join(">")}`;
      if (!item.path.length || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  function normalizeObjectLinkSuggestion(item) {
    const kind = normalized(item && item.object_kind);
    if (kind === "people" || kind === "person") item.name = clean(item.name).replace(/\s*[\(\（][^\)\）]*[\)\）]\s*/g, "").trim();
    return item;
  }
  function applyConservativeProposalPolicy(proposal, freeText, app) {
    const source = normalized(freeText);
    const mentioned = (item) => {
      const name = normalized(item && item.name);
      return Boolean(name && source.includes(name));
    };
    applyEvidenceFactualityPolicy(proposal, freeText);
    applyUncertaintyPolicy(proposal, source);
    applyPreRoutingPolicy(proposal, source);
    addExplicitBusinessResources(proposal, source);
    const seenSources = new Set();
    proposal.knowledge_candidates = (proposal.knowledge_candidates || []).filter((candidate) => {
      const label = normalized(candidate.title || candidate.label);
      const detail = normalized(candidate.detail || candidate.statement);
      const candidateText = `${label} ${detail}`.trim();
      const sourceText = knowledgeSourceText(proposal, candidate);
      if (sloganChange(candidateText) || unsupportedHan(candidateText, sourceText) || unsupportedKnowledge(candidateText, sourceText)) return false;
      if (partiallyGroundedKnowledge(candidateText, sourceText)) candidate.confidence = "low";
      const key = `${candidateText}::${(candidate.source_evidence_ids || []).slice().sort().join("|")}`;
      if (!key || seenSources.has(key)) return false;
      seenSources.add(key);
      return true;
    });
    proposal.resource_candidates = (proposal.resource_candidates || []).filter(mentioned);
    const resourceNames = new Set((proposal.resource_candidates || []).map((item) => normalized(item.name)));
    addExplicitPeopleLinks(proposal, source, app);
    proposal.object_linking_suggestions = (proposal.object_linking_suggestions || []).map(normalizeObjectLinkSuggestion).filter((item) => {
      const name = normalized(item && item.name);
      const kind = normalized(item && item.object_kind);
      return mentioned(item) && (kind === "people" || kind === "person" || kind === "auction" || kind === "auction_case" || kind === "project") && !(kind === "people" && resourceNames.has(name));
    });
    const auctionSubitems = localAuctionSubitemSuggestions(proposal, source, app);
    if (auctionSubitems.length) {
      const localNames = new Set(auctionSubitems.map((item) => normalized(item.name)));
      const localBases = new Set(auctionSubitems.map((item) => item.case_base));
      proposal.object_linking_suggestions = proposal.object_linking_suggestions.filter((item) => normalized(item.object_kind) !== "auction" || localNames.has(normalized(item.name)) || !localBases.has(auctionCaseBase(item.name)));
      auctionSubitems.forEach((item) => {
        if (!localNames.has(normalized(item.name))) return;
        if (!proposal.object_linking_suggestions.some((existing) => normalized(existing.name) === normalized(item.name) && normalized(existing.object_kind) === "auction")) {
          proposal.object_linking_suggestions.push({ name: item.name, object_kind: "auction", source_evidence_ids: item.source_evidence_ids, existence: "unknown" });
        }
      });
    }
    return proposal;
  }

  const api = { applyConservativeProposalPolicy };
  root.DailyReflectionConservativePolicy = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
