(function (root) {
  "use strict";

  const TODOIST_SYNC_URL = "https://api.todoist.com/api/v1/sync";

  function redactError(error) {
    const text = error && error.message ? error.message : String(error || "Todoist error");
    return text.replace(/[A-Za-z0-9_\-]{24,}/g, "[redacted]");
  }

  function uuid() {
    const cryptoObj = root.crypto || (root.window && root.window.crypto);
    if (cryptoObj && typeof cryptoObj.randomUUID === "function") return cryptoObj.randomUUID();
    if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      cryptoObj.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0"));
      return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
      const rand = Math.random() * 16 | 0;
      const value = char === "x" ? rand : (rand & 0x3) | 0x8;
      return value.toString(16);
    });
  }

  function requestUrlAdapter(app) {
    if (root.requestUrl) return root.requestUrl;
    if (root.obsidian && root.obsidian.requestUrl) return root.obsidian.requestUrl;
    if (app && app.requestUrl) return app.requestUrl;
    return null;
  }

  async function httpPost(app, url, token, body) {
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded"
    };
    const requestUrl = requestUrlAdapter(app);
    if (requestUrl) {
      const response = await requestUrl({
        url,
        method: "POST",
        headers,
        body,
        throw: false
      });
      const text = typeof response.text === "string" ? response.text : JSON.stringify(response.json || {});
      if (response.status >= 400) throw new Error(`Todoist HTTP ${response.status}: ${text.slice(0, 180)}`);
      if (response.json !== undefined) return response.json;
      return JSON.parse(text);
    }
    if (typeof fetch !== "function") throw new Error("No HTTP request adapter is available.");
    const response = await fetch(url, { method: "POST", headers, body });
    const text = await response.text();
    if (!response.ok) throw new Error(`Todoist HTTP ${response.status}: ${text.slice(0, 180)}`);
    return JSON.parse(text);
  }

  async function readVaultJson(app, path) {
    if (!app || !app.vault || !app.vault.getAbstractFileByPath) return null;
    const file = app.vault.getAbstractFileByPath(path);
    if (!file) return null;
    return JSON.parse(await app.vault.read(file));
  }

  async function getSecret(app, name) {
    if (!name || !app || !app.secretStorage || typeof app.secretStorage.getSecret !== "function") return "";
    const value = await Promise.resolve(app.secretStorage.getSecret(name));
    return value || "";
  }

  async function getTodoistToken(app) {
    const direct = await getSecret(app, "prodigy-todoist-api-token") || await getSecret(app, "PRODIGY_TODOIST_API_TOKEN");
    if (direct) return direct;
    try {
      const pluginData = await readVaultJson(app, ".obsidian/plugins/todoist-sync-plugin/data.json");
      if (pluginData && pluginData.apiTokenSecretId) {
        const pluginToken = await getSecret(app, pluginData.apiTokenSecretId);
        if (pluginToken) return pluginToken;
      }
    } catch (_error) {
      return "";
    }
    return "";
  }

  function buildCommand(type, args, tempId) {
    const command = {
      type,
      uuid: uuid(),
      args
    };
    if (tempId) command.temp_id = tempId;
    return command;
  }

  function encodeCommands(commands) {
    const params = new URLSearchParams();
    params.set("commands", JSON.stringify(commands));
    return params.toString();
  }

  function getTodayIsoDate(now) {
    const date = now || new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseIsoDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return null;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) return null;
    return date;
  }

  function formatIsoDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function buildTaskDueDates(count, startDate, dueDate) {
    if (!dueDate) return [];
    const start = parseIsoDate(startDate || getTodayIsoDate());
    const end = parseIsoDate(dueDate);
    if (!start || !end) throw new Error("Todoist task dates must be YYYY-MM-DD.");
    const startTime = start.getTime();
    const endTime = end.getTime();
    if (endTime < startTime) throw new Error("Project due date cannot be before today.");
    if (count === 0) return [];
    if (count === 1) return [dueDate];
    const daySpan = Math.round((endTime - startTime) / 86400000);
    return Array.from({ length: count }, (_item, index) => {
      const offset = Math.floor((daySpan * index) / (count - 1));
      return formatIsoDate(new Date(startTime + offset * 86400000));
    });
  }

  async function syncCommands(app, token, commands, endpoint) {
    const response = await httpPost(app, endpoint || TODOIST_SYNC_URL, token, encodeCommands(commands));
    const statuses = response.sync_status || {};
    const failed = commands.filter((command) => statuses[command.uuid] !== "ok");
    if (failed.length > 0) {
      const details = failed.map((command) => `${command.type}:${statuses[command.uuid] || "missing_status"}`).join(", ");
      const error = new Error(`Todoist command failure: ${details}`);
      error.response = response;
      error.failedCommands = failed;
      throw error;
    }
    return response;
  }

  async function createProject(app, token, name, endpoint) {
    const tempId = uuid();
    const command = buildCommand("project_add", { name }, tempId);
    const response = await syncCommands(app, token, [command], endpoint);
    const projectId = response.temp_id_mapping && response.temp_id_mapping[tempId];
    if (!projectId) throw new Error("Todoist did not return a project ID.");
    return { projectId, response };
  }

  async function createTasks(app, token, projectId, objectPath, workflowItems, dueDates, endpoint) {
    const commands = [];
    const tempIds = {};
    workflowItems.forEach((item, index) => {
      if (item.todoist_task_id) return;
      const tempId = uuid();
      tempIds[item.id] = tempId;
      const args = {
        content: item.label,
        project_id: projectId,
        description: `Prodigy Object: ${objectPath}\nWorkflow ID: ${item.id}`,
        child_order: index + 1
      };
      if (dueDates && dueDates[index]) args.due = { date: dueDates[index] };
      commands.push(buildCommand("item_add", args, tempId));
    });
    if (commands.length === 0) return { taskIds: {}, response: null };
    const response = await syncCommands(app, token, commands, endpoint);
    const taskIds = {};
    Object.keys(tempIds).forEach((workflowId) => {
      const taskId = response.temp_id_mapping && response.temp_id_mapping[tempIds[workflowId]];
      if (taskId) taskIds[workflowId] = taskId;
    });
    return { taskIds, response };
  }

  async function createExecutionArtifacts(options) {
    const app = options.app;
    const token = options.token || await getTodoistToken(app);
    if (!token) throw new Error("Todoist API token is not configured.");
    const workflowItems = options.workflowItems || [];
    const dueDates = buildTaskDueDates(workflowItems.length, options.startDate, options.dueDate);
    let projectId = options.todoistProjectId || "";
    if (!projectId) {
      const projectResult = await createProject(app, token, options.projectName, options.endpoint);
      projectId = projectResult.projectId;
    }
    const taskResult = await createTasks(
      app,
      token,
      projectId,
      options.objectPath,
      workflowItems,
      dueDates,
      options.endpoint
    );
    return {
      projectId,
      taskIds: taskResult.taskIds
    };
  }

  const api = {
    TODOIST_SYNC_URL,
    getTodoistToken,
    buildCommand,
    encodeCommands,
    syncCommands,
    createProject,
    createTasks,
    createExecutionArtifacts,
    getTodayIsoDate,
    buildTaskDueDates,
    redactError
  };

  root.ProjectTodoistAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
