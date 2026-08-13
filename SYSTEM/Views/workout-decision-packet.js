(function (root) {
  "use strict";

  var KNOWLEDGE_TYPES = new Set(["knowledge", "permanent_note"]);
  var WORKOUT_DOMAIN = "workout";
  var KNOWLEDGE_CAP = 3;
  var PRIOR_CAP = 2;

  function clean(value) {
    return value === undefined || value === null ? "" : String(value).trim();
  }

  function token(value) {
    return clean(value).toLowerCase().replace(/\s+/g, "_");
  }

  function canonicalPath(value) {
    if (typeof value !== "string") return "";
    return value.trim().replace(/\\/g, "/").normalize("NFC");
  }

  function pathFor(page) {
    if (!page) return "";
    return canonicalPath(page.path || page.source_path || (page.file && page.file ? page.file.path : "") || "");
  }

  function titleFor(page) {
    var t = clean(page.title);
    if (t) return t;
    var p = pathFor(page);
    var name = p.split("/").pop() || "";
    return name.replace(/\.md$/i, "") || "Untitled";
  }

  function connectionPaths(page) {
    var raw = page.connections || page.outlinks || page.links || [];
    if (!Array.isArray(raw)) raw = typeof raw === "string" ? raw.split(",") : [];
    return raw.map(function (v) {
      var t = clean(v);
      if (t.startsWith("[[") && t.endsWith("]]")) t = t.slice(2, -2).split("|")[0];
      return canonicalPath(t);
    }).filter(Boolean);
  }

  function knowledgeDomain(page) {
    return token(page.knowledge_domain || page.domain || "");
  }

  function knowledgeTopics(page) {
    var raw = page.knowledge_topics || page.topics || [];
    if (!Array.isArray(raw)) raw = typeof raw === "string" ? raw.split(",") : [];
    return raw.map(token).filter(Boolean);
  }

  function recency(page) {
    var u = page.updated || page.created || 0;
    if (typeof u === "number" && isFinite(u)) return u;
    var parsed = Date.parse(String(u));
    return isFinite(parsed) ? parsed : 0;
  }

  function buildWorkoutContext(programPage, exercisePages) {
    var programPath = pathFor(programPage);
    var programTitle = titleFor(programPage);
    var exerciseNames = (exercisePages || []).map(function (e) {
      return titleFor(e).toLowerCase();
    }).filter(Boolean);
    var exercisePaths = (exercisePages || []).map(pathFor).filter(Boolean);
    return {
      program_path: programPath,
      program_title: programTitle,
      exercise_names: exerciseNames,
      exercise_paths: exercisePaths
    };
  }

  function matchKnowledge(record, context) {
    var domain = knowledgeDomain(record);
    if (domain !== WORKOUT_DOMAIN) return { score: 0, reason: "" };
    var paths = connectionPaths(record);
    var progKey = context.program_path.replace(/\.md$/i, "");
    var direct = progKey && paths.some(function (cp) { return cp.replace(/\.md$/i, "") === progKey; });
    var exerciseMatch = context.exercise_paths.some(function (ep) {
      var ek = ep.replace(/\.md$/i, "");
      return paths.some(function (cp) { return cp.replace(/\.md$/i, "") === ek; });
    });
    var topicMatch = false;
    var topics = knowledgeTopics(record);
    if (topics.length && context.exercise_names.length) {
      topicMatch = topics.some(function (t) {
        return context.exercise_names.some(function (en) { return en.indexOf(t) !== -1 || t.indexOf(en) !== -1; });
      });
    }
    var score = (direct ? 100 : 0) + (exerciseMatch ? 80 : 0) + (topicMatch ? 50 : 0);
    if (score === 0 && domain === WORKOUT_DOMAIN) score = 10;
    return { score: score, reason: direct ? "direct" : exerciseMatch ? "exercise" : topicMatch ? "topic" : "domain" };
  }

  function matchPrior(record, context) {
    var paths = connectionPaths(record);
    var progKey = context.program_path.replace(/\.md$/i, "");
    var direct = progKey && paths.some(function (cp) { return cp.replace(/\.md$/i, "") === progKey; });
    var exerciseMatch = context.exercise_paths.some(function (ep) {
      var ek = ep.replace(/\.md$/i, "");
      return paths.some(function (cp) { return cp.replace(/\.md$/i, "") === ek; });
    });
    var score = (direct ? 100 : 0) + (exerciseMatch ? 60 : 0);
    return { score: score, reason: direct ? "program" : exerciseMatch ? "exercise" : "" };
  }

  function buildWorkoutDecisionPacket(input) {
    var source = input || {};
    var context = buildWorkoutContext(source.program || {}, source.exercises || []);
    var candidates = Array.isArray(source.candidates) ? source.candidates : [];
    var warnings = [];

    var knowledge = [];
    var priors = [];

    candidates.forEach(function (page) {
      if (!page || typeof page !== "object") return;
      var type = token(page.type);
      var path = pathFor(page);
      if (!path) return;

      if (KNOWLEDGE_TYPES.has(type)) {
        var km = matchKnowledge(page, context);
        if (km.score > 0) {
          var kReasons = root.DecisionPacketReasons && root.DecisionPacketReasons.workoutReasons ? root.DecisionPacketReasons.workoutReasons(km.reason) : null;
          knowledge.push({ path: path, title: titleFor(page), score: km.score, reason: km.reason, reasons: kReasons, recency: recency(page) });
        }
      } else if (type === "workout") {
        var pm = matchPrior(page, context);
        if (pm.score > 0) {
          var pReasons = root.DecisionPacketReasons && root.DecisionPacketReasons.workoutReasons ? root.DecisionPacketReasons.workoutReasons(pm.reason) : null;
          priors.push({ path: path, title: titleFor(page), score: pm.score, reason: pm.reason, reasons: pReasons, recency: recency(page) });
        }
      }
    });

    knowledge.sort(function (a, b) { return b.score - a.score || b.recency - a.recency; });
    priors.sort(function (a, b) { return b.score - a.score || b.recency - a.recency; });
    knowledge = knowledge.slice(0, KNOWLEDGE_CAP);
    priors = priors.slice(0, PRIOR_CAP);

    var isEmpty = !knowledge.length && !priors.length;

    return {
      schema_version: 1,
      context: context,
      knowledge: knowledge,
      prior_workouts: priors,
      empty_state: isEmpty ? {
        copy: "결정 패킷에 표시할 참고 기록이 없습니다.",
        reason: "현재 운동 프로그램·종목과 연결된 검증 지식이나 이전 운동 기록이 없습니다."
      } : null,
      warnings: warnings
    };
  }

  function renderWorkoutDecisionPacket(container, packet) {
    if (!container || !packet) return;
    var section = container.createEl("div", {
      attr: { style: "margin-top:12px;padding:10px 12px;border:1px solid var(--background-modifier-border);border-radius:8px;background:var(--background-secondary);" }
    });
    section.createEl("div", {
      text: "운동 결정 패킷",
      attr: { style: "font-size:0.78em;font-weight:700;color:var(--text-muted);margin-bottom:6px;" }
    });

    if (packet.empty_state) {
      section.createEl("div", {
        text: packet.empty_state.copy,
        attr: { style: "font-size:0.82em;color:var(--text-muted);font-style:italic;" }
      });
      return;
    }

    if (packet.knowledge.length) {
      var kHead = section.createEl("div", {
        text: "참조 지식 (" + packet.knowledge.length + ")",
        attr: { style: "font-size:0.72em;font-weight:700;color:var(--ke-color-accent, var(--text-accent));margin-bottom:4px;" }
      });
      packet.knowledge.forEach(function (k) {
        var row = section.createEl("div", {
          attr: { style: "font-size:0.82em;padding:3px 0;display:flex;gap:6px;align-items:baseline;" }
        });
        row.createEl("span", { text: "·", attr: { style: "color:var(--text-muted);" } });
        var kReason = Array.isArray(k.reasons) && k.reasons.length ? k.reasons.join(" · ") : "";
        var link = row.createEl("a", { text: k.title + (kReason ? " — " + kReason : ""), attr: { href: k.path, style: "color:var(--ke-color-accent, var(--text-accent));text-decoration:none;" } });
        link.onclick = function (e) {
          e.preventDefault();
          if (root.app && root.app.workspace) root.app.workspace.openLinkText(k.path, k.path, false);
        };
      });
    }

    if (packet.prior_workouts.length) {
      var pHead = section.createEl("div", {
        text: "이전 운동 (" + packet.prior_workouts.length + ")",
        attr: { style: "font-size:0.72em;font-weight:700;color:var(--ke-color-accent, var(--text-accent));margin-top:6px;margin-bottom:4px;" }
      });
      packet.prior_workouts.forEach(function (p) {
        var row = section.createEl("div", {
          attr: { style: "font-size:0.82em;padding:3px 0;display:flex;gap:6px;align-items:baseline;" }
        });
        row.createEl("span", { text: "·", attr: { style: "color:var(--text-muted);" } });
        var pReason = Array.isArray(p.reasons) && p.reasons.length ? p.reasons.join(" · ") : "";
        var link = row.createEl("a", { text: p.title + (pReason ? " — " + pReason : ""), attr: { href: p.path, style: "color:var(--ke-color-accent, var(--text-accent));text-decoration:none;" } });
        link.onclick = function (e) {
          e.preventDefault();
          if (root.app && root.app.workspace) root.app.workspace.openLinkText(p.path, p.path, false);
        };
      });
    }
  }

  var api = Object.freeze({
    buildWorkoutDecisionPacket: buildWorkoutDecisionPacket,
    buildWorkoutContext: buildWorkoutContext,
    renderWorkoutDecisionPacket: renderWorkoutDecisionPacket
  });
  root.WorkoutDecisionPacket = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
