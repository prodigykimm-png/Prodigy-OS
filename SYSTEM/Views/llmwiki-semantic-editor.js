(function (root) {
  "use strict";
  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  const VERSION = "llmwiki_semantic_editor_v1";
  function freeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
  function sha(value) { return hashApi.sha256(String(value)); }
  function clean(value) { return String(value || "").replace(/\s+/gu, " ").trim(); }
  function numbers(value) { return [...clean(value).matchAll(/\d[\d,.]*\s*(?:cm|m|장|차|만\s*원|만원|억원|원|센티|회|개)?/gu)].map(row => row[0].replace(/\s+/gu, "").replace(/,/gu, "")); }
  function splitText(text, max = 220) {
    const source = clean(text); const pieces = []; let cursor = 0;
    const sentences = [...source.matchAll(/[^.!?。！？]+[.!?。！？]?/gu)].map(row => clean(row[0])).filter(Boolean);
    for (const sentence of sentences) {
      if (sentence.length <= max) { pieces.push(sentence); continue; }
      let start = 0;
      while (start < sentence.length) {
        let end = Math.min(sentence.length, start + max);
        if (end < sentence.length) { const boundary = sentence.lastIndexOf(" ", end); if (boundary > start + 100) end = boundary; }
        pieces.push(clean(sentence.slice(start, end))); start = end; while (sentence[start] === " ") start += 1;
      }
    }
    return pieces.filter(row => row.length >= 8);
  }
  function sectionKind(text) {
    if (/자신을 .*소개|글을 작성|마무리|지켜봐|농담|패셔니스타|시골 처녀|말씀을 많이 들|궁금해|바랐|소감을 남|프로젝트 \d+편|\d+편에서는|기록을 시작/iu.test(text)) return "source_context";
    if (/\d[\d,.]*\s*(?:만\s*원|만원|억원|원)|비용|가격|견적|구입|절감/iu.test(text)) return "costs";
    if (/문제|실패|주의|위험|안되|어렵|힘들|불편|추가 작업/iu.test(text)) return "risks";
    if (/허가|도면|착공|순서|시작|공정/iu.test(text)) return "process";
    if (/보강토|성토|철골|콘크리트|미장|시공|쌓/iu.test(text)) return "construction";
    if (/외장|징크|마감|창호|인테리어/iu.test(text)) return "finishes";
    return "experience";
  }
  function atomize(claims) {
    const atoms = [];
    for (const claim of claims || []) {
      splitText(claim.text).forEach((text, index) => atoms.push(freeze({ atom_id: `atom_${sha(`${claim.claim_id}|${index}|${text}`).slice(0,24)}`, parent_claim_id: claim.claim_id, text, section_kind: sectionKind(text), numbers: numbers(text) })));
    }
    return freeze(atoms);
  }
  function plan(atoms) {
    return freeze({ version: VERSION, assignments: atoms.map((atom, order) => freeze({ atom_id: atom.atom_id, section_kind: atom.section_kind, order })) });
  }
  function audit(input) {
    const expected = input.atoms.map(row => row.atom_id).sort(); const used = input.paragraphs.flatMap(row => row.atom_ids || []).sort();
    const exact = expected.length === used.length && expected.every((id, i) => id === used[i]);
    const atomById = new Map(input.atoms.map((atom) => [atom.atom_id, atom]));
    const mixedContextParagraphs = input.paragraphs.filter((paragraph) => {
      const kinds = new Set((paragraph.atom_ids || []).map((id) => atomById.get(id)?.section_kind));
      return kinds.has("source_context") && kinds.size > 1;
    });
    const available = new Set(input.atoms.flatMap(row => row.numbers));
    const drafted = new Set(input.paragraphs.flatMap(row => numbers(row.text)));
    const unsupported = [...drafted].filter(value => !available.has(value));
    const missing = [...available].filter(value => !drafted.has(value));
    return freeze({ ok: exact && unsupported.length === 0 && missing.length === 0 && mixedContextParagraphs.length === 0,
      lineage_complete: exact, unsupported_numbers: unsupported, missing_numbers: missing,
      mixed_context_paragraphs: mixedContextParagraphs.length });
  }
  const api = freeze({ VERSION, atomize, plan, audit, numbers, sectionKind }); root.LLMWikiSemanticEditor = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
