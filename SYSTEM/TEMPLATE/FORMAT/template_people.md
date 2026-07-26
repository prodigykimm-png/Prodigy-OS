---
type: people
status: active
relationship: 
company: 
role: 
birthday: 
first_met: 
last_contact: 
phone: 
email: 
connections: 
tags: 
---

# 

# AI 요약
*사실에 기반한 짧은 요약만 둡니다. 관계 판단·성격 진단·추정 금지. (이 Sprint에서는 수동 자리만 둡니다.)*
- 

# 관계
*상세 맥락만 본문에 둡니다. frontmatter relationship은 짧은 구분(가족/친구/지인/회사/학교/업무/커뮤니티/기타)만.*
*이 사람이 누구인지, 관계가 어떻게 시작됐는지, 현재 배경.*
- 

# 소통 방식
*관찰된 소통 선호와 유용한 맥락. 심리 진단은 하지 않습니다.*
- 

# 배운 점
*이 사람과의 상호작용에서 배운 것.*
- 

# 핵심 상호작용
*통찰만 기록합니다. 날짜와 출처는 최근 맥락(역링크)이 대체합니다.*
*형식: 통찰 한 줄*
- YYYY-MM-DD | [[원본 Object]] | 

# 메모
*사실 중심의 장기 맥락.*
- 

# 나의 성찰
*인간만 작성합니다. AI가 생성·덮어쓰지 않습니다.*
- 

# 첨부
*지원 파일만.*
- 

# 연결된 Object
*원본 Object가 사건·작업을 소유합니다. People는 관계 맥락과 큐레이션된 링크만 가집니다. 아래 목록은 실제 링크로 계산됩니다.*

## 프로젝트
```dataview
TABLE file.link AS "Object", status AS "상태"
FROM "PARA/PROJECTS"
WHERE type = "project" AND (contains(file.outlinks, this.file.link) OR contains(connections, this.file.link))
SORT file.mtime DESC
```

## 경매
```dataview
TABLE file.link AS "Object", status AS "상태"
FROM "PARA/PROJECTS"
WHERE type = "auction_case" AND (contains(file.outlinks, this.file.link) OR contains(connections, this.file.link))
SORT file.mtime DESC
```

## 저널
```dataview
TABLE file.link AS "Object"
FROM "DAILY/DAILY"
WHERE contains(file.outlinks, this.file.link) OR contains(connections, this.file.link)
SORT file.name DESC
LIMIT 20
```

## 독서
```dataview
TABLE file.link AS "Object", status AS "상태"
FROM "PARA/PROJECTS/Reading"
WHERE type = "reading" AND (contains(file.outlinks, this.file.link) OR contains(connections, this.file.link))
SORT file.mtime DESC
```

## 기타 역링크
```dataview
LIST FROM [[]]
WHERE file.path != this.file.path
```
