---
name: prodigy-property-contract
description: Prodigy OS의 Property, status, type, Template frontmatter, Display Registry, Validator 또는 Evidence projection을 추가·삭제·변경할 때 사용한다. 영어 내부 API와 한국어 표시 계층의 계약을 읽기 전용 audit로 검사하고 문서와 구현 충돌을 자동 수정하지 않는다.
---

# Prodigy Property Contract

Property 변경의 호환성 gate다. 기준 우선순위와 충돌 처리 방식은 `references/contract-precedence.md`를 따른다.

## Workflow

1. 변경 대상 Property와 영향을 받는 Object type을 명시한다.
2. Constitution/Core Concepts → Schema → Template → Display Registry → Dashboard/View를 비교한다.
3. 구현 전후 아래 audit를 실행한다.

```bash
uv run SYSTEM/AI/Skills/prodigy-property-contract/scripts/audit_property_contract.py --vault . --format text
```

Property 삭제라면 `--removed-property <key>`를 추가한다.

4. 모든 사용자 표시 라벨은 한국어인지 실제 UI에서 확인한다.
5. 충돌은 경로, 내부 값, 기대 계약을 함께 보고하고 임의로 migration하지 않는다.

Audit는 영어 `snake_case`, 전용 Schema와 Template의 일치, status/type의 한국어 라벨,
UI의 raw Property 노출, 삭제된 Property의 Validator/Evidence/Test 잔존 참조를 검사한다.

작은 변경에서는 전체 기존 오류 수를 새 실패로 간주하지 않는다. 변경 전후 audit를 비교하고,
수정한 key와 직접 영향 경로에서 새로 추가된 충돌이 없는지만 gate로 사용한다.

## Invariants

- Internal Property와 enum은 영어 `snake_case`다.
- Display Registry만 한국어 라벨을 소유한다.
- `status`는 workflow이고 표시 문구가 아니다.
- Property 이름 변경은 public API 변경으로 취급한다.
- coarse progress나 계산값을 판단 근거로 승격하지 않는다.
