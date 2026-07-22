(function (root) {
  "use strict";

  var FIELD_ALIASES = {
    context: ["context", "컨텍스트", "상황"],
    related_objects: ["related objects", "related_objects", "연관", "연결 object", "연결"],
    experience: ["experience", "경험", "성찰", "reflection"],
    interpretation: ["interpretation", "해석", "의미"],
    change: ["change", "변화"],
    next_experiment: ["next experiment", "next_experiment", "다음 실험", "실험"]
  };

  var ID_COMMENT_RE = /<!--\s*evidence_id\s*:\s*(daily-\d{4}-\d{2}-\d{2}-e\d{2,})\s*-->/i;
  var EVIDENCE_SECTION_RE = /^##\s+Evidence\s*\n([\s\S]*?)(?=^##\s+(?!#)|$(?![\s\S]))/im;
  var HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;

  function stripFrontmatter(text) {
    if (!text || !text.startsWith("---\n")) return text || "";
    var end = text.indexOf("\n---", 4);
    if (end === -1) return text;
    return text.slice(end + 4).replace(/^\s+/, "");
  }

  function normalizeHeading(raw) {
    return (raw || "").replace(/\s*\([^)]*\)/g, "").trim();
  }

  function extractHeadingSections(markdown) {
    var sections = {};
    var current = "";
    var lines = (markdown || "").split("\n");
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(HEADING_RE);
      if (m) { current = normalizeHeading(m[2]); if (!sections[current]) sections[current] = []; continue; }
      if (current) sections[current].push(lines[i]);
    }
    var result = {};
    for (var k in sections) result[k] = sections[k].join("\n").trim();
    return result;
  }

  function findSection(sections, aliases) {
    for (var i = 0; i < aliases.length; i++) {
      if (sections[aliases[i]] !== undefined) return sections[aliases[i]];
    }
    for (var heading in sections) {
      for (var j = 0; j < aliases.length; j++) {
        if (heading.toLowerCase().indexOf(aliases[j].toLowerCase()) !== -1) return sections[heading];
      }
    }
    return "";
  }

  function extractLinks(text) {
    var links = [];
    var re = /\[\[([^\]]+)\]\]/g;
    var m;
    while ((m = re.exec(text || "")) !== null) {
      var target = m[1].split("|")[0].split("#")[0].trim();
      if (target && links.indexOf("[[" + target + "]]") === -1) links.push("[[" + target + "]]");
    }
    return links;
  }

  function resolveLabel(label) {
    var key = label.trim().toLowerCase().replace(/:$/, "").replace(/\s+/g, " ");
    for (var field in FIELD_ALIASES) {
      var aliases = FIELD_ALIASES[field];
      for (var i = 0; i < aliases.length; i++) {
        if (key === aliases[i] || key.indexOf(aliases[i]) !== -1) return field;
      }
    }
    return null;
  }

  function parseFieldBody(body) {
    var lines = (body || "").split("\n");
    var fields = {};
    for (var k in FIELD_ALIASES) fields[k] = [];
    var current = null;
    var leftover = [];
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].trim().match(/^([A-Za-z가-힣 _]+)\s*:\s*(.*)$/);
      if (m) {
        var field = resolveLabel(m[1]);
        if (field) { current = field; if (m[2].trim()) fields[field].push(m[2].trim()); continue; }
      }
      if (current) fields[current].push(lines[i].replace(/\s+$/, ""));
      else leftover.push(lines[i].replace(/\s+$/, ""));
    }
    var out = {};
    for (var f in fields) out[f] = fields[f].join("\n").trim();
    if (!out.experience && leftover.length) out.experience = leftover.join("\n").trim();
    return out;
  }

  function titleAndId(heading, day, index) {
    var h = heading.trim();
    var explicit = h.match(/^(?:e(\d{2,})|\[e(\d{2,})\])\s*[·\-\|:]\s*(.+)$/i);
    if (explicit) {
      var num = explicit[1] || explicit[2];
      return { title: explicit[3].trim(), id: "daily-" + day + "-e" + String(parseInt(num, 10)).padStart(2, "0") };
    }
    var bracket = h.match(/^\[e(\d{2,})\]\s*(.+)$/i);
    if (bracket) return { title: bracket[2].trim(), id: "daily-" + day + "-e" + String(parseInt(bracket[1], 10)).padStart(2, "0") };
    return { title: h, id: "daily-" + day + "-e" + String(index).padStart(2, "0") };
  }

  function parseEvidenceSection(sectionBody, day) {
    if (!(sectionBody || "").trim()) return [];
    var blocksRaw = [];
    var currentTitle = "";
    var buf = [];
    var lines = sectionBody.split("\n");
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^###\s+(.+?)\s*$/);
      if (m) {
        if (currentTitle) blocksRaw.push({ heading: currentTitle, body: buf.join("\n").trim() });
        currentTitle = m[1].trim();
        buf = [];
      } else { buf.push(lines[i]); }
    }
    if (currentTitle) blocksRaw.push({ heading: currentTitle, body: buf.join("\n").trim() });

    var usedIds = {};
    var prelim = [];
    for (var j = 0; j < blocksRaw.length; j++) {
      var raw = blocksRaw[j];
      var idMatch = raw.body.match(ID_COMMENT_RE);
      var ti = titleAndId(raw.heading, day, j + 1);
      var evidenceId = idMatch ? idMatch[1] : ti.id;
      var bodyClean = raw.body.replace(ID_COMMENT_RE, "").trim();
      var fields = parseFieldBody(bodyClean);
      var experience = (fields.experience || "").trim();
      if (!experience && !ti.title) continue;
      if (!experience) experience = ti.title;
      prelim.push({
        evidence_id: evidenceId,
        title: (ti.title || experience.slice(0, 40)).replace(/\s+/g, " ").slice(0, 80),
        context: (fields.context || "").trim().toLowerCase(),
        related_objects: extractLinks(fields.related_objects || "") || extractLinks(bodyClean),
        experience: experience,
        interpretation: (fields.interpretation || "").trim(),
        change: (fields.change || "").trim(),
        next_experiment: (fields.next_experiment || "").trim()
      });
      usedIds[evidenceId] = true;
    }

    var seen = {};
    var nextNum = 1;
    var final = [];
    for (var k = 0; k < prelim.length; k++) {
      var block = prelim[k];
      var eid = block.evidence_id;
      if (seen[eid]) {
        while (seen["daily-" + day + "-e" + String(nextNum).padStart(2, "0")] || usedIds["daily-" + day + "-e" + String(nextNum).padStart(2, "0")]) nextNum++;
        eid = "daily-" + day + "-e" + String(nextNum).padStart(2, "0");
        nextNum++;
      }
      seen[eid] = true;
      block.evidence_id = eid;
      final.push(block);
    }
    return final;
  }

  function parseLegacy(body, day) {
    var sections = extractHeadingSections(body);
    var reflection = findSection(sections, ["성찰", "Reflection"]);
    var change = findSection(sections, ["변화", "Change"]);
    var experiment = findSection(sections, ["다음 실험", "Next Experiment"]);
    var references = findSection(sections, ["연관 참조", "References"]);
    function stripPrompts(text) {
      return (text || "").split("\n").filter(function (l) {
        var s = l.trim();
        return !(s.startsWith("*") && s.endsWith("*")) && s !== "" && s !== "-";
      }).join("\n").trim();
    }
    reflection = stripPrompts(reflection);
    change = stripPrompts(change);
    experiment = stripPrompts(experiment);
    if (!reflection && !change && !experiment) return [];
    var links = extractLinks([reflection, change, experiment, references].join("\n"));
    return [{
      evidence_id: "daily-" + day,
      title: "Daily Reflection",
      context: "",
      related_objects: links,
      experience: reflection,
      interpretation: "",
      change: change,
      next_experiment: experiment,
      legacy: true
    }];
  }

  function parseDailyEvidenceBlocks(markdown, day) {
    var body = stripFrontmatter(markdown || "");
    var m = body.match(EVIDENCE_SECTION_RE);
    if (m) {
      var blocks = parseEvidenceSection(m[1], day);
      if (blocks.length) return blocks;
    }
    return parseLegacy(body, day);
  }

  function parseISOWeek(weekStr) {
    var m = (weekStr || "").match(/^(\d{4})-W(\d{2})$/);
    if (!m) return null;
    var year = parseInt(m[1], 10);
    var week = parseInt(m[2], 10);
    if (week < 1 || week > 53) return null;
    var jan4 = new Date(Date.UTC(year, 0, 4));
    var dayOfWeek = jan4.getUTCDay() || 7;
    var start = new Date(jan4.getTime());
    start.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7);
    var end = new Date(start.getTime());
    end.setUTCDate(start.getUTCDate() + 6);
    return { start: start, end: end, week: weekStr };
  }

  function currentISOWeek(date) {
    var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    var dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return d.getUTCFullYear() + "-W" + String(weekNo).padStart(2, "0");
  }

  function formatDate(d) {
    return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
  }


  function getDay(evidenceId) {
    var m = (evidenceId || "").match(/daily-(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : "";
  }

  function uniqueDays(refs) {
    var days = {};
    for (var i = 0; i < refs.length; i++) days[getDay(refs[i])] = true;
    return Object.keys(days);
  }

  function normalizeForDedup(text) {
    return (text || "")
      .replace(/\s+/g, "")
      .replace(/[.,!?;:·\-\(\)\[\]\n]/g, "")
      .toLowerCase();
  }

  function isDuplicate(a, b, threshold) {
    var na = normalizeForDedup(a);
    var nb = normalizeForDedup(b);
    if (na === nb) return true;
    var shorter = na.length < nb.length ? na : nb;
    var longer = na.length < nb.length ? nb : na;
    if (shorter.length < 6) return na === nb;
    if (longer.indexOf(shorter) !== -1) return true;
    var levSim = similarity(na, nb);
    var kwSim = keywordOverlap(a, b);
    return levSim > (threshold || 0.7) || kwSim > 0.45;
  }

  function extractKeywords(text) {
    var cleaned = (text || "").replace(/[.,!?;:·\-\(\)\[\]\n\s]/g, "").toLowerCase();
    var ngrams = {};
    for (var i = 0; i + 2 <= cleaned.length; i++) {
      var bg = cleaned.slice(i, i + 2);
      ngrams[bg] = true;
    }
    return Object.keys(ngrams);
  }

  function keywordOverlap(a, b) {
    var kwA = extractKeywords(a);
    var kwB = extractKeywords(b);
    if (!kwA.length || !kwB.length) return 0;
    var setB = {};
    for (var i = 0; i < kwB.length; i++) setB[kwB[i]] = true;
    var common = 0;
    for (var j = 0; j < kwA.length; j++) { if (setB[kwA[j]]) common++; }
    return (2 * common) / (kwA.length + kwB.length);
  }

  function similarity(a, b) {
    if (a === b) return 1;
    if (!a || !b) return 0;
    var maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    var dist = levenshtein(a, b);
    return 1 - dist / maxLen;
  }

  function levenshtein(a, b) {
    var m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    var prev = new Array(n + 1);
    var curr = new Array(n + 1);
    for (var j = 0; j <= n; j++) prev[j] = j;
    for (var i = 1; i <= m; i++) {
      curr[0] = i;
      for (var k = 1; k <= n; k++) {
        var cost = a[i - 1] === b[k - 1] ? 0 : 1;
        curr[k] = Math.min(prev[k] + 1, curr[k - 1] + 1, prev[k - 1] + cost);
      }
      var tmp = prev; prev = curr; curr = tmp;
    }
    return prev[n];
  }

  function detectPatterns(evidenceItems) {
    var changeGroups = [];
    for (var i = 0; i < evidenceItems.length; i++) {
      var item = evidenceItems[i];
      var change = (item.change || "").trim();
      if (!change) continue;
      var matched = false;
      for (var g = 0; g < changeGroups.length; g++) {
        if (isDuplicate(change, changeGroups[g].text, 0.65)) {
          changeGroups[g].refs.push(item.evidence_id);
          matched = true;
          break;
        }
      }
      if (!matched) changeGroups.push({ text: change, refs: [item.evidence_id] });
    }
    var patterns = [];
    for (var c = 0; c < changeGroups.length; c++) {
      var days = uniqueDays(changeGroups[c].refs);
      if (days.length >= 2) {
        patterns.push({
          type: "behavioral_pattern",
          text: changeGroups[c].text,
          evidence_refs: changeGroups[c].refs,
          day_count: days.length
        });
      }
    }
    return patterns;
  }

  function deduplicateChanges(evidenceItems) {
    var groups = [];
    for (var i = 0; i < evidenceItems.length; i++) {
      var ch = (evidenceItems[i].change || "").trim();
      if (!ch) continue;
      var matched = false;
      for (var g = 0; g < groups.length; g++) {
        if (isDuplicate(ch, groups[g].text, 0.65)) {
          groups[g].refs.push(evidenceItems[i].evidence_id);
          matched = true;
          break;
        }
      }
      if (!matched) groups.push({ text: ch, refs: [evidenceItems[i].evidence_id] });
    }
    return groups.map(function (g) {
      return { title: g.text.slice(0, 80), reason: g.text, evidence_refs: g.refs };
    });
  }

  function deduplicateExperiments(evidenceItems) {
    var groups = [];
    for (var i = 0; i < evidenceItems.length; i++) {
      var ex = (evidenceItems[i].next_experiment || "").trim();
      if (!ex) continue;
      var matched = false;
      for (var g = 0; g < groups.length; g++) {
        if (isDuplicate(ex, groups[g].text, 0.65)) {
          groups[g].refs.push(evidenceItems[i].evidence_id);
          matched = true;
          break;
        }
      }
      if (!matched) groups.push({ text: ex, refs: [evidenceItems[i].evidence_id] });
    }
    return groups.map(function (g) {
      return { title: g.text.slice(0, 80), description: g.text, evidence_refs: g.refs };
    });
  }

  function buildKeyLearnings(patterns, changes) {
    var learnings = [];
    for (var i = 0; i < patterns.length; i++) {
      learnings.push({
        pattern: patterns[i].text,
        learning: patterns[i].text + " — 이 행동이 여러 날에 걸쳐 반복되어 확인되었다.",
        evidence_refs: patterns[i].evidence_refs
      });
    }
    return learnings;
  }

  function buildNextDirection(changes, experiments, patterns) {
    var direction = { continue_items: [], observe_items: [], increase_attention: [], pending_items: [] };
    for (var i = 0; i < patterns.length; i++) {
      direction.continue_items.push(patterns[i].text.slice(0, 80));
    }
    for (var j = 0; j < experiments.length; j++) {
      direction.observe_items.push(experiments[j].description.slice(0, 80));
    }
    if (direction.continue_items.length === 0 && changes.length > 0) {
      direction.pending_items.push(changes[0].reason.slice(0, 80));
    }
    return direction;
  }

  function buildWeeklyReview(evidenceItems, dailyPaths, period) {
    var patterns = detectPatterns(evidenceItems);
    var changes = deduplicateChanges(evidenceItems);
    var experiments = deduplicateExperiments(evidenceItems);
    var keyLearnings = buildKeyLearnings(patterns, changes);
    var suggestedPrinciples = [];
    for (var pi = 0; pi < patterns.length; pi++) {
      if (patterns[pi].day_count >= 2) {
        suggestedPrinciples.push({
          proposal_id: "principle-" + period.week + "-" + String(suggestedPrinciples.length + 1).padStart(3, "0"),
          title: patterns[pi].text.slice(0, 80),
          statement: patterns[pi].text,
          reason: patterns[pi].day_count + "일에 걸쳐 반복된 행동 변화에서 추출",
          evidence_refs: patterns[pi].evidence_refs,
          evidence_strength: patterns[pi].day_count >= 3 ? "moderate" : "limited",
          decision: "pending",
          applied: false
        });
      }
    }
    var nextDirection = buildNextDirection(changes, experiments, patterns);
    var summary = evidenceItems.length + "개의 Evidence 블록과 " + dailyPaths.length + "개의 Daily를 검토했다.";
    if (patterns.length === 0) summary += " 반복 패턴은 충분한 복수 증거로 확인되지 않았다.";
    else summary += " " + patterns.length + "개의 행동 패턴이 " + uniqueDays(patterns[0].evidence_refs).length + "일 이상에서 반복되었다.";
    var limitations = [];
    if (dailyPaths.length < 3) limitations.push("Daily가 " + dailyPaths.length + "개뿐이라 패턴 감지 신뢰도가 낮다.");
    if (patterns.length === 0) limitations.push("서로 다른 날에서 반복되는 행동 변화가 감지되지 않았다.");
    return {
      schema_version: "2.0",
      review_id: "weekly-review-" + period.week,
      review_type: "learning",
      question: "이번 주의 경험에서 무엇이 반복되었고, 무엇을 배웠는가?",
      period: { start: formatDate(period.start), end: formatDate(period.end), week: period.week },
      summary: summary,
      key_learnings: keyLearnings,
      findings: patterns.map(function (p) {
        return {
          title: p.text.slice(0, 80),
          pattern: p.text,
          learning: p.text + " — " + p.day_count + "일에 걸쳐 반복 확인.",
          evidence_refs: p.evidence_refs
        };
      }),
      meaningful_changes: changes,
      experiments: experiments,
      suggested_principles: suggestedPrinciples,
      next_week_direction: nextDirection,
      limitations: limitations,
      references: dailyPaths
    };
  }

  var api = Object.freeze({
    stripFrontmatter: stripFrontmatter,
    parseDailyEvidenceBlocks: parseDailyEvidenceBlocks,
    parseISOWeek: parseISOWeek,
    currentISOWeek: currentISOWeek,
    formatDate: formatDate,
    detectPatterns: detectPatterns,
    buildWeeklyReview: buildWeeklyReview,
    extractLinks: extractLinks
  });
  root.WeeklyFilterCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
