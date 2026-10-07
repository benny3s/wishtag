# 위시태그 (Wishtag)

선물이 겹치지 않게 — 누구나 위시리스트를 만들고, **링크만 보내면** 친구들이 골라서 선점하는 페이지.

- 페이지: https://benny3s.github.io/wishtag/
- 디자인·공용 코드: 약속 잡자(`/when/`)의 `ui.css`·`core.js` 를 같이 씀 → 그쪽을 고치면 `index.html` 의 `?v=` 도 올리기
- 저장: Firebase `benny-apps` Firestore (밴드매니저·약속 잡자와 같은 프로젝트). 규칙은 `benny3s/benny-apps` 의 `firestore.rules` '위시태그' 부분

## 구조

| 경로 | 내용 | 누가 |
|---|---|---|
| `wishes/{wid}` | 목록 — 이름·🔒 | 누구나 봄 |
| `wishOwner/{K}` | K = sha256(wid:PIN) → 친구 화면 id | 경로를 아는 주인만 |
| `wishOps/{op}` | 주인 확인표 — 고칠 때마다 같은 batch 로 만듦 | 아무도 못 읽음 |
| `wishView/{v}` | 친구 화면 (제목·소개·순서), v = 무작위 | 링크(`?v=`)를 받은 사람 |
| `wishView/{v}/items/{id}` | 선물 | 주인은 전부, 친구는 선점·취소만 |

- 목록에서 들어가면 PIN 을 묻고, 맞으면 주인(추가·수정·순서·설정). 친구는 공유 링크로만 들어와 **닉네임 + 개인 PIN** 으로 선점, 같은 개인 PIN 으로 취소.
- 개인 PIN: 선점 땐 `sha256(sha256(PIN))` 만 남기고, 취소 땐 `sha256(PIN)` 을 보내 규칙이 대조. 원래 지민 위시태그(minim0.github.io/wishtag, Apps Script)에서 옮겨 온 선점도 예전 암호로 취소됨.

## 로컬에서

`secretary/` 를 웹 서버로 열고(`/when/` 이 옆에 있어야 함) http://localhost:8780/wishtag/ — 실제 Firebase 를 씀.
