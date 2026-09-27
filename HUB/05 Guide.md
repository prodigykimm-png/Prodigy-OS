<!--memoge:html-->
<hr>
<p>cssclasses:</p>
<ul>
<li>hide-properties_editing</li>
<li>hide-properties_reading</li>
</ul>
<hr>
<h1>Prodigy OS 사용법</h1>
<blockquote>
<p>이 문서는 Prodigy OS를 처음 사용하거나 흐름이 기억나지 않을 때 여는 안내서입니다.</p>
</blockquote>
<hr>
<h2>시작점</h2>
<p>모든 것은 <strong>Home</strong>에서 시작합니다. 폴더를 직접 열지 않습니다.</p>
<p>Home에서 할 수 있는 것:</p>
<ul>
<li>오늘 할 일 확인 (집중·이어하기·주의 대상)</li>
<li><strong>+ 새 Object</strong> — 유일한 Object 생성 진입점</li>
<li><strong>+ 오늘 Daily</strong> — 오늘 저널 열기 또는 생성</li>
<li><strong>검색</strong> — Vault 전체 검색</li>
<li><strong>사용법</strong> — 이 문서</li>
</ul>
<hr>
<h2>무엇을 어디에 기록하는가</h2>
<table>
<thead>
<tr>
<th>상황</th>
<th>이동</th>
<th>행동</th>
</tr>
</thead>
<tbody><tr>
<td>오늘 한 일·배운 것·감정</td>
<td>저널 (Journal)</td>
<td>Daily 작성 → Evidence Block</td>
</tr>
<tr>
<td>읽은 책·아티클 정리</td>
<td>독서 (Reading)</td>
<td>세션 기록 → 복기</td>
</tr>
<tr>
<td>경매 물건 분석</td>
<td>경매 (Auction)</td>
<td>사건 생성 → 권리·현장·입찰</td>
</tr>
<tr>
<td>반복 관리할 책임 영역</td>
<td>프로젝트 (Project)</td>
<td>프로젝트 또는 영역 생성</td>
</tr>
<tr>
<td>운동 기록</td>
<td>운동 (Workout)</td>
<td>세션 기록</td>
</tr>
<tr>
<td>사람·관계 맥락</td>
<td>개인 (Personal)</td>
<td>사람 추가</td>
</tr>
<tr>
<td>검증된 지식·원칙</td>
<td>지식 (Knowledge)</td>
<td>후보 작성 → 승인 → 영구 지식</td>
</tr>
<tr>
<td>아직 분류 못 한 빠른 메모</td>
<td>Inbox</td>
<td>빠른 기록 → 나중에 검토</td>
</tr>
<tr>
<td>모아둔 자료 정리</td>
<td>지식 (Knowledge)</td>
<td>INBOX에 넣기 → 분석 → 검토 → 승인</td>
</tr>
</tbody></table>
<hr>
<h2>핵심 흐름: 경험 → 지식 → 더 나은 판단</h2>
<pre><code class="language-text">경험 (Daily·Reading·Auction·Workout)
  ↓
성찰 (Journal Evidence Block)
  ↓
지식 후보 (Knowledge Candidate)
  ↓
사람 승인 (검증 대기 → 승인)
  ↓
영구 지식 (ZETA/PERMANENT)
  ↓
판단에 활용 (Decision Packet·PARA 연결)
</code></pre>
<hr>
<h2>지식 워크스페이스</h2>
<p>지식 화면에는 두 탭이 있습니다.</p>
<h3>지식 구축 · 제텔카스텐 (기본 탭)</h3>
<p>지식을 만들고 키우는 공간입니다.</p>
<ul>
<li><strong>+ 지식 후보 작성</strong>: 직접 공부하거나 경험한 내용을 후보로 저장</li>
<li><strong>+ 문헌노트 작성</strong>: 문헌·웹 자료를 출처와 함께 Literature Note로 정리</li>
<li><strong>검증 대기 열기/닫기</strong>: 필요할 때만 승인 전 후보를 펼쳐 제목·지식 문장·분류를 확인하고 승인·반려·보류</li>
<li><strong>지식 탐색기</strong>: 도메인 → 주제 → 영구 지식 순서로 탐색</li>
</ul>
<p>승인된 지식만 <code>ZETA/PERMANENT/</code>에 영구 보관됩니다.</p>
<h3>LLM Wiki로 자료 정리하기 (INBOX → 분석 → 검토 → 승인)</h3>
<p>모아둔 자료를 직접 분류하지 않고, AI 분석 + 사람 검토로 정리하는 흐름입니다.</p>
<pre><code class="language-text">INBOX에 자료 넣기
  ↓
