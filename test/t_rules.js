/* 규칙 흉내(rules_sim) 위에서 — 주인 · 친구 · PIN 바꾸기 · 지우기 · 옛 문서가 다 되고, 옛 열쇠 · 숨은 열쇠는 막힌다.
   묶음마다 문서 접근은 캐시 없이 세어 20 을 넘지 않아야 한다 */
const { makeDb, load, sha, tick, test, main, eq, ok, WID, VID } = require("./env.js");
const { rulesOn, check } = require("./rules_sim.js");

const WH = sha(WID);
const itemP = id => "wishView/" + VID + "/items/" + id;
function seed(F, opt){
  opt = opt || {};
  const pin = opt.pin || "", k = sha(WID + ":" + pin), m = opt.migrated !== false, ids = opt.items || ["a1", "b2"];
  F.store.set("wishes/" + WID, Object.assign({ name: "리스트", locked: !!pin }, m ? { kh: sha(k) } : {}));
  F.store.set("wishOwner/" + k, { wid: WID, v: VID, n: "n".repeat(10) });
  F.store.set("wishView/" + VID, Object.assign(m ? { wh: WH } : { wid: WID }, { heading: "제목", subheading: "", order: ids }));
  ids.forEach(id => F.store.set(itemP(id), { name: id, note: "", link: "", claimedBy: "", claimedAt: 0, claimCheck: "", unclaim: "", example: !!opt.example, op: "old" + id }));
  return k;
}
function syncItems(E){
  const pre = itemP("");
  E.ctx.__I = [...E.F.store.keys()].filter(x => x.startsWith(pre)).map(x => Object.assign({ id: x.slice(pre.length) }, E.F.store.get(x)));
  E.ctx.__WS = Object.assign({ id: WID }, E.F.store.get("wishes/" + WID));
  E.ctx.__VW = E.F.store.get("wishView/" + VID) || null;
  E.run("ITEMS = __I; LISTS = [__WS]; VIEW = __VW;");
}
/** 주인 기기를 열어 둔다 */
async function ownerDevice(F, k){
  const E = load(F);
  Object.assign(E.ls, { ["wt_key:" + WID]: k, wt_mine: JSON.stringify([WID]) });
  await E.run(`openOwner("${WID}")`); await tick();
  eq(E.run("KEY"), k, "주인으로 못 들어감: " + JSON.stringify(E.statuses));
  syncItems(E);
  return E;
}
const fresh = o => { const F = makeDb(), k = seed(F, o); rulesOn(F); return { F, k }; };
const denied = F => F.hooks.ruleLog.filter(r => !r.ok).slice(0, 2).map(r => r.why).join(" / ");
const limitOk = F => { F.hooks.ruleLog.forEach(r => ok(r.ok || !/접근/.test(r.why), "문서 접근 한도: " + r.why)); return Math.max(0, ...F.hooks.ruleLog.map(r => r.count)); };
/** 손으로 만든 요청 (공격자 · 다른 사람) */
const req = (F, ops) => check(F.store, ops);
const opDoc = (op, wid, k) => ["set", "wishOps/" + op, { wid, k, at: { __sv: 1 } }];
const viewEdit = (F, op, wid, k) => req(F, [opDoc(op, wid, k), ["update", "wishView/" + VID, { heading: "고침", op }]]);

