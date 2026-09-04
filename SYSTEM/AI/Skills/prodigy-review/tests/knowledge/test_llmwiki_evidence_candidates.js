"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const candidates = require("../../../../../Views/llmwiki-evidence-candidates.js");

const fixture = `1. 포징 시에 버벅이면 안된다. 디렉을 하면서 다음 디렉을 생각 할것.\n\t1. 신부를 버진로드 계단에 앉힐 때 뒤돌아선 상태에서 측면으로 앉혀달라 할것.\n\t\t1. 뒤돌아서 몸만 틀어 측면으로 앉히기\n\t2. 레파토리를 만들어라. 처음에 앉혔으면 부케보세요 어깨보세요 신랑보세요 카메라 보세요 하고 바로바로 진행할 것\n\t3. 지금 버퍼링이 심하다. 하나를 마치고 다음 것을 생각하고 진행하기 때문이다. 나만의 레파토리를 만들어놓자.\n\t4. part 2 갈때 신부님 하고 부르면 네~ 하고 뒤돌아보게 하기. 그리고 따라가면서 찍고 망원 표준 광각 다 담기. 계속 부르면서 망원하고 다 담고 중간쯤 서게 해서 연출\n\t5. 원판 플래시컷 때 18mm로 베일이 안짤리는 범위까지 가기\n\t6. 수평수직을 꼭 맞춰라. 상단이나 하단의 선을 보고 맞추기.\n\t7. 뷰파인더를 꼭 봐라\n\t8. 플라워샤워할 때 부케들고 있는 팔 반대쪽 손동작 신경써라\n\t\t1. 왼손에 부케일때 오른손은 신랑 뺨 감싸고\n\t\t2. 오른손에 부케 일때 왼손은 신랑 목 감싸기\n9.\n`;

test("generic create behavior remains characterized", () => {
  assert.deepEqual(candidates.create(" Hello world. Next!"), [{ key: "evidence_1", text: "Hello world.", start: 1, end: 13 }, { key: "evidence_2", text: "Next!", start: 14, end: 19 }]);
});

test("semantic candidates yield substantive ordered Markdown units with exact spans", () => {
  const rows = candidates.createSemantic(fixture);
  assert.equal(rows.length, 12);
  assert.deepEqual(rows.map(row => row.text), [
    "포징 시에 버벅이면 안된다. 디렉을 하면서 다음 디렉을 생각 할것.", "신부를 버진로드 계단에 앉힐 때 뒤돌아선 상태에서 측면으로 앉혀달라 할것.", "뒤돌아서 몸만 틀어 측면으로 앉히기", "레파토리를 만들어라. 처음에 앉혔으면 부케보세요 어깨보세요 신랑보세요 카메라 보세요 하고 바로바로 진행할 것", "지금 버퍼링이 심하다. 하나를 마치고 다음 것을 생각하고 진행하기 때문이다. 나만의 레파토리를 만들어놓자.", "part 2 갈때 신부님 하고 부르면 네~ 하고 뒤돌아보게 하기. 그리고 따라가면서 찍고 망원 표준 광각 다 담기. 계속 부르면서 망원하고 다 담고 중간쯤 서게 해서 연출", "원판 플래시컷 때 18mm로 베일이 안짤리는 범위까지 가기", "수평수직을 꼭 맞춰라. 상단이나 하단의 선을 보고 맞추기.", "뷰파인더를 꼭 봐라", "플라워샤워할 때 부케들고 있는 팔 반대쪽 손동작 신경써라", "왼손에 부케일때 오른손은 신랑 뺨 감싸고", "오른손에 부케 일때 왼손은 신랑 목 감싸기"
  ]);
  rows.forEach(row => assert.equal(fixture.slice(row.start, row.end), row.text));
  assert.equal(rows.every((row, i) => i === 0 || rows[i - 1].end <= row.start), true);
  assert.deepEqual(candidates.createSemantic("---\ntitle: x\n---\n# Heading\n-\n  1.\n\n"), []);
});

test("semantic projection rejects malformed structural input", () => {
  assert.deepEqual(candidates.createSemantic(""), []);
  assert.deepEqual(candidates.createSemantic("---\ntitle: ignored\n---\n# Heading\n-\n*\n9.\n\n"), []);
  assert.deepEqual(candidates.createSemantic(null), []);
});

test("semantic projection preserves Unicode, repeated spans, and keys", () => {
  const source = "- 한국어 😀\n- 한국어 😀\n- 끝";
  const rows = candidates.createSemantic(source);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(row => row.key), ["evidence_1", "evidence_2", "evidence_3"]);
  assert.deepEqual(rows.map(row => source.slice(row.start, row.end)), rows.map(row => row.text));
  assert.notEqual(rows[0].start, rows[1].start);
});

test("semantic projection splits oversized units at deterministic byte boundaries", () => {
  const source = "- abc😀def";
  const rows = candidates.createSemantic(source, { max_bytes: 4 });
  assert.deepEqual(rows.map(row => row.text), ["abc", "😀", "def"]);
  assert.equal(rows.every(row => source.slice(row.start, row.end) === row.text), true);
});
