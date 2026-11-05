/* 📶 저장 중 창 — 신호가 없으면 예전처럼 바로 닫고 큐에 맡기고, 저장하는 사이 사용자가 창을 닫거나 바꿨으면 건드리지 않는다 */
const { load, setup, tick, test, main, eq, ok, VID } = require("./env.js");

const col = "wishView/" + VID + "/items/";
const itemDocs = E => [...E.F.store.keys()].filter(k => k.startsWith(col));
const fresh = items => { const E = load(); setup(E, items || []); return E; };
const hung = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r("HANG"), ms || 60))]);
const offline = E => { E.F.hooks.offline = true; E.ctx.navigator.onLine = false; };
const QUEUED = "신호가 돌아오면 저장돼요";
const closes = (E, id) => E.closed.filter(x => x === id).length;
const hold = E => { let go; E.F.hooks.hold = new Promise(r => { go = r; }); return go; };

/* ── 신호 없음 ── */
test("선물 추가: 신호가 없으면 기다리지 않고 닫고, 큐에 맡겼다고 알림", async () => {
  const E = fresh();
  E.run("openItem(null)"); E.$("#i_name").value = "모자";
  offline(E);
  const r = await hung(E.$("#i_save").onclick());
  ok(r !== "HANG", "서버 확인을 끝없이 기다림");
  eq(E.$("#itemModal").hidden, true, "창이 안 닫힘");
  eq(itemDocs(E).length, 1, "기기에 쌓임");
  ok(E.statuses.some(s => s[0] === QUEUED), "안내: " + JSON.stringify(E.statuses));
  eq(E.$("#i_save").disabled, false, "저장 버튼이 잠긴 채");
});

test("선물 수정: 신호가 없으면 바로 닫고 큐에 맡김", async () => {
  const E = fresh([{ id: "g1", name: "옛 이름" }]);
  E.run("openItem(ITEMS[0])"); E.$("#i_name").value = "새 이름";
  offline(E);
  const r = await hung(E.$("#i_save").onclick());
  ok(r !== "HANG", "서버 확인을 끝없이 기다림");
  eq(E.$("#itemModal").hidden, true);
  eq(E.F.store.get(col + "g1").name, "새 이름");
  ok(E.statuses.some(s => s[0] === QUEUED), "안내");
});

test("설정: 신호가 없으면 바로 닫고 큐에 맡김", async () => {
  const E = fresh();
  E.run("openModal('setModal')"); E.$("#s_name").value = "새이름"; E.$("#s_heading").value = "제목";
  offline(E);
  const r = await hung(E.$("#s_save").onclick());
  ok(r !== "HANG", "서버 확인을 끝없이 기다림");
  eq(E.$("#setModal").hidden, true);
  eq(E.F.store.get("wishView/" + VID).heading, "제목");
  ok(E.statuses.some(s => s[0] === QUEUED), "안내");
  eq(E.$("#s_save").disabled, false);
});

test("온라인이면 지금처럼 저장이 끝난 뒤에 닫음 (끝나기 전엔 열려 있음)", async () => {
  const E = fresh();
  E.run("openItem(null)"); E.$("#i_name").value = "모자";
  const go = hold(E);
  const p = E.$("#i_save").onclick(); await tick(10);
  eq(E.$("#itemModal").hidden, false, "저장 중에 닫힘");
  go(); await p;
  eq(E.$("#itemModal").hidden, true);
  ok(!E.statuses.some(s => s[0] === QUEUED), "신호 안내가 뜸");
});

/* ── 저장 중에 창을 닫거나 바꿈 ── */
test("선물 저장 중 ✕ 로 닫고 다른 창을 연 뒤 저장이 끝나도 closeModal 을 또 부르지 않음", async () => {
  const E = fresh();
  E.run("openItem(null)"); E.$("#i_name").value = "모자";
  const go = hold(E);
  const p = E.$("#i_save").onclick(); await tick(10);
  E.ctx.closeModal("itemModal");                      // ✕
  E.run("openModal('setModal')");
  go(); await p; await tick(10);
  eq(closes(E, "itemModal"), 1, "선물 창을 닫은 횟수");
  eq(closes(E, "setModal"), 0, "다른 창이 닫힘");
  eq(E.$("#setModal").hidden, false);
  eq(itemDocs(E).length, 1, "저장은 됨");
});

test("선물 저장 중 ✕ 로 닫았다가 같은 창을 다시 열었으면 새로 연 창을 닫지 않음", async () => {
  const E = fresh();
  E.run("openItem(null)"); E.$("#i_name").value = "모자";
  const go = hold(E);
  const p = E.$("#i_save").onclick(); await tick(10);
  E.ctx.closeModal("itemModal");
  E.run("openItem(null)");                            // 새 선물 창
  go(); await p; await tick(10);
  eq(E.$("#itemModal").hidden, false, "새로 연 창이 닫힘");
  eq(closes(E, "itemModal"), 1);
});

test("설정 저장 중 ✕ 로 닫고 다른 창을 연 뒤 저장이 끝나도 closeModal 을 또 부르지 않음", async () => {
  const E = fresh();
  E.run("openModal('setModal')"); E.$("#s_name").value = "새이름"; E.$("#s_heading").value = "제목";
  const go = hold(E);
  const p = E.$("#s_save").onclick(); await tick(10);
  E.ctx.closeModal("setModal");
  E.run("openItem(null)");
  go(); await p; await tick(10);
  eq(closes(E, "setModal"), 1, "설정 창을 닫은 횟수");
  eq(closes(E, "itemModal"), 0, "다른 창이 닫힘");
  eq(E.$("#itemModal").hidden, false);
  eq(E.F.store.get("wishView/" + VID).heading, "제목", "저장은 됨");
});

main();
