<!--memoge:html-->
<h1>Prodigy OS — Agent 규칙</h1>
<h2>Lore Commit 규칙</h2>
<p>비자명한 변경을 커밋할 때는 의사결정 맥락을 git trailer로 기록한다.<br>참고: <a href="https://arxiv.org/abs/2603.15566">https://arxiv.org/abs/2603.15566</a> | <a href="https://github.com/tmdgusya/lora">https://github.com/tmdgusya/lora</a></p>
<h2>형식</h2>
<ul>
<li>명령형 요약 (무엇을 했는지가 아니라 <em>왜</em> 했는지에 초점)</li>
<li>선택적 본문</li>
<li>git trailer (모두 선택 — 해당 커밋에 의미 있는 것만 포함)</li>
</ul>
<h2>Trailer 목록</h2>
<table>
<thead>
<tr>
<th>Trailer</th>
<th>용도</th>
<th>예시</th>
</tr>
</thead>
<tbody><tr>
<td><code>Constraint:</code></td>
<td>결정을 제약한 외부 조건</td>
<td><code>Constraint: 인증 서비스가 token introspection 미지원</code></td>
</tr>
<tr>
<td><code>Rejected:</code></td>
<td>고려했으나 기각한 대안과 이유</td>
<td>`Rejected: TTL 24시간 연장</td>
</tr>
<tr>
<td><code>Confidence:</code></td>
<td>확신 수준: <code>high</code> / <code>medium</code> / <code>low</code></td>
<td><code>Confidence: high</code></td>
</tr>
<tr>
<td><code>Scope-risk:</code></td>
<td>영향 범위: <code>narrow</code> / <code>moderate</code> / <code>broad</code></td>
<td><code>Scope-risk: narrow</code></td>
</tr>
<tr>
<td><code>Reversibility:</code></td>
<td>롤백 난이도: <code>clean</code> / <code>moderate</code> / <code>difficult</code></td>
<td><code>Reversibility: clean</code></td>
</tr>
<tr>
<td><code>Directive:</code></td>
<td>미래 수정자를 위한 경고</td>
<td><code>Directive: 4xx 처리 범위를 함부로 좁히지 말 것</code></td>
</tr>
<tr>
<td><code>Tested:</code></td>
<td>검증한 내용</td>
<td><code>Tested: 만료 토큰 갱신 단위 테스트</code></td>
</tr>
<tr>
<td><code>Not-tested:</code></td>
<td>알려진 테스트 공백</td>
<td><code>Not-tested: 콜드스타트 &gt;500ms 동작</code></td>
</tr>
<tr>
<td><code>Related:</code></td>
<td>연결된 커밋</td>
<td><code>Related: a1b2c3d (초기 auth 인터셉터)</code></td>
</tr>
</tbody></table>
<p>동일 trailer는 여러 줄 반복 가능. 사소한 변경(오타 수정, 포매팅)에는 trailer를 붙이지 않는다.</p>
<h2>예시</h2>
<pre><code class="language-text">긴 작업 중 세션 드롭 방지

인증 서비스가 토큰 만료 시 일관되지 않은 상태 코드를
반환하므로, interceptor가 모든 4xx를 받아 인라인 갱신을 트리거함.

Constraint: 인증 서비스가 token introspection 미지원
Rejected: TTL 24시간 연장 | 보안 정책 위반
Rejected: 타이머 기반 백그라운드 갱신 | 경합 조건
Confidence: high
Scope-risk: narrow
Directive: 오류 처리는 의도적으로 광범위(all 4xx) — 상위 동작 확인 없이 좁히지 말 것
Tested: 만료 토큰 갱신 단위 테스트
Not-tested: 인증 서비스 콜드스타트 &gt;500ms 동작
</code></pre>
<h2>Lore 조회</h2>
<p><code>git log --all --grep=&quot;^Constraint:&quot;</code> 등으로 의사결정 기록을 검색할 수 있다.</p>
<h2>커밋 정책</h2>
<ul>
<li>리포지토리: <code>github.com/prodigykimm-png/Prodigy-OS.git</code>, 브랜치 <code>main</code></li>
<li>커밋 메시지는 한국어 명령형, Conventional Commits 사용 금지</li>
<li>커밋은 저장점이다. 기능 하나가 동작하면 커밋하고, 위험한 실험 전에 커밋하고, 세션을 끝내기 전에 커밋한다. 변경을 몇 주 쌓아두지 않는다</li>
<li>다음 경로는 절대 커밋/푸시 금지 (<code>.gitignore</code>로 강제 중):<ul>
<li><code>INBOX/</code> — 분류 아키텍처가 확정되기 전까지 지식 인박스는 로컬 전용</li>
<li><code>artifacts/prodigy-knowledge-inbox/</code> — 분류 아키텍처 제안물</li>
<li><code>PARA/</code>, <code>SYSTEM/CACHE/</code> — 실행 상태와 캐시는 리포지토리 소유가 아님</li>
</ul>
</li>
<li>이 볼트는 iCloud에 있어 작업트리가 자주 더럽다. 자동 커밋/자동 pull/자동 push는 금지</li>
<li>복구는 <code>git reset</code>이나 강제 체크아웃이 아니라 되돌림(compensating) 커밋으로 한다</li>
</ul>
<h2>People Interaction Pipeline</h2>
<p>Daily Reflection Evidence 승인 시, <code>context: &quot;people&quot;</code> 블록은 자동으로 해당 사람의 CONTACTS 파일에 통찰을 기록한다.</p>
<ul>
<li>Evidence 승인 → <code>runHandoffs()</code> → PeopleCore + PeopleStore로 <code># 핵심 상호작용</code>에 insight line 추가</li>
<li>CONTACTS 파일이 없으면 <code>template_people.md</code>에서 자동 생성 (<code>type: people</code>)</li>
<li>insight line = 통찰만 (interpretation/title/experience). 날짜·링크 없음 — 최근 맥락(역링크)이 대체</li>
<li>별도 사용자 확인 불필요 (Phase 4 자동 handoff)</li>
<li>Venue/Place handoff와 달리 자동 실행. 단, Evidence 승인 자체가 사용자 승인을 전제함</li>
</ul>
<h3>핵심 상호작용 vs 최근 맥락 (중복 아님)</h3>
<ul>
<li><code># 핵심 상호작용</code>: 통찰 한 줄. 날짜·출처 없음. 사람이 직접 읽는 큐레이션된 인사이트</li>
<li><code>최근 맥락</code> (Dataview 역링크): 날짜·Object 링크 자동 계산. 시계열 컨텍스트</li>
<li>둘은 역할이 다르며 겹치지 않음</li>
</ul>
