# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
# ─── How to run ───
# python3 SYSTEM/AI/Skills/prodigy-review/tests/project/test_project_wizard.py

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[6]
CORE = ROOT / "SYSTEM" / "Views" / "project-wizard-core.js"
DRAFT_SERVICE = ROOT / "SYSTEM" / "Views" / "project-workflow-draft-service.js"
TODOIST = ROOT / "SYSTEM" / "Views" / "project-todoist-adapter.js"
TEMPLATE = ROOT / "SYSTEM" / "TEMPLATE" / "FORMAT" / "template_project.md"
DASHBOARD = ROOT / "HUB" / "40 Project.md"


def run_node(script: str) -> str:
    node = shutil.which("node")
    if node is None:
        raise AssertionError("node is required for Project Wizard tests")
    result = subprocess.run(
        [node, "-e", script],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return result.stdout


def assert_dashboard_entry_point() -> None:
    dashboard = DASHBOARD.read_text(encoding="utf-8")
    assert "+ 프로젝트 시작" in dashboard
    assert "project-wizard-core.js" in dashboard
    assert "project-workflow-draft-service.js" in dashboard
    assert "project-todoist-adapter.js" in dashboard
    assert "project-wizard.js" in dashboard


def assert_wizard_layout() -> None:
    wizard = (ROOT / "SYSTEM" / "Views" / "project-wizard.js").read_text(encoding="utf-8")
    assert 'el.type = "date"' in wizard
    assert 'grid-template-columns:180px minmax(0,1fr)' in wizard
    assert 'class: "prodigy-date-stack"' in wizard
    assert 'class: "prodigy-date-grid"' in wizard
    assert '프로젝트 유형' in wizard
    assert '워크플로 프리셋' in wizard
    assert 'projectKind' in wizard
    assert '"business"' in wizard and '"work"' in wizard and '"personal"' in wizard


def assert_template_mapping() -> None:
    template = TEMPLATE.read_text(encoding="utf-8")
    assert "type: project" in template
    assert "project_type:" in template
    assert "due_date:" in template
    assert "todoist_project_id:" in template
    assert "todoist_sync_status: pending" in template
    assert "## Workflow" in template


def assert_core_behaviour() -> None:
    script = f"""
const core = require({json.dumps(str(CORE))});
const fs = require("fs");
const template = fs.readFileSync({json.dumps(str(TEMPLATE))}, "utf8");

function assert(condition, message) {{
  if (!condition) throw new Error(message);
}}

const names = core.getPresetNames();
assert(JSON.stringify(names) === JSON.stringify(["Company","Personal","Research","Software","Event","Blank"]), "preset names changed");
const customPresets = {{ Client: [{{label:"요구사항 확인"}}, {{label:"초안 작성"}}] }};
assert(core.getPresetNames(customPresets).includes("Client"), "custom project type missing");
assert(core.getPresetWorkflow("Client", customPresets).length === 2, "custom project workflow missing");
const companyA = core.getPresetWorkflow("Company");
const companyB = core.getPresetWorkflow("Company");
companyA[0].label = "mutated";
assert(companyB[0].label !== "mutated", "preset returned shared mutable data");
assert(core.getPresetWorkflow("Blank").length === 0, "blank preset must be empty");

assert(core.normalizeProjectType("") === "uncategorized", "empty project_type normalize failed");
assert(core.projectTypeLabel("business") === "사업", "business label failed");
assert(core.defaultWorkflowPresetForProjectType("personal") === "Personal", "personal preset mapping failed");

let validation = core.validateWizardInput({{
  projectName: "3차 운송예산 편성",
  dueDate: "2026-08-30",
  startDate: "2026-07-14",
  projectType: "Company",
  project_type: "work",
  startMode: "planning",
  description: "결재 완료",
  workflow: core.getPresetWorkflow("Company")
}});
assert(validation.ok, validation.errors.join(", "));
assert(validation.value.status === "planning", "planning status mapping failed");
assert(validation.value.project_type === "work", "project_type mapping failed");

validation = core.validateWizardInput({{
  projectName: "3차 운송예산 편성",
  dueDate: "2026-08-30",
  startDate: "2026-07-14",
  projectType: "Company",
  project_type: "work",
  startMode: "start_now",
  workflow: core.getPresetWorkflow("Company")
}});
assert(validation.ok, "start now should be valid");
assert(validation.value.status === "doing", "start now status mapping failed");

validation = core.validateWizardInput({{
  projectName: "bad date",
  dueDate: "2026-99-99",
  startDate: "2026-07-14",
  projectType: "Company",
  project_type: "work",
  startMode: "planning",
  workflow: core.getPresetWorkflow("Company")
}});
assert(!validation.ok && validation.errors.some((msg) => msg.includes("Due date")), "invalid date accepted");

validation = core.validateWizardInput({{
  projectName: "empty workflow",
  dueDate: "2026-08-30",
  startDate: "2026-07-14",
  projectType: "Blank",
  project_type: "personal",
  startMode: "planning",
  workflow: []
}});
assert(!validation.ok, "empty workflow accepted");

validation = core.validateWizardInput({{
  projectName: "missing kind",
  dueDate: "2026-08-30",
  startDate: "2026-07-14",
  projectType: "Company",
  startMode: "planning",
  workflow: core.getPresetWorkflow("Company")
}});
assert(!validation.ok, "missing project_type accepted");

const path = core.buildProjectPath("3차 운송예산/편성", [
  "PARA/PROJECTS/3차 운송예산 편성.md"
]);
assert(path === "PARA/PROJECTS/3차 운송예산 편성-2.md", "filename collision failed: " + path);

const rendered = core.renderProjectContent(template, {{
  projectName: "3차 운송예산 편성",
  dueDate: "2026-08-30",
  startDate: "2026-07-14",
  projectType: "Company",
  project_type: "work",
  startMode: "planning",
  description: "각 부서 요구액을 취합하고 결재를 완료한다.",
  workflow: [{{label:"관련 지침 확인"}}, {{label:"자료 수집"}}]
}}, {{
  created: "2026-07-14",
  idFactory: (() => {{
    let i = 0;
    return () => ["wf_a1b2c3d4", "wf_e5f6g7h8"][i++];
  }})()
}});
assert(rendered.content.includes("type: project"), "object type must remain project");
assert(rendered.content.includes("project_type: work"), "project_type missing");
assert(rendered.content.includes("status: planning"), "status missing");
assert(rendered.content.includes("created: 2026-07-14"), "created missing");
assert(rendered.content.includes("start_date: 2026-07-14"), "start date missing");
assert(rendered.content.includes("due_date: 2026-08-30"), "due date missing");
assert(rendered.content.includes("next_action: "), "next_action should remain blank");
assert(rendered.content.includes("## 업무 목적"), "work body template missing");
assert(rendered.content.includes("### 완료 조건"), "completion condition missing");
assert(rendered.content.includes("각 부서 요구액을 취합하고 결재를 완료한다."), "completion condition body missing");
assert((rendered.content.match(/## Workflow/g) || []).length === 1, "duplicate workflow heading");
assert(rendered.content.includes("workflow_id: wf_a1b2c3d4"), "workflow id missing");
assert(rendered.content.includes("todoist_task_id:"), "todoist task id slot missing");

for (const kind of ["business", "work", "personal"]) {{
  const sample = core.renderProjectContent(template, {{
    projectName: "Sample " + kind,
    dueDate: "2026-08-30",
    startDate: "2026-07-14",
    projectType: core.defaultWorkflowPresetForProjectType(kind),
    project_type: kind,
    startMode: "planning",
    description: "완료 조건",
    workflow: [{{label:"A"}}, {{label:"B"}}]
  }}, {{ created: "2026-07-17" }});
  assert(sample.content.includes("type: project"), "type changed for " + kind);
  assert(sample.content.includes("project_type: " + kind), "project_type not stored for " + kind);
  assert(!sample.content.includes("type: " + kind + "_project"), "illegal object type for " + kind);
}}

let updated = core.setTodoistProjectId(rendered.content, "proj_123");
updated = core.setWorkflowTaskId(updated, "wf_a1b2c3d4", "task_123");
updated = core.setProjectSyncStatus(updated, "synced", "");
assert(updated.includes("todoist_project_id: proj_123"), "project id not persisted");
assert(updated.includes("workflow_id: wf_a1b2c3d4 todoist_task_id: task_123"), "task id not persisted");
assert(updated.includes("todoist_sync_status: synced"), "sync status not persisted");
"""
    run_node(script)


def assert_provider_contracts() -> None:
    script = f"""
const core = require({json.dumps(str(CORE))});
global.ProjectWizardCore = core;
const service = require({json.dumps(str(DRAFT_SERVICE))});

function assert(condition, message) {{
  if (!condition) throw new Error(message);
}}

const mimoDefaults = service.getProviderDefaults("mimo");
assert(mimoDefaults.baseURL === "https://api.xiaomimimo.com/v1", "mimo baseURL default missing");
assert(mimoDefaults.endpointPath === "/chat/completions", "mimo endpoint default missing");
assert(mimoDefaults.model === "mimo-v2.5-pro", "mimo model default missing");
const geminiDefaults = service.getProviderDefaults("gemini");
assert(geminiDefaults.model === "gemini-3.5-flash", "gemini model default missing");
assert(!geminiDefaults.endpointURL, "gemini endpoint should be adapter default unless overridden");
const opencodeDefaults = service.getProviderDefaults("opencode-go");
assert(opencodeDefaults.baseURL === "", "opencode-go baseURL should not be guessed");
const localDefaults = service.getProviderDefaults("lm-studio");
assert(localDefaults.baseURL === "http://127.0.0.1:1234/v1", "LM Studio baseURL default missing");
assert(localDefaults.authMode === "none", "LM Studio must not require a secret by default");
assert(localDefaults.model === "qwen/qwen3.5-9b", "LM Studio Qwen default missing");
assert(localDefaults.ttl === 120, "LM Studio idle TTL must be two minutes");
const localModels = service.listProviderModels("lm-studio");
assert(localModels.some((model) => model.id === "qwen/qwen3.5-9b"), "LM Studio Qwen model option missing");
assert(localModels.some((model) => model.id === "google/gemma-4-12b-qat"), "LM Studio Gemma model option missing");
assert(service.isEmbeddingModelId("text-embedding-nomic-embed-text-v1.5"), "embedding model must be recognized");
assert(!service.isEmbeddingModelId("google/gemma-4-12b-qat"), "chat model must not be hidden");

const valid = service.normalizeProviderPayload({{
  workflow: [
    {{label:"문제 정의"}},
    {{label:"현재 구조 조사"}},
    {{label:"구현"}},
    {{label:"테스트"}}
  ]
}});
assert(valid.workflow.length === 4, "valid provider output rejected");

for (const payload of [
  {{}},
  {{workflow: []}},
  {{workflow: [{{label:"하나"}}]}},
  {{workflow: [
    {{label:"중복"}}, {{label:"중복"}}, {{label:"셋"}}, {{label:"넷"}}
  ]}},
  {{workflow: [
    {{label:"하나", due:"2026-01-01"}}, {{label:"둘"}}, {{label:"셋"}}, {{label:"넷"}}
  ]}}
]) {{
  let failed = false;
  try {{ service.normalizeProviderPayload(payload); }} catch (_error) {{ failed = true; }}
  assert(failed, "invalid provider output accepted: " + JSON.stringify(payload));
}}

assert(service.parseJsonPayload("```json\\n{{\\"workflow\\":[{{\\"label\\":\\"하나\\"}}]}}\\n```").workflow.length === 1, "json extraction failed");
assert(service.extractJsonText({{
  outputs: [{{ type: "text", text: '{{"workflow":[{{"label":"하나"}}]}}' }}]
}}).includes('"workflow"'), "Gemini Interactions outputs response was not extracted");
assert(service.extractJsonText({{
  steps: [{{ type: "model_output", content: [{{ type: "text", text: '{{"workflow":[{{"label":"둘"}}]}}' }}] }}]
}}).includes('"workflow"'), "Gemini Interactions steps response was not extracted");
assert(service.buildPrompt({{projectName:"테스트", projectType:"Company", startDate:"2026-07-14", dueDate:"2026-07-20", description:"완료"}}, []).includes("Start date: 2026-07-14"), "start date missing from AI prompt");
assert(service.redactError(new Error("bad sk-abcdefghijklmnopqrstuvwxyz")) === "bad [redacted]", "error redaction failed");
"""
    run_node(script)


def assert_provider_settings_save() -> None:
    script = f"""
const core = require({json.dumps(str(CORE))});
global.ProjectWizardCore = core;
const service = require({json.dumps(str(DRAFT_SERVICE))});

function assert(condition, message) {{
  if (!condition) throw new Error(message);
}}

const files = {{}};
const secrets = {{}};
const app = {{
  vault: {{
    getAbstractFileByPath: (path) => files[path] ? {{ path }} : null,
    createFolder: async (path) => {{ files[path] = "__folder__"; }},
    create: async (path, text) => {{ files[path] = text; }},
    modify: async (file, text) => {{ files[file.path] = text; }},
    read: async (file) => files[file.path]
  }},
  secretStorage: {{
    getSecret: async (name) => secrets[name] || "",
    setSecret: async (name, value) => {{
      if (!/^[a-z0-9-]{{1,64}}$/.test(name)) throw new Error(`Invalid secret id: ${{name}}`);
      secrets[name] = value;
    }}
  }}
}};

(async () => {{
  const saved = await service.saveProviderSettings(app, {{
        defaultProvider: "mimo",
    config: {{
      workflowPresets: {{ Client: [{{label: "요구사항 확인"}}] }},
      providers: {{
        mimo: {{ model: "mimo-model", baseURL: "https://api.xiaomimimo.com/v1" }},
        gemini: {{ model: "gemini-model" }},
        "opencode-go": {{ baseURL: "https://opencode.example/v1", model: "go-model" }}
      }}
    }},
    secrets: {{
      "prodigy-mimo-api-key": "mimo-secret",
      "prodigy-gemini-api-key": "gemini-secret",
      "prodigy-opencode-go-api-key": "opencode-secret",
      "prodigy-todoist-api-token": "todoist-secret"
    }}
  }});
  assert(saved.defaultProvider === "mimo", "default provider not saved");
  assert(files["SYSTEM/PRIVATE"], "private folder not created");
  assert(files["SYSTEM/PRIVATE/project-wizard.local.json"], "local config not written");
  const localConfig = JSON.parse(files["SYSTEM/PRIVATE/project-wizard.local.json"]);
  assert(localConfig.defaultProvider === "mimo", "local default provider missing");
  assert(localConfig.workflowPresets.Client[0].label === "요구사항 확인", "workflow preset missing");
  assert(localConfig.providers.mimo.model === "mimo-model", "mimo model missing");
  assert(localConfig.providers["opencode-go"].baseURL === "https://opencode.example/v1", "opencode baseURL missing");
  assert(secrets["prodigy-mimo-api-key"] === "mimo-secret", "mimo secret not written");
  assert(secrets["prodigy-gemini-api-key"] === "gemini-secret", "gemini secret not written");
  assert(secrets["prodigy-opencode-go-api-key"] === "opencode-secret", "opencode secret not written");
  assert(secrets["prodigy-todoist-api-token"] === "todoist-secret", "todoist secret not written");
  assert(secrets["prodigy-project-wizard-last-provider"] === "mimo", "last provider not written");

  await service.saveProviderSettings(app, {{
    defaultProvider: "gemini",
    config: {{ providers: {{ gemini: {{ model: "gemini-new" }} }} }},
    secrets: {{ "prodigy-gemini-api-key": "" }}
  }});
  assert(secrets["prodigy-gemini-api-key"] === "gemini-secret", "blank secret should not clear existing value");
  const updatedConfig = JSON.parse(files["SYSTEM/PRIVATE/project-wizard.local.json"]);
  assert(updatedConfig.defaultProvider === "gemini", "updated default provider missing");
  assert(updatedConfig.providers.gemini.model === "gemini-new", "updated model missing");
}})().catch((error) => {{
  console.error(error.message);
  process.exit(1);
}});
"""
    run_node(script)


def assert_provider_config_migration() -> None:
    script = f"""
const service = require({json.dumps(str(DRAFT_SERVICE))});

function assert(condition, message) {{
  if (!condition) throw new Error(message);
}}

const files = {{
  "SYSTEM/PRIVATE/project-wizard.local.json": JSON.stringify({{
    defaultProvider: "gemini",
    providers: {{
      gemini: {{
        model: "gemini-2.5-flash",
        apiKeySecret: "PRODIGY_GEMINI_API_KEY"
      }}
    }}
  }})
}};
const app = {{
  vault: {{
    getAbstractFileByPath: (path) => files[path] ? {{ path }} : null,
    read: async (file) => files[file.path]
  }},
  secretStorage: {{
    getSecret: async () => ""
  }}
}};

(async () => {{
  const config = await service.loadProviderConfig(app);
  assert(config.providers.gemini.model === "gemini-2.5-flash", "configured gemini model must be preserved");
  assert(config.providers.gemini.apiKeySecret === "prodigy-gemini-api-key", "gemini secret id not normalized");

  files["SYSTEM/PRIVATE/project-wizard.local.json"] = JSON.stringify({{
    defaultProvider: "lm-studio",
    providers: {{ "lm-studio": {{ model: "google/gemma-4-12b-qat" }} }}
  }});
  app.secretStorage.getSecret = async (name) => name === "prodigy-project-wizard-last-provider" ? "gemini" : "";
  const explicitLocal = await service.loadProviderConfig(app);
  assert(explicitLocal.defaultProvider === "lm-studio", "explicit local default must beat stale last-provider state");
}})().catch((error) => {{
  console.error(error.message);
  process.exit(1);
}});
"""
    run_node(script)


def assert_todoist_mock() -> None:
    script = f"""
const todoist = require({json.dumps(str(TODOIST))});

function assert(condition, message) {{
  if (!condition) throw new Error(message);
}}

const calls = [];
global.requestUrl = async (options) => {{
  calls.push(options);
  const params = new URLSearchParams(options.body);
  const commands = JSON.parse(params.get("commands"));
  const sync_status = {{}};
  const temp_id_mapping = {{}};
  commands.forEach((command, index) => {{
    sync_status[command.uuid] = "ok";
    if (command.temp_id) {{
      temp_id_mapping[command.temp_id] = command.type === "project_add" ? "project_1" : `task_${{index + 1}}`;
    }}
  }});
  return {{status: 200, json: {{sync_status, temp_id_mapping}}}};
}};

const app = {{
  secretStorage: {{
    getSecret: async (name) => name === "prodigy-todoist-api-token" ? "secret-token" : ""
  }}
}};

(async () => {{
  const result = await todoist.createExecutionArtifacts({{
    app,
    projectName: "3차 운송예산 편성",
    objectPath: "PARA/PROJECTS/3차 운송예산 편성.md",
    startDate: "2026-07-14",
    dueDate: "2026-07-20",
    workflowItems: [
      {{id:"wf_1", label:"자료 수집"}},
      {{id:"wf_2", label:"초안 작성"}},
      {{id:"wf_3", label:"검토"}}
    ]
  }});
  assert(result.projectId === "project_1", "project id missing");
  assert(result.taskIds.wf_1 === "task_1", "new task id missing");
  assert(result.taskIds.wf_2 === "task_2", "second task id missing");
  assert(result.taskIds.wf_3 === "task_3", "third task id missing");
  assert(calls.length === 2, "expected project and task sync calls");
  assert(!calls.some((call) => call.body.includes("secret-token")), "token leaked into body");
  const createdTasks = JSON.parse(new URLSearchParams(calls[1].body).get("commands"));
  assert(createdTasks[0].args.due.date === "2026-07-14", "first task due date missing");
  assert(createdTasks[1].args.due.date === "2026-07-17", "middle task due date not distributed");
  assert(createdTasks[2].args.due.date === "2026-07-20", "last task due date missing");

  calls.length = 0;
  await todoist.createExecutionArtifacts({{
    app,
      projectName: "3차 운송예산 편성",
      objectPath: "PARA/PROJECTS/3차 운송예산 편성.md",
      startDate: "2026-07-14",
      dueDate: "2026-07-20",
      todoistProjectId: "project_1",
      workflowItems: [
        {{id:"wf_1", label:"자료 수집", todoist_task_id:"task_1"}},
        {{id:"wf_2", label:"초안 작성", todoist_task_id:"task_2"}},
        {{id:"wf_3", label:"검토"}}
      ]
  }});
  assert(calls.length === 1, "retry should skip existing project and synced tasks");
  assert(calls[0].body.includes("item_add"), "retry should create only missing tasks");
  const retryTasks = JSON.parse(new URLSearchParams(calls[0].body).get("commands"));
  assert(retryTasks.length === 1 && retryTasks[0].args.due.date === "2026-07-20", "retry due date changed");
}})().catch((error) => {{
  console.error(error.message);
  process.exit(1);
}});
"""
    run_node(script)


def main() -> int:
    assert_dashboard_entry_point()
    assert_wizard_layout()
    assert_template_mapping()
    assert_core_behaviour()
    assert_provider_contracts()
    assert_provider_settings_save()
    assert_provider_config_migration()
    assert_todoist_mock()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
