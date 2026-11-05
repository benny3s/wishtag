# 위시태그 (Wishtag)

선물이 겹치지 않게 — 누구나 위시리스트를 만들고, **링크만 보내면** 친구들이 골라서 선점하는 페이지.

- 페이지: https://benny3s.github.io/wishtag/
- 디자인·공용 코드: 약속 잡자(`/when/`)의 `ui.css`·`core.js` 를 같이 씀 → 그쪽을 고치면 `index.html` 의 `?v=` 도 올리기
- 저장: Firebase `benny-apps` Firestore (밴드매니저·약속 잡자와 같은 프로젝트). 규칙은 `benny3s/benny-apps` 의 `firestore.rules` '위시태그' 부분

## 구조

| 경로 | 내용 | 누가 |
|---|---|---|
| `wishes/{wid}` | 목록 — 이름·🔒·`kh` = sha256(지금 유효한 K) | wid 를 아는 사람 |
| `wishOwner/{K}` | K = sha256(wid:PIN) → 친구 화면 id | 경로를 아는 주인만 |
| `wishOps/{op}` | 주인 확인표 — 고칠 때마다 같은 batch 로 만듦. `kh` 가 있으면 sha256(k)==kh 일 때만 만들어짐 | 아무도 못 읽음 |
| `wishView/{v}` | 친구 화면 (제목·소개·순서·`wh` = sha256(wid)), v = 무작위. wid 는 없음 — 옮기기 전 옛 문서만 wid 를 가짐 | 링크(`?v=`)를 받은 사람 |
| `wishView/{v}/items/{id}` | 선물 | 주인은 전부, 친구는 선점·취소만 |

- 목록에서 들어가면 PIN 을 묻고, 맞으면 주인(추가·수정·순서·설정). 친구는 공유 링크로만 들어와 **닉네임 + 개인 PIN** 으로 선점, 같은 개인 PIN 으로 취소.
- 주인 열쇠 K 는 공개 문서에 넣지 않음. PIN 을 바꾸면 `kh` 가 바뀌어 옛 열쇠 · 숨은 열쇠가 죽음. 주인 판별은 이 기기의 `wt_key:*` 로 sha256(wid)==wh 인 것을 찾아서 함. 주소는 주인도 `?v=` (옛 `?w=` 링크는 계속 열림). 새 기기 · 다른 브라우저에서는 ⚙ 설정의 **주인 링크(`?w=`) + PIN** 으로 들어옴 — 주인만 보관, 친구에게는 공유 버튼의 `?v=`.
- 옛 문서 옮기기: `benny-apps/migrate_wish_1105.py` (새 규칙 배포 뒤). 시험: `python test/run.py` — 규칙 흉내 `test/rules_sim.js` 는 규칙을 고치면 같이 고침.
- 개인 PIN: 선점 땐 `sha256(sha256(PIN))` 만 남기고, 취소 땐 `sha256(PIN)` 을 보내 규칙이 대조. 원래 지민 위시태그(minim0.github.io/wishtag, Apps Script)에서 옮겨 온 선점도 예전 암호로 취소됨.

## 로컬에서

`secretary/` 를 웹 서버로 열고(`/when/` 이 옆에 있어야 함) http://localhost:8780/wishtag/ — 실제 Firebase 를 씀.
