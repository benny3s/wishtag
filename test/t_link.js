/* 긴 링크 · 저장 실패 — 입력이 조용히 잘리지 않고, 저장이 안 되면 창과 입력이 그대로 남는다 */
const fs = require("fs"), path = require("path");
const { load, setup, itemPath, tick, test, main, eq, ok, VID } = require("./env.js");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const col = "wishView/" + VID + "/items/";
const itemDocs = E => [...E.F.store.keys()].filter(k => k.startsWith(col));
function fresh(items){ const E = load(); setup(E, items); return E; }
async function save(E, f){
  E.$("#i_name").value = f.name || "선물"; E.$("#i_note").value = f.note || ""; E.$("#i_link").value = f.link || "";
  await E.$("#i_save").onclick(); await tick(10);
}
const longKo = "https://shop.example.com/search?q=" + "한글검색어".repeat(30);     // 글자 수는 600 아래, 인코딩하면 600 넘음

test("링크 입력칸이 600자에서 조용히 자르지 않는다 (maxlength 600 이 아님)", () => {
  const m = html.match(/<input[^>]*id="i_link"[^>]*>/);
  ok(m, "입력칸을 못 찾음");
  const ml = m[0].match(/maxlength="(\d+)"/);
  ok(!ml || +ml[1] > 600, "maxlength=" + (ml && ml[1]));
});

test("인코딩 뒤 600자를 넘는 링크는 저장을 시도하지 않고 알려 주며, 창과 입력이 그대로 남는다", async () => {
  const E = fresh([]);
  ok(longKo.length < 600, "시험 입력이 이미 김");
  E.run("openItem(null)");
  await save(E, { name: "신발", note: "검정", link: longKo });
  eq(itemDocs(E).length, 0, "저장됨");
  eq(E.F.hooks.writes.length, 0, "쓰기가 나감");
  eq(E.$("#itemModal").hidden, false, "창이 닫힘");
  eq(E.$("#i_name").value, "신발"); eq(E.$("#i_link").value, longKo);
  ok(E.statuses.some(s => s[1] === "err" && /링크/.test(s[0]) && /길/.test(s[0])), "알림이 없음: " + JSON.stringify(E.statuses));
});

test("600자 이하 링크는 그대로 저장되고 창이 닫힌다", async () => {
  const E = fresh([]);
  const link = "https://shop.example.com/p/" + "a".repeat(500);
  E.run("openItem(null)");
  await save(E, { name: "가방", link });
  const ids = itemDocs(E); eq(ids.length, 1);
  eq(E.F.store.get(ids[0]).link, link);
  eq(E.$("#itemModal").hidden, true, "창이 안 닫힘");
});

test("선물 저장이 실패하면 창이 닫히지 않고 입력이 남는다", async () => {
  const E = fresh([]);
  E.F.hooks.failCommit = () => true;
  E.run("openItem(null)");
  await save(E, { name: "모자", note: "회색", link: "https://a.example.com/x" });
  eq(itemDocs(E).length, 0);
  eq(E.$("#itemModal").hidden, false, "창이 닫힘");
  eq([E.$("#i_name").value, E.$("#i_note").value, E.$("#i_link").value], ["모자", "회색", "https://a.example.com/x"]);
  ok(E.statuses.some(s => s[1] === "err"), "실패 알림이 없음");
  eq(E.$("#i_save").disabled, false, "저장 버튼이 잠긴 채");
});

test("선물 수정이 실패해도 창이 남고, 다시 누르면 저장된다", async () => {
  const E = fresh([{ id: "g1", name: "옛 이름" }]);
  E.F.hooks.failCommit = () => true;
  E.run("openItem(ITEMS[0])");
  await save(E, { name: "새 이름" });
  eq(E.F.store.get(col + "g1").name, "옛 이름"); eq(E.$("#itemModal").hidden, false);
  E.F.hooks.failCommit = null;
  await E.$("#i_save").onclick(); await tick(10);
  eq(E.F.store.get(col + "g1").name, "새 이름"); eq(E.$("#itemModal").hidden, true);
});

test("설정 저장이 실패하면 창이 닫히지 않는다", async () => {
  const E = fresh([]);
  E.F.hooks.failCommit = () => true;
  E.$("#s_name").value = "새이름"; E.$("#s_heading").value = "제목"; E.$("#s_sub").value = "소개";
  E.$("#setModal").hidden = false;
  await E.$("#s_save").onclick(); await tick(10);
  eq(E.$("#setModal").hidden, false, "창이 닫힘");
  eq(E.$("#s_sub").value, "소개");
  eq(E.F.store.get("wishView/" + VID).heading, "리스트", "저장됨");
});

test("설정 저장이 성공하면 저장되고 창이 닫힌다", async () => {
  const E = fresh([]);
  E.$("#s_name").value = "새이름"; E.$("#s_heading").value = "제목"; E.$("#s_sub").value = "소개";
  E.$("#setModal").hidden = false;
  await E.$("#s_save").onclick(); await tick(10);
  eq(E.F.store.get("wishView/" + VID).heading, "제목");
  eq(E.F.store.get("wishes/" + E.ctx.__W).name, "새이름");
  eq(E.$("#setModal").hidden, true);
});

main();
