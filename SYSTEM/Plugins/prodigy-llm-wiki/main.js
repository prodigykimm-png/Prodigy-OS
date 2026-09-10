'use strict';
const { Plugin, Notice } = require('obsidian');
const HUB_PATH = 'HUB/50 Knowledge.md';

// Product entry only. The existing Markdown/Dataview Hub owns rendering,
// source selection, consent, review, writers, and its disposal scope.
// Opening this entry never processes or approves a source automatically.
class ProdigyLLMWikiPlugin extends Plugin {
  onload() {
    this._opening = null;
    this.addCommand({ id: 'open-wiki-organizer', name: '자료 정리하기', callback: () => this.openOrganizer() });
    this.addRibbonIcon('library', 'LLM Wiki · 자료 정리하기', () => this.openOrganizer());
  }

  openOrganizer() {
    if (this._opening) return this._opening;
    this._opening = this._openOrganizer().catch(error => {
      new Notice(`LLM Wiki를 열지 못했습니다: ${error.message}`);
      return { ok: false, reason: error.message };
    }).finally(() => { this._opening = null; });
    return this._opening;
  }

  async _openOrganizer() {
    const file = this.app.vault.getAbstractFileByPath(HUB_PATH);
    if (!file || file.extension !== 'md') throw new Error('지식 워크스페이스 파일이 없습니다.');
    if (!this.app.plugins.getPlugin('dataview')) throw new Error('기존 지식 화면에 필요한 Dataview를 활성화하세요.');
    const realm = globalThis.window || globalThis;
    const hub = realm.KnowledgeExplorerHub || (realm.KnowledgeExplorerHub = {});
    hub._lastTab = 'llmwiki';
    const existing = this.app.workspace.getLeavesOfType('markdown').find(leaf => leaf.view?.file?.path === HUB_PATH);
    const leaf = existing || this.app.workspace.getLeaf('tab');
    await leaf.openFile(file, { active: true, state: { mode: 'preview' } });
    await this.app.workspace.revealLeaf(leaf);
    // A mounted Hub can switch immediately. A new Markdown render consumes
    // _lastTab through its existing mount; no polling or duplicate renderer.
    if (existing && hub.tabs?.select) hub.tabs.select('llmwiki');
    return { ok: true, status: 'opened', surface: 'existing_knowledge_hub', path: HUB_PATH };
  }

  onunload() {
    // Plugin removes registered commands/ribbon itself. Do not tear down the
    // normal Markdown leaf or cancel a user-owned review when entry is disabled.
    this._opening = null;
  }
}
module.exports = ProdigyLLMWikiPlugin;
