/* 친구 화면에 wid 가 없어도 다 돌아가고, 주인은 이 기기의 열쇠로 알아본다. 주소창 · 공유 링크에도 wid 가 나가지 않는다 */
const { makeDb, load, sha, tick, test, main, eq, ok, WID, VID, KEY } = require("./env.js");
const { rulesOn } = require("./rules_sim.js");

const WH = sha(WID);
const itemPath = (id, v) => "wishView/" + (v || VID) + "/items/" + id;
/** 저장소에 리스트 하나. migrated: 옮긴 뒤(wh·kh) / 아니면 옛 문서(wid 있음, kh 없음) */
function seed(F, opt){
  opt = opt || {};
  const pin = opt.pin || "", k = sha(WID + ":" + pin), m = opt.migrated !== false;
  F.store.set("wishes/" + WID, Object.assign({ name: "지민 생일", locked: !!pin }, m ? { kh: sha(k) } : {}));
  F.store.set("wishOwner/" + k, { wid: WID, v: VID, n: "n".repeat(10) });
  F.store.set("wishView/" + VID, Object.assign(m ? { wh: WH } : { wid: WID }, { heading: "생일 선물", subheading: "고마워요", order: ["a1", "b2"] }));
  ["a1", "b2"].forEach(id => F.store.set(itemPath(id), { name: id, note: "", link: "", claimedBy: "", claimedAt: 0, claimCheck: "", unclaim: "", example: false, op: "old" + id }));
  return k;
}
/** 기기 하나 (같은 저장소) */
function device(F, ls){
  const E = load(F);
  Object.assign(E.ls, ls || {});
  F.hooks.live = true;
  return E;
}
const owned = (k, wid) => ({ ["wt_key:" + (wid || WID)]: k, ["wt_v:" + (wid || WID)]: VID, wt_mine: JSON.stringify([wid || WID]) });
const state = E => ({ WID: E.run("WID"), VID: E.run("VID"), KEY: E.run("KEY") });
const lastUrl = E => E.urls[E.urls.length - 1] || "";

test("새 리스트의 친구 화면 문서에는 wid 가 없고 wh = sha256(wid) 만 있다", async () => {
  const F = makeDb(), E = load(F); rulesOn(F);
  E.$("#n_name").value = "새 리스트"; E.$("#n_pin").value = "4321"; E.$("#newModal").hidden = false;
  await E.$("#n_make").onclick(); await tick(450);
  const wid = E.run("WID"), v = E.run("VID");
  ok(wid && v, "안 만들어짐: " + JSON.stringify(E.statuses) + JSON.stringify(F.hooks.ruleLog));
  const d = F.store.get("wishView/" + v);
  eq("wid" in d, false, "wid 가 공개 문서에 있음");
  eq(d.wh, sha(wid));
});

test("새 리스트의 공개 문서 어디에도 열쇠 K · PIN 이 없다 (wishes.kh = sha256(K))", async () => {
  const F = makeDb(), E = load(F); rulesOn(F);
  E.$("#n_name").value = "새 리스트"; E.$("#n_pin").value = "4321";
  await E.$("#n_make").onclick(); await tick(450);
  const wid = E.run("WID"), v = E.run("VID"), k = sha(wid + ":4321");
  ok(wid, "안 만들어짐");
  const pub = JSON.stringify([F.store.get("wishes/" + wid), F.store.get("wishView/" + v), ...[...F.store.keys()].filter(x => x.startsWith("wishView/" + v + "/items/")).map(x => F.store.get(x))]);
  ok(!pub.includes(k), "K 가 공개 문서에 있음"); ok(!pub.includes("4321"), "PIN 이 공개 문서에 있음");
  eq(F.store.get("wishes/" + wid).kh, sha(k));
});

test("친구가 ?v= 로 열면 WID 가 비어 있고 제목 · 소개 · 선물이 보이며 관리 버튼은 없다", async () => {
  const F = makeDb(); seed(F); const E = device(F);
  await E.run(`openView("${VID}")`); await tick();
  eq(state(E), { WID: "", VID, KEY: "" });
  eq(E.$("#view-list").hidden, false, "화면이 안 뜸");
  eq(E.$("#wlHeading").textContent, "생일 선물"); eq(E.$("#wlSub").textContent, "고마워요");
  eq(E.$("#ownerBar").hidden, true); eq(E.$("#ownerTools").hidden, true); eq(E.$("#addBtn").hidden, true);
  eq(E.$("#view-home").hidden, true); eq(E.$("#view-lock").hidden, true);
  eq(E.$("#pickName").textContent, "🎁 리스트 고르기");
  ok(E.$("#gifts").children.length > 0, "선물이 안 그려짐");
  eq(lastUrl(E).endsWith("?v=" + VID), true);
});

