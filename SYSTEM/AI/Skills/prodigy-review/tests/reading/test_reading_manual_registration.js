 "use strict";
 
 const assert = require("node:assert/strict");
 const fs = require("node:fs");
 const path = require("node:path");
 
 const ROOT = path.resolve(__dirname, "../../../../../..");
 
 // Minimal obsidian stub for CommonJS require
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
 const core = require(path.join(ROOT, "SYSTEM/Views/reading-core.js"));
 
 function main() {
   const template = fs.readFileSync(path.join(ROOT, "SYSTEM/TEMPLATE/FORMAT/template_reading.md"), "utf8");
 
   // --- Enum validation ---
   assert.equal(creator.validateReadingFormat("book"), "book");
   assert.equal(creator.validateReadingFormat("ebook"), "ebook");
   assert.equal(creator.validateReadingFormat("paper"), "paper");
   assert.equal(creator.validateReadingFormat("document"), "document");
   assert.equal(creator.validateReadingFormat("audiobook"), "audiobook");
   assert.equal(creator.validateReadingFormat("미분류"), "미분류");
   assert.equal(creator.validateReadingFormat(""), "미분류");
   assert.equal(creator.validateReadingFormat(null), "미분류");
   assert.throws(() => creator.validateReadingFormat("pdf"), /알 수 없는 reading_format/);
   assert.throws(() => creator.validateReadingFormat("magazine"), /알 수 없는 reading_format/);
 
   // READING_FORMATS enum is frozen and canonical
   assert.deepEqual(creator.READING_FORMATS, ["book", "ebook", "paper", "document", "audiobook", "미분류"]);
   assert.ok(Object.isFrozen(creator.READING_FORMATS));
 
   // --- Date validation ---
   assert.equal(creator.validateDate("2024"), "2024");
   assert.equal(creator.validateDate("2024-03"), "2024-03");
   assert.equal(creator.validateDate("2024-03-15"), "2024-03-15");
   assert.equal(creator.validateDate(""), null);
   assert.equal(creator.validateDate(null), null);
   assert.throws(() => creator.validateDate("2024-13"), /날짜 형식/);
   assert.throws(() => creator.validateDate("2024-00"), /날짜 형식/);
   assert.throws(() => creator.validateDate("2024-01-32"), /날짜 형식/);
   assert.throws(() => creator.validateDate("not-a-date"), /날짜 형식/);
   assert.throws(() => creator.validateDate("2024/03/15"), /날짜 형식/);
 
   // --- URL validation ---
   assert.equal(creator.validateUrl("https://example.com/book"), "https://example.com/book");
   assert.equal(creator.validateUrl("http://example.org"), "http://example.org");
   assert.equal(creator.validateUrl(""), null);
   assert.equal(creator.validateUrl(null), null);
   assert.throws(() => creator.validateUrl("not-a-url"), /URL 형식/);
   assert.throws(() => creator.validateUrl("ftp://example.com"), /URL 형식/);
   assert.throws(() => creator.validateUrl("javascript:alert(1)"), /URL 형식/);
 
   // --- Link validation ---
   assert.equal(creator.validateLink("[[Some Object]]"), "[[Some Object]]");
   assert.equal(creator.validateLink("PARA/RESOURCES/CONTACTS/사람.md"), "[[PARA/RESOURCES/CONTACTS/사람]]");
   assert.equal(creator.validateLink(""), null);
   assert.equal(creator.validateLink(null), null);
   assert.throws(() => creator.validateLink("[[broken"), /링크 형식/);
 
   // --- validateManualInput: valid input ---
   const validResult = creator.validateManualInput({
     title: "테스트 책",
     reading_format: "ebook",
     author: "저자",
     identifier: "978-89-01-23456-7",
     publisher: "출판사",
     publish_date: "2024-06-15",
     source_url: "https://example.com/book",
     cover_url: "https://example.com/cover.jpg",
     connections: "[[관련 Object]]"
   });
   assert.deepEqual(validResult.errors, []);
   assert.equal(validResult.values.title, "테스트 책");
   assert.equal(validResult.values.reading_format, "ebook");
   assert.equal(validResult.values.publish_date, "2024-06-15");
   assert.equal(validResult.values.source_url, "https://example.com/book");
 
   // --- validateManualInput: invalid input preserves original ---
   const invalidResult = creator.validateManualInput({
     title: "",
     reading_format: "invalid_format",
     publish_date: "bad-date",
     source_url: "not-a-url"
   });
   assert.ok(invalidResult.errors.length >= 3);
   assert.equal(invalidResult.values.reading_format, "invalid_format");
   assert.equal(invalidResult.values.publish_date, "bad-date");
   assert.equal(invalidResult.values.source_url, "not-a-url");
 
   // --- buildManualReadingContent: valid ---
   const content = creator.buildManualReadingContent(template, {
     title: "수동 등록 책",
     reading_format: "paper",
     author: "홍길동",
     identifier: "10.1234/doi",
     publisher: "학술출판",
     publish_date: "2023-01",
     source_url: "https://doi.org/10.1234/doi",
     cover_url: "",
     connections: ""
   }, new Date(2026, 6, 28, 10, 0));
   assert.match(content, /type: "reading"/);
   assert.match(content, /reading_format: "paper"/);
   assert.match(content, /identifier: "10.1234\/doi"/);
   assert.match(content, /publisher: "학술출판"/);
   assert.match(content, /source_url: "https:\/\/doi.org\/10.1234\/doi"/);
   assert.match(content, /## Key Takeaways/);
 
   // --- buildManualReadingContent: invalid throws with validation errors ---
   assert.throws(() => {
     creator.buildManualReadingContent(template, {
       title: "",
       reading_format: "bad",
       publish_date: "nope"
     });
   }, (error) => {
     assert.ok(error.validation);
     assert.ok(error.validation.length >= 2);
     assert.ok(error.input);
     return true;
   });
 
   // --- Collision suffix via writeReadingObject ---
   const files = new Map();
   const created = [];
   const fakeApp = {
     vault: {
       getAbstractFileByPath: (target) => (files.has(target) ? { path: target } : null),
       create: async (target, value) => {
         files.set(target, value);
         created.push(target);
         return { path: target };
       },
     },
   };
 
   async function testCollision() {
     const r1 = await creator.writeReadingObject(fakeApp, "content1", "같은 제목");
     assert.equal(r1.path, "PARA/PROJECTS/Reading/같은 제목.md");
     const r2 = await creator.writeReadingObject(fakeApp, "content2", "같은 제목");
     assert.equal(r2.path, "PARA/PROJECTS/Reading/같은 제목 (2).md");
     const r3 = await creator.writeReadingObject(fakeApp, "content3", "같은 제목");
     assert.equal(r3.path, "PARA/PROJECTS/Reading/같은 제목 (3).md");
   }
 
   // --- Manual zero-network: createManualReadingObject ---
   async function testManualZeroNetwork() {
     const templateContent = fs.readFileSync(path.join(ROOT, "SYSTEM/TEMPLATE/FORMAT/template_reading.md"), "utf8");
     const localFiles = new Map([[creator.TEMPLATE, templateContent]]);
     const localCreated = [];
     const localApp = {
       vault: {
         getAbstractFileByPath: (target) => (localFiles.has(target) ? { path: target } : null),
         read: async (file) => localFiles.get(file.path || file),
         create: async (target, value) => {
           localFiles.set(target, value);
           localCreated.push(target);
           return { path: target };
         },
       },
     };
     const result = await creator.createManualReadingObject(localApp, {
       title: "네트워크 없는 책",
       reading_format: "document",
       author: "테스트",
       publish_date: "2025-12",
       source_url: "https://example.com/doc"
     });
     assert.equal(result.path, "PARA/PROJECTS/Reading/네트워크 없는 책.md");
     assert.equal(localCreated.length, 1);
     const written = localFiles.get(result.path);
     assert.match(written, /reading_format: "document"/);
     assert.match(written, /source_url: "https:\/\/example.com\/doc"/);
     // Zero network: no fetch/http references in the manual path
     const src = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/reading-book-create.js"), "utf8");
     assert.equal(src.includes("fetch("), false);
     assert.equal(src.includes("XMLHttpRequest"), false);
     assert.equal(src.includes("require('http')"), false);
     assert.equal(src.includes('require("http")'), false);
   }
 
   // --- Legacy projection: missing format → 미분류 ---
   function testLegacyProjection() {
     assert.equal(core.projectReadingFormat(""), "미분류");
     assert.equal(core.projectReadingFormat(null), "미분류");
     assert.equal(core.projectReadingFormat(undefined), "미분류");
     assert.equal(core.projectReadingFormat("unknown_legacy"), "미분류");
     assert.equal(core.projectReadingFormat("book"), "book");
     assert.equal(core.projectReadingFormat("ebook"), "ebook");
     assert.equal(core.projectReadingFormat("미분류"), "미분류");
 
     // normalizeBook projects missing format
     const book = core.normalizeBook({ title: "Legacy Book", status: "reading" });
     assert.equal(book.reading_format, "미분류");
 
     const bookWithFormat = core.normalizeBook({ title: "New Book", reading_format: "audiobook" });
     assert.equal(bookWithFormat.reading_format, "audiobook");
 
     const bookWithBadFormat = core.normalizeBook({ title: "Bad Format", reading_format: "scroll" });
     assert.equal(bookWithBadFormat.reading_format, "미분류");
   }
 
   // --- Template has new fields ---
   function testTemplateFields() {
     assert.match(template, /reading_format:/);
     assert.match(template, /identifier:/);
     assert.match(template, /publisher:/);
     assert.match(template, /source_url:/);
     assert.match(template, /cover_url:/);
   }
 
   // Run async tests
   Promise.resolve()
     .then(testCollision)
     .then(testManualZeroNetwork)
     .then(() => {
       testLegacyProjection();
       testTemplateFields();
       console.log("Reading manual registration tests passed");
     })
     .catch((error) => {
       console.error(error.stack || error.message);
       process.exitCode = 1;
     });
 }
 
 main();
