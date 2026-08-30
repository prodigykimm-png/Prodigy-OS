(function (root) {
  "use strict";
  const VERSION = "llmwiki_taxonomy_v1";
  const PAGE_RULES = Object.freeze([
    [/웨딩|스냅|신부|신랑|혼주|포징|렌즈|카메라|촬영|구도|노출|디렉팅|원판/u, "procedure_workflow", "photography/wedding-snap"],
    [/명도|인도명령|점유|강제집행|보관집행|부당이득/u, "procedure_workflow", "real-estate/enforcement"],
    [/세무|세금|취득세|증여세|재산세/u, "concept_reference", "real-estate/tax"],
    [/대출|담보|감정평가|레버리지|현금흐름/u, "decision_guide", "real-estate/finance"],
    [/인테리어|리모델링|마감|도배|타일|누수|하자|동파|열선|유지보수/u, "procedure_workflow", "real-estate/interior"],
    [/건축|시공|단열|설비|재건축 진단|안전진단|사업시행인가|관리처분인가|정비사업|공정|사업비/u, "procedure_workflow", "real-estate/construction"],
    [/토지|농지|맹지|인허가|진입로|정비구역|가로주택|모아타운|소규모 정비/u, "decision_guide", "real-estate/land"],
    [/입지|상권|지역/u, "decision_guide", "real-estate/location"],
    [/중개|거래|협상/u, "decision_guide", "real-estate/transaction"],
    [/권리|가등기|배당|유치권|경매|공매|재당첨|입주권|조합원|권리산정/u, "concept_reference", "real-estate/rights"],
  ]);
  function classifyPage(page) {
    const text = `${page?.title || ""} ${page?.purpose || ""}`;
    const row = PAGE_RULES.find(([pattern]) => pattern.test(text));
    return Object.freeze(row ? { archetype: row[1], cluster: row[2], taxonomy_version: VERSION } : { archetype: "concept_reference", cluster: "general/reference", taxonomy_version: VERSION });
  }
  const api = Object.freeze({ VERSION, PAGE_RULES, classifyPage });
  root.LLMWikiTaxonomy = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