test("친구 기기 저장소 · 주소에 wid 가 남지 않고, 친구가 받은 자료로 PIN 을 대입해도 열쇠를 못 찾는다", async () => {
  const F = makeDb(); const k = seed(F, { pin: "0420" }); const E = device(F);
  await E.run(`openView("${VID}")`); await tick();
  ok(!JSON.stringify(E.ls).includes(WID), "기기 저장소에 wid");
  ok(!E.urls.join().includes(WID), "주소에 wid");
  /* 친구가 읽을 수 있는 것: 화면 문서 + 선물. 안에 wid 가 있으면 그걸로 1만 번 대입할 수 있다 */
  const seen = JSON.stringify([F.store.get("wishView/" + VID), F.store.get(itemPath("a1")), F.store.get(itemPath("b2"))]);
  ok(!seen.includes(WID), "읽을 수 있는 문서에 wid");
  const got = F.store.get("wishView/" + VID).wid;
  let hit = false;
  for (let p = 0; p < 10000 && !hit; p++) hit = F.store.has("wishOwner/" + sha(got + ":" + String(p).padStart(4, "0")));
  ok(!hit, "1만 번 대입으로 주인 열쇠를 찾음");
  ok(F.store.has("wishOwner/" + k));
});

test("친구 화면 — 리스트 고르기 창의 🏠 홈으로 버튼이 그대로 있다 (WID 가 비어도)", async () => {
  const F = makeDb(); seed(F); const E = device(F);
  await E.run(`openView("${VID}")`); await tick();
  E.run(`openModal("pickModal")`);
  eq(E.$("#homeBtn").hidden, false, "홈으로 가는 길이 사라짐");
});

test("친구 화면 — 선점하고 같은 개인 PIN 으로 취소한다 (규칙 통과)", async () => {
  const F = makeDb(); seed(F); rulesOn(F); const E = device(F);
  await E.run(`openView("${VID}")`); await tick();
  E.run(`openClaim(ITEMS.find(x => x.id === "a1"), "claim", "")`);
  E.$("#cl_nick").value = "민"; E.$("#cl_pin").value = "pass12";
  await E.$("#cl_go").onclick();
  const d = F.store.get(itemPath("a1"));
  eq(d.claimedBy, "민", "선점 실패: " + E.$("#clMsg").textContent);
  E.ctx.__it = Object.assign({ id: "a1" }, d);
  E.run(`openClaim(__it, "unclaim")`);
  E.$("#cl_pin").value = "pass12";
  await E.$("#cl_go").onclick();
  eq(F.store.get(itemPath("a1")).claimedBy, "", "취소 실패: " + E.$("#clMsg").textContent);
});

test("이 기기가 주인이면 ?v= 로 열어도 주인으로 알아본다 (옮긴 문서)", async () => {
  const F = makeDb(), k = seed(F), E = device(F, owned(KEY));
  await E.run(`openView("${VID}")`); await tick();
  eq(state(E), { WID, VID, KEY: k });
  eq(E.$("#ownerBar").hidden, false); eq(E.$("#addBtn").hidden, false);
});

test("이 기기 목록(wt_mine)에서 밀려나고 wt_key 만 남은 주인도 알아보고, 리스트 이름도 받아 본다", async () => {
  const F = makeDb(), k = seed(F), E = device(F, { ["wt_key:" + WID]: KEY, wt_mine: JSON.stringify(["other"]) });
  await E.run(`openView("${VID}")`); await tick();
  eq(state(E), { WID, VID, KEY: k });
  eq(E.$("#pickName").textContent, "지민 생일", "리스트 정보를 안 받음");
});

test("옛 문서(wid 있음)도 — 주인 기기는 주인, 다른 기기는 친구", async () => {
  const F = makeDb(), k = seed(F, { migrated: false });
  const O = device(F, owned(KEY));
  await O.run(`openView("${VID}")`); await tick();
  eq(state(O), { WID, VID, KEY: k });
  const P = device(F);
  await P.run(`openView("${VID}")`); await tick();
  eq([P.run("KEY"), P.run("VID")], ["", VID]);
  eq(P.$("#view-list").hidden, false);
});