for (const migrated of [true, false]){
  const tag = migrated ? "옮긴 문서" : "옛 문서";

  test(tag + " — 주인이 선물을 추가 · 수정 · 순서 바꾸기 · 선점 해제한다", async () => {
    const { F, k } = fresh({ migrated }); const E = await ownerDevice(F, k);
    E.run("openItem(null)"); E.$("#i_name").value = "모자"; await E.$("#i_save").onclick(); await tick();
    eq([...F.store.keys()].filter(x => x.startsWith(itemP(""))).length, 3, "추가 실패 " + denied(F));
    syncItems(E);
    E.run(`openItem(ITEMS.find(x => x.id === "a1"))`); E.$("#i_name").value = "새 이름"; await E.$("#i_save").onclick(); await tick();
    eq(F.store.get(itemP("a1")).name, "새 이름", "수정 실패 " + denied(F));
    syncItems(E);
    E.run(`moveItem("a1", 1)`); await tick(10);
    ok(F.store.get("wishView/" + VID).order.indexOf("a1") > 0, "순서 실패 " + denied(F));
    F.store.set(itemP("b2"), Object.assign({}, F.store.get(itemP("b2")), { claimedBy: "민", claimCheck: sha("x") })); syncItems(E);
    await E.run(`ownerRelease(ITEMS.find(x => x.id === "b2"))`); await tick(10);
    eq(F.store.get(itemP("b2")).claimedBy, "", "선점 해제 실패 " + denied(F));
    limitOk(F);
  });

  test(tag + " — 친구 선점 · 취소가 되고, 주인 아닌 사람의 고치기는 거절", () => {
    const { F } = fresh({ migrated });
    const u = sha("x"), chk = sha(u), cur = F.store.get(itemP("a1"));
    ok(req(F, [["update", itemP("a1"), { claimedBy: "민", claimedAt: 1, claimCheck: chk, unclaim: "" }]]).ok, "선점 거절");
    F.store.set(itemP("a1"), Object.assign({}, cur, { claimedBy: "민", claimedAt: 1, claimCheck: chk, unclaim: "" }));
    ok(!req(F, [["update", itemP("a1"), { claimedBy: "", claimedAt: 0, claimCheck: "", unclaim: sha("y") }]]).ok, "틀린 PIN 으로 취소");
    ok(req(F, [["update", itemP("a1"), { claimedBy: "", claimedAt: 0, claimCheck: "", unclaim: u }]]).ok, "취소 거절");
    ok(!req(F, [["update", itemP("b2"), { name: "장난" }]]).ok, "친구가 이름을 바꿈");
    ok(!req(F, [["update", "wishView/" + VID, { heading: "장난" }]]).ok, "친구가 제목을 바꿈");
    ok(!req(F, [["delete", itemP("b2")]]).ok, "친구가 지움");
  });

  test(tag + " — 다른 리스트의 주인은 이 리스트를 못 고친다", () => {
    const { F } = fresh({ migrated });
    const A = "a".repeat(12), KA = sha(A + ":");
    F.store.set("wishes/" + A, { name: "남", locked: false, kh: sha(KA) });
    F.store.set("wishOwner/" + KA, { wid: A, v: "x".repeat(24), n: "n".repeat(10) });
    ok(!viewEdit(F, "op1", A, KA).ok, "남의 확인표로 고쳐짐");
    ok(!req(F, [opDoc("xi_" + VID + "_a1", A, KA), ["delete", itemP("a1")]]).ok, "남의 확인표로 지워짐");
    ok(!viewEdit(F, "op2", WID, KA).ok, "남의 열쇠로 확인표");
  });

  test(tag + " — PIN 바꾸기: 새 열쇠로 고쳐지고, 옛 열쇠는 막히고, kh 가 새 열쇠 것이 된다", async () => {
    const { F, k } = fresh({ migrated, pin: "1111" }); const E = await ownerDevice(F, k);
    E.$("#s_pin").value = "2222"; E.$("#setModal").hidden = false;
    await E.$("#s_pinSave").onclick(); await tick();
    const k2 = sha(WID + ":2222");
    ok(F.store.has("wishOwner/" + k2), "새 열쇠가 없음: " + denied(F));
    ok(!F.store.has("wishOwner/" + k), "옛 열쇠가 남음");
    eq(F.store.get("wishes/" + WID).kh, sha(k2));
    eq(E.run("KEY"), k2);
    ok(!viewEdit(F, "opold", WID, k).ok, "옛 열쇠가 통함");
    ok(viewEdit(F, "opnew", WID, k2).ok, "새 열쇠가 안 통함");
    limitOk(F);
  });

  test(tag + " — PIN 바꾸는 순간 숨은 열쇠가 죽는다", async () => {
    const { F, k } = fresh({ migrated, pin: "1111" });
    const hidden = sha("숨은 값");
    F.store.set("wishOwner/" + hidden, { wid: WID, v: VID, n: "h".repeat(10) });       // 옛날에 만들어 둔 숨은 열쇠
    const E = await ownerDevice(F, k);
    E.$("#s_pin").value = "2222"; E.$("#setModal").hidden = false;
    await E.$("#s_pinSave").onclick(); await tick();
    ok(F.store.has("wishOwner/" + sha(WID + ":2222")), "PIN 이 안 바뀜: " + denied(F));
    ok(!viewEdit(F, "oph", WID, hidden).ok, "숨은 열쇠가 살아 있음");
  });

  test(tag + " — PIN 해제 → 다시 걸기 (K = sha256(wid:) 도 같은 방식)", async () => {
    const { F, k } = fresh({ migrated, pin: "1111" }); const E = await ownerDevice(F, k);
    E.$("#s_pin").value = ""; E.$("#setModal").hidden = false;
    await E.$("#s_pinSave").onclick(); await tick();
    const k0 = sha(WID + ":");
    ok(F.store.has("wishOwner/" + k0), "해제 실패: " + denied(F));
    eq(F.store.get("wishes/" + WID).kh, sha(k0)); eq(F.store.get("wishes/" + WID).locked, false);
    ok(!viewEdit(F, "o1", WID, k).ok, "옛 PIN 열쇠가 통함");
    syncItems(E);
    E.$("#s_pin").value = "3333"; E.$("#setModal").hidden = false;
    await E.$("#s_pinSave").onclick(); await tick();
    eq(F.store.get("wishes/" + WID).kh, sha(sha(WID + ":3333")), "다시 걸기 실패: " + denied(F));
    ok(!viewEdit(F, "o2", WID, k0).ok, "빈 PIN 열쇠가 통함");
  });

  test(tag + " — 리스트를 지운다 (선물 25개, 묶음마다 문서 접근 20 이하)", async () => {
    const ids = Array.from({ length: 25 }, (_, i) => "i" + i);
    const { F, k } = fresh({ migrated, items: ids }); const E = await ownerDevice(F, k);
    await E.$("#s_delete").onclick(); await tick(20);
    eq([...F.store.keys()].filter(x => !x.startsWith("wishOps/")).length, 0, "덜 지워짐: " + denied(F));
    ok(limitOk(F) <= 20);
    ok(E.statuses.some(s => s[1] === "ok"), "성공 안내가 없음");
  });

  test(tag + " — 예시 5개를 한 번에 지운다 (묶음마다 문서 접근 20 이하)", async () => {
    const ids = ["e1", "e2", "e3", "e4", "e5"];
    const { F, k } = fresh({ migrated, items: ids, example: true }); const E = await ownerDevice(F, k);
    await E.$("#exClear").onclick(); await tick(20);
    eq([...F.store.keys()].filter(x => x.startsWith(itemP(""))).length, 0, "안 지워짐: " + denied(F));
    ok(limitOk(F) <= 20);
  });

  test(tag + " — 선물 하나 지우기", async () => {
    const { F, k } = fresh({ migrated }); const E = await ownerDevice(F, k);
    await E.run(`deleteItem(ITEMS.find(x => x.id === "a1"))`); await tick(20);
    ok(!F.store.has(itemP("a1")), "안 지워짐: " + denied(F));
    limitOk(F);
  });

  test(tag + " — 설정 저장(이름 · 제목)은 kh 를 건드리지 않는다", async () => {
    const { F, k } = fresh({ migrated, pin: "1111" }); const E = await ownerDevice(F, k);
    const kh0 = F.store.get("wishes/" + WID).kh;
    E.$("#s_name").value = "새이름"; E.$("#s_heading").value = "새제목"; E.$("#s_sub").value = ""; E.$("#setModal").hidden = false;
    await E.$("#s_save").onclick(); await tick(10);
    eq(F.store.get("wishes/" + WID).name, "새이름", "저장 실패: " + denied(F));
    eq(F.store.get("wishes/" + WID).kh, kh0);
  });
}