지식 화면에서 대기 건수 확인
  ↓
분석 버튼 누르기 (이때만 AI 호출)
  ↓
제안 묶음 검토
  ↓
필요한 것만 골라 승인
  ↓
원본은 INBOX/Processed/YYYY-MM/으로 자동 이동
</code></pre>
<ul>
<li><strong>넣는 곳</strong>: <code>INBOX/</code> 루트의 <code>.md</code> 파일이 기본 분석 대상입니다.</li>
<li><strong>자동 제외</strong>: <code>INBOX/Private/</code>·<code>privacy: private</code>·사람 보호 기록·깨진 경로는 분석하지 않으며, 우회 방법은 없습니다.</li>
<li><strong>분석은 자동이 아닙니다</strong>: 버튼을 누른 그 묶음만 실행하고, 실행 중에 들어온 파일은 다음 묶음이 됩니다.</li>
<li><strong>분석 전 확인</strong>: 대기 건수·제외 건수·사용할 provider/모델이 표시됩니다. 파일명과 제외 이유는 펼쳐보기로 확인합니다.</li>
<li><strong>묶음 검토</strong>: 새로 만들 문헌·후보는 미리 선택되고, 기존 영구 지식 수정·병합·충돌·약한 근거는 선택되지 않습니다. 직접 체크한 것만 승인합니다.</li>
<li><strong>따로 적용</strong>: 승인한 항목은 각각 적용됩니다. 하나가 오래된 입력이어도 나머지는 적용되고, 승인하지 않은 제안은 보관됩니다.</li>
<li><strong>원본 이동</strong>: 연결된 제안이 전부 해결된 경우에만 원본 그대로 <code>INBOX/Processed/YYYY-MM/</code>으로 이동합니다. 전부 보류·일부 미해결이면 원본은 그대로 둡니다.</li>
<li><strong>실패 시</strong>: 조용히 다른 provider로 넘어가지 않습니다. <code>AI 설정 열기</code>·<code>다시 분석</code>·<code>나중에</code>만 표시됩니다.</li>
<li><strong>재시작 후</strong>: 대기열·완료 제안·미완료 상태가 자동 복원됩니다 (AI 호출 없음). 중단된 외부 요청은 자동 재전송하지 않으니 직접 다시 분석합니다.</li>
<li><strong>실행 장소</strong>: 분석 실행은 지정 Mac에서만 합니다. 다른 기기에서는 대기 목록과 검토·승인만 사용합니다.</li>
</ul>
<h3>지식 활용 · PARA</h3>
<p>프로젝트·영역·자료에서 실제로 쓰는 지식을 보는 공간입니다.</p>
<ul>
<li>명시적으로 연결된 승인 지식만 표시</li>
<li>후보·미검증 자료는 여기에 나타나지 않음</li>
<li>연결이 없으면 &quot;연결된 지식 없음&quot;으로 표시</li>
<li><strong>연결 방법</strong>: 원본 PARA Object의 <code>connections</code>에 승인 Knowledge의 exact wikilink를 추가한 뒤 지식 활용 탭을 다시 엽니다.</li>
<li><strong>문헌 노트 만들기</strong>: PARA의 문헌 노트 만들기는 제텔카스텐의 동일한 문헌노트 작성 창을 엽니다. 별도 저장 경로를 만들지 않습니다.</li>
</ul>
<h3>워크스페이스 간 지식 연결 규칙</h3>
<ul>
<li><strong>Daily/Journal</strong>: Evidence를 먼저 저장한 뒤 <code>daily_evidence</code> 후보를 만듭니다. <code>source_evidence_ids</code>와 Daily wikilink만 provenance로 남기며, 후보 저장이 끝나면 **검증 대기 열기**로 승인 화면에 이동합니다.</li>
<li><strong>Reading</strong>: Reading Session에서 <strong>지식 후보 만들기</strong>를 누르면 <code>reading_session</code> 후보와 세션 <code>source_objects</code>가 생깁니다. 후보 카드의 **세션 열기**와 Knowledge의 **원본 열기**는 본문을 복사하지 않고 같은 원본으로 돌아갑니다.</li>
<li><strong>Personal/People</strong>: People Object에 명시된 <code>connections</code>·wikilink만 맥락으로 투영합니다. 상세 화면에서 **연결된 승인 지식**은 원본 Knowledge를 열고, **연결된 지식 후보**는 후보 원본과 **검증 대기 열기**를 제공합니다. 사람 기록만으로 후보를 자동 생성하지 않습니다.</li>
<li><strong>Literature</strong>: 문헌노트는 <code>ZETA/LITERATURE/</code>의 canonical Source Object 하나를 <code>study_material</code> 후보의 <code>source_objects</code>로 가리킵니다. 자료 본문을 Candidate·Knowledge에 복제하지 않습니다.</li>
<li><strong>단일 규칙</strong>: <code>candidate_id</code>는 source ID·source Object·내용으로 결정되며 canonical writer가 같은 ID를 재저장하면 기존 후보를 재사용합니다. 승인 후에는 <code>promoted_knowledge</code>, Knowledge의 exact wikilink, PARA Object의 <code>connections</code>로만 재사용합니다. <code>invalidation_conditions</code>는 후보에서 승인 지식으로 보존되며 자동 폐기·자동 승격은 없습니다.</li>
</ul>
<hr>
<h2>저널 (Journal)</h2>
<ul>
<li><strong>Daily</strong>: 오늘 한 일, 배운 것, 감정을 Evidence Block으로 기록</li>
<li><strong>Weekly</strong>: 한 주를 복기하고 패턴을 확인</li>
<li><strong>Monthly</strong>: 반복된 Evidence에서 원칙 후보를 검증·승인</li>
</ul>
<p>AI는 Evidence를 정리하고 후보를 제안할 수 있지만, 저장·승인·승격은 항상 사람이 합니다.</p>
<hr>
<h2>경매 (Auction)</h2>
<p>상태 흐름: <code>관찰 → 입찰 → 낙찰/유찰/포기 → 복기 → 보관</code></p>
<ul>
<li>사건 생성: Home의 <strong>+ 새 Object</strong> 또는 경매 대시보드</li>
<li>권리분석·시장분석·현장임장·입찰 준비는 각 카드에서 진행</li>
<li>복기 완료 후 보관</li>
</ul>
<hr>
<h2>독서 (Reading)</h2>
<ul>
<li>책 추가 → 읽기 시작 → 세션 기록 → 복기 → 완독</li>
<li>Reading Session의 핵심 내용은 Knowledge Candidate로 제안 가능</li>
<li>Candidate 저장과 Knowledge 승격은 사람이 승인</li>
</ul>
<hr>
<h2>개인 (Personal)</h2>
<ul>
<li>사람 추가: 이름만 입력하면 People Object 생성</li>
<li>관계 맥락·상호작용 기록은 People Object에 보관</li>
<li>원본 사건·작업은 각 Object가 소유, People은 연결만</li>
</ul>
<hr>
<h2>AI 경계</h2>
<table>
<thead>
<tr>
<th>AI가 하는 것</th>
<th>사람이 하는 것</th>
</tr>
</thead>
<tbody><tr>
<td>Evidence 정리·요약</td>
<td>저장 여부 결정</td>
</tr>
<tr>
<td>패턴 감지·후보 제안</td>
<td>승인·반려·보류</td>
</tr>
<tr>
<td>분류·연결 추천</td>
<td>최종 분류 확정</td>
</tr>
<tr>
<td>브리핑·요약 생성</td>
<td>실제 판단·실행</td>
</tr>
</tbody></table>
<p>AI는 어떠한 경우에도 Knowledge를 자동 생성·승인·승격하지 않습니다.</p>
<hr>
<h2>Object 생성은 어디서?</h2>
<p><strong>Home의 + 새 Object</strong>가 유일한 생성 진입점입니다.</p>
<p>Inbox는 &quot;미분류 기록 검토함&quot;입니다. 여기서 새 Object를 만들지 않습니다.</p>
<hr>
<h2>문제가 생기면</h2>
<ol>
<li>Home을 다시 엽니다</li>
<li>Obsidian을 재시작합니다</li>
<li>필수 플러그인 확인: Dataview, Datacore, JS Engine, Meta Bind, Templater, QuickAdd, Journals, Tasks</li>
</ol>
<hr>
<p><em>이 문서는 Prodigy OS v1.5 기준입니다. 계약 변경 시 SYSTEM/docs/11_Operating_Guide.md와 함께 갱신합니다.</em></p>
