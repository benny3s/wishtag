/* 새 리스트 만들기 — 예시 선물 batch 가 실패해도 화면 상태가 반쯤 바뀐 채 남지 않는다 */
const { load, itemPath, tick, test, main, eq, ok } = require("./env.js");

/** 다른 리스트(A)를 열어 둔 화면 */
function open(){
  const E = load();
  E.run("WID = 'AAAA'; KEY = 'ka'; VID = 'va'; unsub = [() => { __closed++; }];");
  E.ctx.__closed = 0;
  E.$("#n_name").value = "새 리스트"; E.$("#n_pin").value = "";
  E.$("#newModal").hidden = false;
  return E;
}
const wishIds = E => [...E.F.store.keys()].filter(k => /^wishes\/[^/]+$/.test(k)).map(k => k.split("/")[1]);
const exFail = ops => ops.some(o => o[0] === "set" && /^wishOps\//.test(o[1]));   // 둘째 batch(확인표 + 예시)만 실패

test("모두 성공 — 새 리스트가 열리고 예시 선물 2개와 순서가 들어간다", async () => {
  const E = open();
  await E.$("#n_make").onclick(); await tick(450);
  const [wid] = wishIds(E); ok(wid, "리스트가 안 만들어짐");
  eq(E.run("WID"), wid); eq(E.ctx.__closed, 1, "옛 리스트 구독이 안 닫힘");
  const v = E.run("VID"), items = [...E.F.store.keys()].filter(k => k.startsWith("wishView/" + v + "/items/"));
  eq(items.length, 2); eq(E.F.store.get("wishView/" + v).order.length, 2);
  eq(E.$("#newModal").hidden, true);
});

test("예시 batch 가 실패 — 옛 리스트 구독을 닫고, 새 리스트로 온전히 열린다", async () => {
  const E = open();
  E.F.hooks.failCommit = exFail;
  await E.$("#n_make").onclick(); await tick(450);
  const [wid] = wishIds(E); ok(wid, "첫 batch 는 성공했어야 함");
  eq(E.ctx.__closed, 1, "옛 리스트 구독이 살아 있음");
  eq(E.run("WID"), wid); eq(E.run("KEY") !== "ka", true); eq(E.run("VID") !== "va", true);
  ok(E.F.store.has("wishView/" + E.run("VID")), "VID 가 가리키는 화면 문서가 없음");
  eq(E.$("#newModal").hidden, true, "창이 남음");
  ok(E.statuses.some(s => /예시/.test(s[0])), "예시를 못 넣었다는 안내가 없음: " + JSON.stringify(E.statuses));
  ok(JSON.parse(E.ls["wt_mine"]).includes(wid), "이 기기 목록에 없음");
});

test("첫 batch 가 실패 — 아무것도 바뀌지 않고 창이 남는다", async () => {
  const E = open();
  E.F.hooks.failCommit = () => true;
  await E.$("#n_make").onclick(); await tick(450);
  eq(wishIds(E).length, 0);
  eq([E.run("WID"), E.run("KEY"), E.run("VID")], ["AAAA", "ka", "va"]);
  eq(E.ctx.__closed, 0); eq(E.$("#newModal").hidden, false);
  eq(E.$("#n_make").disabled, false);
  ok(E.statuses.some(s => s[1] === "err"));
});

main();