test("새 리스트 — 만들기 전 과정이 규칙을 통과하고 kh · wh 가 맞는다", async () => {
  const F = makeDb(); rulesOn(F); const E = load(F);
  E.$("#n_name").value = "새 리스트"; E.$("#n_pin").value = "";
  await E.$("#n_make").onclick(); await tick(450);
  const wid = E.run("WID"), v = E.run("VID");
  ok(wid, "안 만들어짐: " + denied(F));
  eq(F.store.get("wishes/" + wid).kh, sha(sha(wid + ":")));
  eq(F.store.get("wishView/" + v).wh, sha(wid));
  eq(F.store.get("wishView/" + v).order.length, 2, "예시 실패: " + denied(F));
  limitOk(F);
});

test("kh 가 있으면 숨은 열쇠를 더 만들 수 없다 (kh 를 안 바꾸는 열쇠 만들기 거절)", () => {
  const { F, k } = fresh({ pin: "1111" });
  ok(!req(F, [opDoc("o1", WID, k), ["set", "wishOwner/" + sha("숨은"), { wid: WID, v: VID, n: "h".repeat(10), op: "o1" }]]).ok, "숨은 열쇠가 만들어짐");
});

test("옛 문서도 규칙을 올린 뒤엔 kh 를 안 쓰는 열쇠 만들기가 거절된다", () => {
  const { F, k } = fresh({ migrated: false, pin: "1111" });
  ok(!req(F, [opDoc("o1", WID, k), ["set", "wishOwner/" + sha("숨은"), { wid: WID, v: VID, n: "h".repeat(10), op: "o1" }]]).ok);
});

