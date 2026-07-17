(function (root) {
  "use strict";

  const PROJECT_STATUSES = {
    planning: "planning",
    start_now: "doing"
  };

  /** Object type stays `project`. This classifies project nature only. */
  const PROJECT_TYPES = Object.freeze({
    business: "business",
    work: "work",
    personal: "personal"
  });

  const PROJECT_TYPE_LABELS = Object.freeze({
    business: "사업",
    work: "회사",
    personal: "개인",
    uncategorized: "미분류"
  });

  const PROJECT_TYPE_BODIES = Object.freeze({
    business: [
      "# 프로젝트 개요",
      "",
      "* **유형**: 사업",
      "* **우선순위**: `= this.priority`",
      "* **시작일**: `= this.start_date` | **목표완료일**: `= this.due_date`",
      "* **Next Action**: `= this.next_action`",
      "",
      "---",
      "",
      "## 목표",
      "",
      "",
      "## 수익모델",
      "",
      "",
      "## MVP",
      "",
      "",
      "## 경쟁사",
      "",
      "",
      "## 다음 실행",
      "",
      "",
      "## Workflow",
      "",
      "",
      "---",
      "",
      "## 🔄 복기 (Review)",
      "",
      "### 결과",
      "- ",
      "",
      "### 잘한 점",
      "- ",
      "",
      "### 아쉬운 점",
      "- ",
      "",
      "### 다음 프로젝트에서는",
      "- ",
      ""
    ].join("\n"),
    work: [
      "# 프로젝트 개요",
      "",
      "* **유형**: 회사",
      "* **우선순위**: `= this.priority`",
      "* **시작일**: `= this.start_date` | **목표완료일**: `= this.due_date`",
      "* **Next Action**: `= this.next_action`",
      "",
      "---",
      "",
      "## 업무 목적",
      "",
      "",
      "## 관련 부서",
      "",
      "",
      "## 마감일",
      "",
      "",
      "## 관련 문서",
      "",
      "",
      "## 다음 실행",
      "",
      "",
      "## Workflow",
      "",
      "",
      "---",
      "",
      "## 🔄 복기 (Review)",
      "",
      "### 결과",
      "- ",
      "",
      "### 잘한 점",
      "- ",
      "",
      "### 아쉬운 점",
      "- ",
      "",
      "### 다음 프로젝트에서는",
      "- ",
      ""
    ].join("\n"),
    personal: [
      "# 프로젝트 개요",
      "",
      "* **유형**: 개인",
      "* **우선순위**: `= this.priority`",
      "* **시작일**: `= this.start_date` | **목표완료일**: `= this.due_date`",
      "* **Next Action**: `= this.next_action`",
      "",
      "---",
      "",
      "## 목표",
      "",
      "",
      "## 마일스톤",
      "",
      "",
      "## 메모",
      "",
      "",
      "## 다음 실행",
      "",
      "",
      "## Workflow",
      "",
      "",
      "---",
      "",
      "## 🔄 복기 (Review)",
      "",
      "### 결과",
      "- ",
      "",
      "### 잘한 점",
      "- ",
      "",
      "### 아쉬운 점",
      "- ",
      "",
      "### 다음 프로젝트에서는",
      "- ",
      ""
    ].join("\n")
  });

  const PROJECT_TYPE_DEFAULT_PRESET = Object.freeze({
    business: "Software",
    work: "Company",
    personal: "Personal"
  });

  const WORKFLOW_PRESETS = Object.freeze({
    Company: [
      "관련 지침과 완료 기준 확인",
      "필요한 자료와 이해관계자 파악",
      "자료 요청 및 수집",
      "초안 작성",
      "내부 검토",
      "수정 및 보완",
      "결재 또는 제출",
      "결과 확인 및 정리"
    ],
    Personal: [
      "완료 조건 확인",
      "필요한 자료와 준비물 정리",
      "핵심 작업 실행",
      "중간 결과 확인",
      "수정 및 마무리",
      "결과 기록"
    ],
    Research: [
      "조사 질문 정의",
      "신뢰할 수 있는 자료 수집",
      "핵심 내용 정리",
      "근거 비교",
      "결론 초안 작성",
      "검토 및 보완",
      "결과 기록"
    ],
    Software: [
      "문제와 완료 조건 정의",
      "현재 구조 조사",
      "구현 계획 작성",
      "최소 변경 구현",
      "테스트",
      "회귀 검증",
      "문서 및 결과 정리"
    ],
    Event: [
      "목적과 일정 확정",
      "장소와 참여자 확인",
      "필요한 준비 항목 정리",
      "예약 또는 요청 실행",
      "진행 전 최종 확인",
      "행사 진행",
      "결과 및 후속 조치 정리"
    ],
    Blank: []
  });

  const WORKFLOW_SCHEMA = Object.freeze({
    type: "object",
    additionalProperties: false,
    required: ["workflow"],
    properties: {
      workflow: {
        type: "array",
        minItems: 4,
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label"],
          properties: {
            label: { type: "string" }
          }
        }
      }
    }
  });

  function todayIso(now) {
    const date = now instanceof Date ? now : new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function cloneWorkflow(items) {
    return (items || []).map((item) => {
      if (typeof item === "string") return { label: item };
      return {
        id: item.id || "",
        label: item.label || "",
        todoist_task_id: item.todoist_task_id || ""
      };
    });
  }

  function getPresetNames(customPresets) {
    return Object.keys(getPresetLibrary(customPresets));
  }

  function getPresetLibrary(customPresets) {
    const library = JSON.parse(JSON.stringify(WORKFLOW_PRESETS));
    Object.keys(customPresets || {}).forEach((name) => {
      const trimmed = String(name || "").trim();
      if (trimmed && !Object.prototype.hasOwnProperty.call(WORKFLOW_PRESETS, trimmed)) {
        library[trimmed] = cloneWorkflow(customPresets[name]);
      }
    });
    return library;
  }

  function getPresetWorkflow(name, customPresets) {
    const library = getPresetLibrary(customPresets);
    return cloneWorkflow(library[name] || library.Blank);
  }

  function normalizeLabel(label) {
    return String(label || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function validateIsoDate(value) {
    const text = String(value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
    const date = new Date(`${text}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
  }

  function validateWorkflow(items, options) {
    const opts = options || {};
    const minItems = opts.minItems == null ? 1 : opts.minItems;
    const maxItems = opts.maxItems == null ? 100 : opts.maxItems;
    const strictFields = opts.strictFields === true;
    const rejectDuplicates = opts.rejectDuplicates === true;
    const errors = [];
    const normalized = [];
    const seen = new Set();

    if (!Array.isArray(items)) {
      return { ok: false, errors: ["Workflow must be an array."], workflow: [] };
    }

    items.forEach((item, index) => {
      if (!item || typeof item !== "object") {
        errors.push(`Workflow item ${index + 1} must be an object.`);
        return;
      }
      if (strictFields) {
        const unsupported = Object.keys(item).filter((key) => !["id", "label", "todoist_task_id"].includes(key));
        if (unsupported.length > 0) {
          errors.push(`Workflow item ${index + 1} has unsupported fields: ${unsupported.join(", ")}.`);
        }
      }
      const label = String(item.label || "").trim().replace(/\s+/g, " ");
      if (!label) {
        errors.push(`Workflow item ${index + 1} needs a label.`);
        return;
      }
      const norm = normalizeLabel(label);
      if (rejectDuplicates && seen.has(norm)) {
        errors.push(`Duplicate workflow label: ${label}`);
      }
      seen.add(norm);
      normalized.push({
        id: item.id || "",
        label,
        todoist_task_id: item.todoist_task_id || ""
      });
    });

    if (normalized.length < minItems) errors.push(`Workflow needs at least ${minItems} item(s).`);
    if (normalized.length > maxItems) errors.push(`Workflow cannot exceed ${maxItems} items.`);
    return { ok: errors.length === 0, errors, workflow: normalized };
  }

  function validateProviderWorkflow(payload, options) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { ok: false, errors: ["Provider result must be a JSON object."], workflow: [] };
    }
    if (!Array.isArray(payload.workflow)) {
      return { ok: false, errors: ["Provider result is missing workflow array."], workflow: [] };
    }
    return validateWorkflow(payload.workflow, Object.assign({
      minItems: 4,
      maxItems: 10,
      strictFields: true,
      rejectDuplicates: true
    }, options || {}));
  }

  function normalizeProjectType(value) {
    const raw = String(value == null ? "" : value).trim().toLowerCase();
    if (raw === "business" || raw === "work" || raw === "personal") return raw;
    return "uncategorized";
  }

  function projectTypeLabel(value) {
    const key = normalizeProjectType(value);
    return PROJECT_TYPE_LABELS[key] || PROJECT_TYPE_LABELS.uncategorized;
  }

  function defaultWorkflowPresetForProjectType(projectTypeValue) {
    const key = normalizeProjectType(projectTypeValue);
    return PROJECT_TYPE_DEFAULT_PRESET[key] || "Company";
  }

  function bodyTemplateForProjectType(projectTypeValue) {
    const key = normalizeProjectType(projectTypeValue);
    return PROJECT_TYPE_BODIES[key] || PROJECT_TYPE_BODIES.work;
  }

  function validateWizardInput(input) {
    const options = arguments[1] || {};
    const errors = [];
    const name = String(input.projectName || "").trim();
    const startDate = String(input.startDate || "").trim();
    const dueDate = String(input.dueDate || "").trim();
    const workflowPreset = String(input.projectType || input.workflowPreset || "").trim();
    const projectTypeRaw = String(input.project_type || input.projectKind || "").trim().toLowerCase();
    const startMode = String(input.startMode || "planning").trim();
    const workflowResult = validateWorkflow(input.workflow || [], { minItems: 1 });

    if (!name) errors.push("Project name is required.");
    if (startDate && !validateIsoDate(startDate)) errors.push("Start date must be YYYY-MM-DD.");
    if (!dueDate || !validateIsoDate(dueDate)) errors.push("Due date must be YYYY-MM-DD.");
    if (!getPresetNames(options.presets).includes(workflowPreset)) errors.push("Workflow preset is invalid.");
    if (!Object.prototype.hasOwnProperty.call(PROJECT_TYPES, projectTypeRaw)) {
      errors.push("Project type must be business, work, or personal.");
    }
    if (startDate && validateIsoDate(startDate) && validateIsoDate(dueDate) && startDate > dueDate) errors.push("Start date cannot be after due date.");
    if (!Object.prototype.hasOwnProperty.call(PROJECT_STATUSES, startMode)) errors.push("Start state is invalid.");
    if (!workflowResult.ok) errors.push(...workflowResult.errors);

    return {
      ok: errors.length === 0,
      errors,
      value: {
        projectName: name,
        startDate,
        dueDate,
        projectType: workflowPreset,
        workflowPreset,
        project_type: projectTypeRaw,
        startMode,
        status: PROJECT_STATUSES[startMode],
        description: String(input.description || "").trim(),
        workflow: workflowResult.workflow
      }
    };
  }

  function sanitizeProjectFileName(name) {
    const cleaned = String(name || "")
      .trim()
      .replace(/[\\/:*?"<>|#^[\]]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^\.+|\.+$/g, "")
      .trim();
    return cleaned || "Untitled Project";
  }

  /**
   * Prefill for Project Wizard handoff (Universal Creator → Wizard).
   * Single Modal instance only — not global state.
   */
  function normalizeInitialProjectName(value) {
    return String(value == null ? "" : value).trim();
  }

  function buildProjectPath(projectName, existingPaths) {
    const base = sanitizeProjectFileName(projectName);
    const existing = new Set((existingPaths || []).map((path) => String(path)));
    let candidate = `PARA/PROJECTS/${base}.md`;
    let index = 2;
    while (existing.has(candidate)) {
      candidate = `PARA/PROJECTS/${base}-${index}.md`;
      index += 1;
    }
    return candidate;
  }

  function randomWorkflowId() {
    const cryptoObj = root.crypto || (root.window && root.window.crypto);
    if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
      const bytes = new Uint8Array(4);
      cryptoObj.getRandomValues(bytes);
      return "wf_" + Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    return "wf_" + Math.random().toString(16).slice(2, 10).padEnd(8, "0");
  }

  function ensureWorkflowIds(items, idFactory) {
    const makeId = idFactory || randomWorkflowId;
    const used = new Set();
    return cloneWorkflow(items).map((item) => {
      let id = item.id || makeId();
      while (used.has(id)) id = makeId();
      used.add(id);
      return Object.assign({}, item, { id });
    });
  }

  function renderWorkflowMarkdown(items) {
    return ensureWorkflowIds(items).map((item) => {
      const taskId = item.todoist_task_id || "";
      return `- [ ] ${item.label} <!-- workflow_id: ${item.id} todoist_task_id: ${taskId} -->`;
    }).join("\n");
  }

  function splitFrontmatter(content) {
    const text = String(content || "");
    if (!text.startsWith("---\n")) return { frontmatter: "", body: text };
    const end = text.indexOf("\n---", 4);
    if (end === -1) return { frontmatter: "", body: text };
    return {
      frontmatter: text.slice(4, end),
      body: text.slice(end + 4).replace(/^\n/, "")
    };
  }

  function setFrontmatterValue(frontmatter, key, value) {
    const lines = String(frontmatter || "").split("\n");
    const rendered = value === "" ? `${key}: ` : `${key}: ${value}`;
    let found = false;
    const next = lines.map((line) => {
      if (line.startsWith(`${key}:`)) {
        found = true;
        return rendered;
      }
      return line;
    });
    if (!found) next.push(rendered);
    return next.join("\n").replace(/\n{3,}/g, "\n\n");
  }

  function removeSection(body, heading) {
    const lines = String(body || "").split("\n");
    const start = lines.findIndex((line) => line.trim() === heading);
    if (start === -1) return body;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i += 1) {
      if (/^##\s+/.test(lines[i])) {
        end = i;
        break;
      }
    }
    return lines.slice(0, start).concat(lines.slice(end)).join("\n").replace(/\n{3,}/g, "\n\n");
  }

  function insertAfterHeading(body, heading, insertion) {
    const text = removeSection(body, "## Workflow");
    const lines = text.split("\n");
    const index = lines.findIndex((line) => line.trim() === heading);
    if (index === -1) {
      return `${text.trimEnd()}\n\n${insertion.trim()}\n`;
    }
    let nextHeading = lines.length;
    for (let i = index + 1; i < lines.length; i += 1) {
      if (/^##\s+/.test(lines[i])) {
        nextHeading = i;
        break;
      }
    }
    const before = lines.slice(0, nextHeading).join("\n").trimEnd();
    const after = lines.slice(nextHeading).join("\n").trimStart();
    return `${before}\n\n${insertion.trim()}\n\n${after}`.trimEnd() + "\n";
  }

  function renderCompletionSection(description) {
    if (!description) return "";
    return `### 완료 조건\n\n${description}`;
  }

  function renderProjectContent(template, input, options) {
    const opts = options || {};
    const validated = validateWizardInput(input, { presets: opts.presets });
    if (!validated.ok) {
      throw new Error(validated.errors.join(" "));
    }
    const value = validated.value;
    const workflow = ensureWorkflowIds(value.workflow, opts.idFactory);
    let parts = splitFrontmatter(template);
    let fm = parts.frontmatter;
    fm = setFrontmatterValue(fm, "type", "project");
    fm = setFrontmatterValue(fm, "project_type", value.project_type);
    fm = setFrontmatterValue(fm, "status", value.status);
    fm = setFrontmatterValue(fm, "created", opts.created || todayIso(opts.now));
    fm = setFrontmatterValue(fm, "start_date", value.startDate || "");
    fm = setFrontmatterValue(fm, "due_date", value.dueDate);
    fm = setFrontmatterValue(fm, "next_action", "");
    fm = setFrontmatterValue(fm, "todoist_project_id", "");
    fm = setFrontmatterValue(fm, "todoist_sync_status", value.startMode === "planning" ? "pending" : "pending");
    fm = setFrontmatterValue(fm, "todoist_last_error", "");

    // Body is selected by project_type; Object type remains project.
    let body = bodyTemplateForProjectType(value.project_type);
    const completion = renderCompletionSection(value.description);
    if (completion) {
      body = body.replace("## 다음 실행\n\n", `## 다음 실행\n\n${completion}\n\n`);
    }
    const workflowBlock = `## Workflow\n\n${renderWorkflowMarkdown(workflow)}`;
    if (/^## Workflow\s*$/m.test(body)) {
      body = body.replace(/^## Workflow\s*$/m, workflowBlock.trimEnd());
    } else {
      body = insertAfterHeading(body, "## 다음 실행", workflowBlock);
    }
    return {
      content: `---\n${fm.trim()}\n---\n${body.startsWith("\n") ? body : "\n" + body}`,
      workflow
    };
  }

  function setProjectSyncStatus(content, status, errorMessage) {
    const parts = splitFrontmatter(content);
    let fm = setFrontmatterValue(parts.frontmatter, "todoist_sync_status", status || "");
    fm = setFrontmatterValue(fm, "todoist_last_error", errorMessage || "");
    return `---\n${fm.trim()}\n---\n${parts.body.startsWith("\n") ? parts.body : "\n" + parts.body}`;
  }

  function setTodoistProjectId(content, projectId) {
    const parts = splitFrontmatter(content);
    const fm = setFrontmatterValue(parts.frontmatter, "todoist_project_id", projectId || "");
    return `---\n${fm.trim()}\n---\n${parts.body.startsWith("\n") ? parts.body : "\n" + parts.body}`;
  }

  function setWorkflowTaskId(content, workflowId, taskId) {
    const pattern = new RegExp(`(<!--\\s*workflow_id:\\s*${escapeRegExp(workflowId)}\\s+todoist_task_id:)\\s*[^\\s>]*(\\s*-->)`);
    return String(content).replace(pattern, `$1 ${taskId || ""}$2`);
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  const api = {
    PROJECT_STATUSES,
    PROJECT_TYPES,
    PROJECT_TYPE_LABELS,
    PROJECT_TYPE_BODIES,
    PROJECT_TYPE_DEFAULT_PRESET,
    WORKFLOW_PRESETS,
    WORKFLOW_SCHEMA,
    todayIso,
    getPresetNames,
    getPresetLibrary,
    getPresetWorkflow,
    cloneWorkflow,
    normalizeLabel,
    normalizeProjectType,
    projectTypeLabel,
    defaultWorkflowPresetForProjectType,
    bodyTemplateForProjectType,
    validateIsoDate,
    validateWorkflow,
    validateProviderWorkflow,
    validateWizardInput,
    sanitizeProjectFileName,
    buildProjectPath,
    normalizeInitialProjectName,
    randomWorkflowId,
    ensureWorkflowIds,
    renderWorkflowMarkdown,
    renderProjectContent,
    setProjectSyncStatus,
    setTodoistProjectId,
    setWorkflowTaskId,
    splitFrontmatter
  };

  root.ProjectWizardCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