test("wid 는 알지만 열쇠가 없는 기기(PIN 바뀌어 지워짐)는 친구 화면 — 리스트는 알아본다", async () => {
  const F = makeDb(); seed(F, { pin: "1111" });
  const E = device(F, { wt_mine: JSON.stringify([WID]) });
  await E.run(`openView("${VID}")`); await tick();
  eq(state(E), { WID, VID, KEY: "" });
  eq(E.$("#ownerBar").hidden, true);
});

test("남이 wh 만 베껴 만든 가짜 화면을 주인이 열어도 주인 권한으로 열지 않는다 (열쇠의 v 와 다름)", async () => {
  const F = makeDb(); seed(F);
  const fake = "f".repeat(24);
  F.store.set("wishView/" + fake, { wh: WH, heading: "가짜", subheading: "", order: [] });
  const E = device(F, owned(KEY));
  await E.run(`openView("${fake}")`); await tick();
  eq(E.run("KEY"), "", "가짜 화면에서 주인이 됨");
});

test("기억한 열쇠가 숨은 열쇠(문서는 있으나 kh 와 다름)면 주인으로 열지 않는다", async () => {
  const F = makeDb(); seed(F, { pin: "1111" });
  const hidden = sha(WID + ":9999");
  F.store.set("wishOwner/" + hidden, { wid: WID, v: VID, n: "h".repeat(10) });
  const V = device(F, { ["wt_key:" + WID]: hidden, wt_mine: JSON.stringify([WID]) });
  await V.run(`openView("${VID}")`); await tick();
  eq(V.run("KEY"), "", "?v= 로 주인이 됨");
  const L = device(F, { ["wt_key:" + WID]: hidden, wt_mine: JSON.stringify([WID]) });
  await L.run(`openOwner("${WID}")`); await tick();
  eq(L.run("KEY"), "", "목록으로 주인이 됨");
  eq(L.$("#view-lock").hidden, false, "PIN 을 다시 묻지 않음");
});

test("주인 화면 주소도 ?v= 라서 주소창을 복사해도 wid 가 나가지 않는다", async () => {
  const F = makeDb(), k = seed(F, { pin: "1111" }), E = device(F, owned(k));
  await E.run(`openOwner("${WID}")`); await tick();
  eq(E.run("KEY"), k);
  eq(lastUrl(E).endsWith("?v=" + VID), true, "주소: " + lastUrl(E));
  ok(!lastUrl(E).includes(WID), "주소에 wid");
});

test("옛 ?w= 링크로 PIN 을 넣어 들어오면 열리고, 주소는 ?v= 로 바뀐다", async () => {
  const F = makeDb(), k = seed(F, { pin: "1111" }), E = device(F);
  await E.run(`openOwner("${WID}")`); await tick();
  eq(E.$("#view-lock").hidden, false, "잠금 화면이 안 뜸");
  await E.run(`openOwner("${WID}", "1111")`); await tick();
  eq(state(E), { WID, VID, KEY: k });
  eq(lastUrl(E).endsWith("?v=" + VID), true);
});

test("옛 ?w= 링크로 틀린 PIN 을 넣으면 들어가지 못한다", async () => {
  const F = makeDb(); seed(F, { pin: "1111" }); const E = device(F);
  await E.run(`openOwner("${WID}", "2222")`); await tick();
  eq(E.run("KEY"), ""); ok(/맞지 않아요/.test(E.$("#lockHint").textContent), E.$("#lockHint").textContent);
});

test("PIN 없는 리스트는 옛 ?w= 링크로 바로 주인 (지금처럼)", async () => {
  const F = makeDb(), k = seed(F), E = device(F);
  await E.run(`openOwner("${WID}")`); await tick();
  eq(state(E), { WID, VID, KEY: k });
});

test("공유 링크에는 ?v= 만 있다", async () => {
  const F = makeDb(), k = seed(F), E = device(F, owned(k));
  await E.run(`openOwner("${WID}")`); await tick();
  let line = ""; E.ctx.shareLine = t => { line = t; };
  E.$("#shareBtn").onclick();
  ok(line.includes("?v=" + VID), line); ok(!line.includes(WID), "공유 글에 wid");
});

test("친구 화면 — 없는 화면이면 안내", async () => {
  const F = makeDb(), E = device(F);
  await E.run(`openView("nope")`); await tick();
  ok(E.statuses.some(s => /없는 리스트/.test(s[0])));
  eq(E.run("VID"), "");
});

main();
