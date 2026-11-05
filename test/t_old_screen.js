/* 배포 사이 — 옛 화면(커밋 69e3832, 캐시에 남은 탭)이 새 규칙 · 옮긴 문서에서 무엇이 되고 무엇이 안 되는가.
   안 되는 것은 '실패 안내'로 끝나야 하고, 자료가 망가지거나 주인이 잠기면 안 된다 */
const { execFileSync } = require("child_process");
const path = require("path");
const { makeDb, load, sha, tick, test, main, eq, ok, WID, VID } = require("./env.js");
const { rulesOn } = require("./rules_sim.js");

const OLD = execFileSync("git", ["-C", path.join(__dirname, ".."), "show", "69e3832:index.html"], { encoding: "utf8", maxBuffer: 1e8 });
const WH = sha(WID), itemP = id => "wishView/" + VID + "/items/" + id;
function seed(F, migrated, pin){
  const k = sha(WID + ":" + (pin || ""));
  F.store.set("wishes/" + WID, Object.assign({ name: "리스트", locked: !!pin }, migrated ? { kh: sha(k) } : {}));
  F.store.set("wishOwner/" + k, { wid: WID, v: VID, n: "n".repeat(10) });
  F.store.set("wishView/" + VID, Object.assign(migrated ? { wh: WH } : { wid: WID }, { heading: "제목", subheading: "", order: ["a1"] }));
  F.store.set(itemP("a1"), { name: "a1", note: "", link: "", claimedBy: "", claimedAt: 0, claimCheck: "", unclaim: "", example: false, op: "olda1" });
  rulesOn(F); F.hooks.live = true;
  return k;
}
const oldDevice = (F, ls) => { const E = load(F, { html: OLD }); Object.assign(E.ls, ls || {}); return E; };

for (const migrated of [false, true]){
  const tag = migrated ? "[옮긴 뒤] " : "[옮기기 전] ";

  test(tag + "옛 화면 — 친구가 ?v= 로 열고 선점 · 취소한다", async () => {
    const F = makeDb(); seed(F, migrated); const E = oldDevice(F);
    await E.run(`openView("${VID}")`); await tick();
    eq(E.$("#view-list").hidden, false); eq(E.run("KEY"), "");
    E.run(`openClaim(ITEMS[0], "claim", "")`);
    E.$("#cl_nick").value = "민"; E.$("#cl_pin").value = "pass12";
    await E.$("#cl_go").onclick();
    eq(F.store.get(itemP("a1")).claimedBy, "민", "선점 실패");
    const d = F.store.get(itemP("a1")); E.ctx.__it = Object.assign({ id: "a1" }, d);
    E.run(`openClaim(__it, "unclaim")`); E.$("#cl_pin").value = "pass12";
    await E.$("#cl_go").onclick();
    eq(F.store.get(itemP("a1")).claimedBy, "", "취소 실패");
  });

  test(tag + "옛 화면 — 주인이 목록으로 들어와 선물을 고친다", async () => {
    const F = makeDb(), k = seed(F, migrated, "1111");
    const E = oldDevice(F, { ["wt_key:" + WID]: k, wt_mine: JSON.stringify([WID]) });
    await E.run(`openOwner("${WID}")`); await tick();
    eq(E.run("KEY"), k);
    E.run("openItem(null)"); E.$("#i_name").value = "모자"; await E.$("#i_save").onclick(); await tick();
    eq([...F.store.keys()].filter(x => x.startsWith(itemP(""))).length, 2, "추가 실패 " + JSON.stringify(E.statuses));
  });

  test(tag + "옛 화면 — PIN 바꾸기는 안내와 함께 거절되고, 열쇠 · kh 는 그대로라 주인이 잠기지 않는다", async () => {
    const F = makeDb(), k = seed(F, migrated, "1111");
    const E = oldDevice(F, { ["wt_key:" + WID]: k, wt_mine: JSON.stringify([WID]) });
    await E.run(`openOwner("${WID}")`); await tick();
    E.$("#s_pin").value = "2222"; E.$("#setModal").hidden = false;
    await E.$("#s_pinSave").onclick(); await tick();
    ok(F.store.has("wishOwner/" + k), "옛 열쇠가 사라짐 — 주인이 잠김");
    ok(!F.store.has("wishOwner/" + sha(WID + ":2222")), "kh 없는 새 열쇠가 생김");
    ok(E.statuses.some(s => s[1] === "err"), "안내가 없음: " + JSON.stringify(E.statuses));
    eq(E.run("KEY"), k);
  });

  test(tag + "옛 화면 — 새 리스트 만들기는 안내와 함께 거절되고 아무것도 안 남는다", async () => {
    const F = makeDb(); seed(F, migrated); const E = oldDevice(F);
    const before = F.store.size;
    E.$("#n_name").value = "새"; E.$("#n_pin").value = ""; E.$("#newModal").hidden = false;
    await E.$("#n_make").onclick(); await tick(10);
    eq(F.store.size, before, "뭔가 남음");
    ok(E.statuses.some(s => s[1] === "err"));
  });
}

test("[옮긴 뒤] 옛 화면 — 주인이 ?v= 로 열면 친구 화면으로 보인다 (새로고침하면 해결, 자료 영향 없음)", async () => {
  const F = makeDb(), k = seed(F, true, "1111");
  const E = oldDevice(F, { ["wt_key:" + WID]: k, wt_mine: JSON.stringify([WID]) });
  await E.run(`openView("${VID}")`); await tick();
  eq(E.run("KEY"), ""); eq(E.$("#view-list").hidden, false);
});

main();
