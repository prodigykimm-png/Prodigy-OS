"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
global.obsidian = {
  Modal: class {},
  Notice: class {},
  stringifyYaml(value) {
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${item === null ? "" : JSON.stringify(item)}`)
      .join("\n");
  },
};
const creator = require(path.join(ROOT, "SYSTEM/Views/reading-book-create.js"));

async function main() {
  const template = fs.readFileSync(path.join(ROOT, "SYSTEM/TEMPLATE/FORMAT/template_reading.md"), "utf8");

  // Reference section from main (plugin format)
  const withRef = creator.buildReadingContent(template, {
    title: "데일 카네기 인간관계론",
    metadata: {
      title: "데일 카네기 인간관계론",
      author: "데일 카네기",
      category: "국내도서",
      publish_date: "2019-10-07",
      cover_url: "https://example.test/cover.jpg",
      total_page: 420,
    },
    main: `---
title: x
---
# 데일 카네기 인간관계론

## 책소개
사람을 다루는 기술에 관한 고전이다.

## 목차
1부 사람을 다루는 기본 기술
2부 호감을 얻는 방법
`,
  }, new Date(2026, 6, 17, 14, 30));

  assert.match(withRef, /type: "reading"/);
  assert.match(withRef, /author: "데일 카네기"/);
  assert.match(withRef, /cover_url: "https:\/\/example.test\/cover.jpg"/);
  assert.match(withRef, /## Key Takeaways/);
  assert.match(withRef, /## 도서 정보 \(참고\)/);
  assert.match(withRef, /### 소개/);
  assert.match(withRef, /사람을 다루는 기술/);
  assert.match(withRef, /### 목차/);
  assert.match(withRef, /1부 사람을 다루는 기본 기술/);
  assert.match(withRef, /참고용/);
  for (const obsolete of ["total_page", "current_page", "purpose"]) {
    assert.equal(withRef.includes(obsolete), false);
  }
  assert.match(withRef, /progress:/);

  // No intro/toc → no reference section
  const bare = creator.buildReadingContent(template, {
    title: "얇은 책",
    metadata: { title: "얇은 책", author: "작가" },
  }, new Date(2026, 6, 17, 14, 30));
  assert.equal(bare.includes("## 도서 정보 (참고)"), false);

  // extract helpers
  assert.equal(
    creator.extractMarkdownSection("## 책소개\nhello\n\n## 목차\na", "책소개"),
    "hello"
  );
  assert.match(creator.extractBookReference({ main: "## 목차\n- A\n- B" }).toc, /A/);

  // createReadingObject forces intro/toc toggles temporarily
  const files = new Map([[creator.TEMPLATE, template]]);
  const created = [];
  let seenToggles = null;
  const settings = { toggleIntroduction: false, toggleIndex: false };
  const app = {
    plugins: {
      getPlugin: () => ({
        settings,
        getBookInfo: async (query) => {
          seenToggles = {
            intro: settings.toggleIntroduction,
            index: settings.toggleIndex,
          };
          return {
            ok: true,
            book: {
              title: query,
              metadata: { title: query, author: "작가" },
              main: `## 책소개\n소개문\n\n## 목차\n1장\n`,
            },
          };
        },
      }),
    },
    vault: {
      getAbstractFileByPath: (target) => (files.has(target) ? { path: target } : null),
      read: async (file) => files.get(file.path),
      create: async (target, value) => {
        assert.notEqual(value, "", "Reading Object must never be created empty");
        assert.match(value, /## 도서 정보 \(참고\)/);
        assert.match(value, /소개문/);
        assert.match(value, /1장/);
        files.set(target, value);
        created.push(target);
        return { path: target };
      },
    },
  };
  const result = await creator.createReadingObject(app, "한국어 책 제목");
  assert.equal(result.file.path, "PARA/PROJECTS/Reading/한국어 책 제목.md");
  assert.equal(created.length, 1);
  assert.deepEqual(seenToggles, { intro: true, index: true }, "call should force intro/toc on");
  assert.equal(settings.toggleIntroduction, false, "settings restored");
  assert.equal(settings.toggleIndex, false, "settings restored");

  await creator.createReadingObject(app, "한국어 책 제목");
  assert.equal(created[1], "PARA/PROJECTS/Reading/한국어 책 제목 (2).md");

  // --- One writer: search and manual converge on writeReadingObject ---
  assert.equal(typeof creator.writeReadingObject, "function");
  assert.equal(typeof creator.createManualReadingObject, "function");
  // createReadingObject must route through the shared writer (no inline create loop)
  const creatorSrc = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/reading-book-create.js"), "utf8");
  const createReadingBody = creatorSrc.slice(creatorSrc.indexOf("async function createReadingObject"));
  assert.match(createReadingBody, /writeReadingObject\(app, content, title\)/);

  // --- Create book/ebook/paper/document fixtures without network ---
  const templateContent = fs.readFileSync(path.join(ROOT, "SYSTEM/TEMPLATE/FORMAT/template_reading.md"), "utf8");
  const fixtureFiles = new Map([[creator.TEMPLATE, templateContent]]);
  const fixtureCreated = [];
  const fixtureApp = {
    vault: {
      getAbstractFileByPath: (target) => (fixtureFiles.has(target) ? { path: target } : null),
      read: async (file) => fixtureFiles.get(file.path || file),
      create: async (target, value) => {
        fixtureFiles.set(target, value);
        fixtureCreated.push(target);
        return { path: target };
      },
    },
  };
  for (const fmt of ["book", "ebook", "paper", "document"]) {
    const res = await creator.createManualReadingObject(fixtureApp, {
      title: `픽스처 ${fmt}`,
      reading_format: fmt,
      author: "작가",
      publish_date: "2024-01-01",
    });
    assert.match(res.path, new RegExp(`픽스처 ${fmt}\\.md$`));
    const written = fixtureFiles.get(res.path);
    assert.match(written, new RegExp(`reading_format: "${fmt}"`));
    assert.match(written, /status: "queue"/);
  }
  assert.equal(fixtureCreated.length, 4);
  // Zero network in the whole module
  assert.equal(creatorSrc.includes("fetch("), false);
  assert.equal(creatorSrc.includes("XMLHttpRequest"), false);

  const dashboard = fs.readFileSync(path.join(ROOT, "HUB/20 Reading.md"), "utf8");
  assert.equal(dashboard.includes('app.vault.create(filePath, "")'), false);
  assert.match(dashboard, /ReadingBookCreate\.open/);
  assert.match(dashboard, /openManualRegistrationModal/);
  console.log("Reading book creation tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