test("주인이라도 kh 를 지울 수 없고, 아무나 kh 를 바꿀 수 없다", () => {
  const { F, k } = fresh({ pin: "1111" });
  ok(!req(F, [opDoc("o1", WID, k), ["set", "wishes/" + WID, { name: "리스트", locked: true, op: "o1" }]]).ok, "kh 가 지워짐");
  ok(!req(F, [["update", "wishes/" + WID, { kh: sha("x") }]]).ok, "op 없이 kh 를 바꿈");
  const wrong = sha(WID + ":0000");
  ok(!req(F, [opDoc("o2", WID, wrong), ["update", "wishes/" + WID, { kh: sha(wrong), op: "o2" }]]).ok, "틀린 열쇠로 kh 를 바꿈");
});

test("규칙 — 새로 만드는 화면 문서는 wh 만 받는다 (wid 를 넣으면 거절)", () => {
  const F = makeDb();
  const v = "n".repeat(24), body = { heading: "제목", subheading: "", order: [], updatedAt: { __sv: 1 } };
  ok(!check(F.store, [["set", "wishView/" + v, Object.assign({ wid: WID }, body)]]).ok, "wid 를 받음");
  ok(!check(F.store, [["set", "wishView/" + v, Object.assign({ wid: WID, wh: WH }, body)]]).ok, "wid + wh 를 받음");
  ok(!check(F.store, [["set", "wishView/" + v, body]]).ok, "wh 없이 받음");
  ok(check(F.store, [["set", "wishView/" + v, Object.assign({ wh: WH }, body)]]).ok, "wh 를 안 받음");
});

test("규칙 — 화면 문서의 wid · wh 는 주인도 못 바꾼다", () => {
  const { F, k } = fresh();
  ok(!req(F, [opDoc("o1", WID, k), ["update", "wishView/" + VID, { wh: sha("x"), op: "o1" }]]).ok, "wh 가 바뀜");
  ok(!req(F, [opDoc("o2", WID, k), ["update", "wishView/" + VID, { wid: WID, op: "o2" }]]).ok, "wid 가 다시 들어감");
});

test("규칙 — 이미 쓴 확인표는 다시 못 쓴다", () => {
  const { F, k } = fresh();
  F.store.set("wishOps/used", { wid: WID, k });
  ok(!req(F, [["update", "wishView/" + VID, { heading: "재사용", op: "used" }]]).ok, "쓴 확인표가 통함");
});

test("kh 없는 옛 문서에 kh 가 생기면 그때부터 kh 로만 본다", () => {
  const { F, k } = fresh({ migrated: false, pin: "1111" });
  const hidden = sha("숨은");
  F.store.set("wishOwner/" + hidden, { wid: WID, v: VID, n: "h".repeat(10) });
  ok(viewEdit(F, "o1", WID, hidden).ok, "옮기기 전엔 지금처럼");
  F.store.set("wishes/" + WID, Object.assign({}, F.store.get("wishes/" + WID), { kh: sha(k) }));
  ok(!viewEdit(F, "o2", WID, hidden).ok, "kh 뒤에도 숨은 열쇠가 통함");
  ok(viewEdit(F, "o3", WID, k).ok, "진짜 열쇠가 막힘");
});

test("숨은 열쇠로 저장을 시도한 기기는 '다시 들어와 주세요' 로 돌아간다", async () => {
  const { F } = fresh({ pin: "1111" });
  const hidden = sha("숨은");
  F.store.set("wishOwner/" + hidden, { wid: WID, v: VID, n: "h".repeat(10) });
  const E = load(F);
  E.ctx.__K = hidden; E.ctx.__W = WID; E.ctx.__V = VID;
  E.run("WID = __W; VID = __V; KEY = __K;");
  E.run("openItem(null)"); E.$("#i_name").value = "모자";
  await E.$("#i_save").onclick(); await tick(10);
  ok(E.statuses.some(s => /다시 들어와/.test(s[0])), JSON.stringify(E.statuses));
  eq(E.ls["wt_key:" + WID], undefined, "열쇠가 남음");
});

main();
