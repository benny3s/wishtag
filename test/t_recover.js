/* 주인이 돌아오는 길 — ?v= 만 쓰면 새 기기에서 wid 를 알 길이 없으니 주인 링크(?w=)를 따로 준다.
   같은 PIN 의 열쇠 문서가 남아 있을 때 · wishes 가 없을 때의 규칙, 새 리스트 직후 설정, 죽은 열쇠 안내 */
const fs = require("fs"), path = require("path");
const { makeDb, load, sha, tick, test, main, eq, ok, WID, VID } = require("./env.js");
const { rulesOn, check } = require("./rules_sim.js");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const WH = sha(WID), itemP = id => "wishView/" + VID + "/items/" + id;
function seed(F, opt){
  opt = opt || {};
  const pin = opt.pin || "", k = sha(WID + ":" + pin), m = opt.migrated !== false;
  F.store.set("wishes/" + WID, Object.assign({ name: "리스트", locked: !!pin }, m ? { kh: sha(k) } : {}));
  F.store.set("wishOwner/" + k, { wid: WID, v: VID, n: "n".repeat(10) });
  F.store.set("wishView/" + VID, Object.assign(m ? { wh: WH } : { wid: WID }, { heading: "제목", subheading: "", order: ["a1"] }));
  F.store.set(itemP("a1"), { name: "a1", note: "", link: "", claimedBy: "", claimedAt: 0, claimCheck: "", unclaim: "", example: false, op: "olda1" });
  return k;
}
function device(F, ls){ const E = load(F); Object.assign(E.ls, ls || {}); F.hooks.live = true; return E; }
const owned = k => ({ ["wt_key:" + WID]: k, wt_mine: JSON.stringify([WID]) });
const lastUrl = E => E.urls[E.urls.length - 1] || "";
const opDoc = (op, wid, k) => ["set", "wishOps/" + op, { wid, k, at: { __sv: 1 } }];
const denied = F => F.hooks.ruleLog.filter(r => !r.ok).slice(0, 2).map(r => r.why).join(" / ");
const DEAD = /주인 열쇠가 바뀌었어요/;

/* ── 1. 주인 링크 ── */
test("설정 창에 주인 링크 버튼과 '나만 보관' 안내가 있다", () => {
  const m = html.match(/<div class="modal" id="setModal"[\s\S]*?<\/div>\s*<\/div>\s*<script/);
  ok(m, "설정 창을 못 찾음");
  ok(/id="s_ownerLink"/.test(m[0]), "버튼이 없음");
  ok(/주인 링크 복사/.test(m[0]), "버튼 글자");
  ok(/나만 보관/.test(m[0]) && /PIN/.test(m[0]) && /공유 버튼/.test(m[0]), "안내 문구");
});

test("주인 링크 복사 — ?w=wid 를 복사하고 열쇠 · PIN 은 없다", async () => {
  const F = makeDb(), k = seed(F, { pin: "1111" }), E = device(F, owned(k));
  await E.run(`openOwner("${WID}")`); await tick();
  let copied = ""; E.ctx.navigator.clipboard = { writeText: async t => { copied = t; } };
  ok(E.$("#s_ownerLink").onclick, "버튼 동작이 없음");
  await E.$("#s_ownerLink").onclick();
  ok(copied.endsWith("?w=" + WID), "복사한 것: " + copied);
  ok(!copied.includes(k) && !copied.includes("1111"), "열쇠나 PIN 이 들어감");
  ok(E.statuses.some(s => /나만 보관/.test(s[0])), "안내: " + JSON.stringify(E.statuses));
});

test("주인 링크 — 복사가 막힌 브라우저는 글로 보여 준다", async () => {
  const F = makeDb(), k = seed(F), E = device(F, owned(k));
  await E.run(`openOwner("${WID}")`); await tick();
  E.ctx.navigator.clipboard = { writeText: async () => { throw new Error("막힘"); } };
  let shown = null; E.ctx.askText = o => { shown = o; };
  ok(E.$("#s_ownerLink").onclick, "버튼 동작이 없음");
  await E.$("#s_ownerLink").onclick();
  ok(shown && shown.value.endsWith("?w=" + WID), "글로 안 보여 줌");
});

test("공유 버튼은 그대로 ?v= 만 복사한다 (주인 링크와 섞이지 않음)", async () => {
  const F = makeDb(), k = seed(F), E = device(F, owned(k));
  await E.run(`openOwner("${WID}")`); await tick();
  let line = ""; E.ctx.shareLine = t => { line = t; };
  E.$("#shareBtn").onclick();
  ok(line.includes("?v=" + VID) && !line.includes(WID), line);
});

test("주인 링크 → 새 기기 → PIN → 주인이 되고 주소는 ?v= 로 바뀐다", async () => {
  const F = makeDb(), k = seed(F, { pin: "1111" }), E = device(F);
  await E.run(`openOwner("${WID}")`); await tick();
  eq(E.$("#view-lock").hidden, false, "PIN 을 안 물음");
  await E.run(`openOwner("${WID}", "1111")`); await tick();
  eq(E.run("KEY"), k);
  ok(lastUrl(E).endsWith("?v=" + VID), lastUrl(E));
});

test("이 기기 목록에서 지울 때 — 다시 들어가려면 주인 링크가 필요하다고 알린다", async () => {
  const F = makeDb(), k = seed(F), E = device(F, owned(k));
  await E.run(`mineForget("${WID}")`); await tick();
  ok(E.asks.some(a => /주인 링크/.test(a.text || "")), JSON.stringify(E.asks));
});

test("새 리스트 직후 — 창을 새로 띄우지 않고 상태 알림으로 주인 링크를 알린다", async () => {
  const F = makeDb(), E = load(F); rulesOn(F);
  const opened = []; const om = E.ctx.openModal; E.ctx.openModal = id => { opened.push(id); om(id); };
  E.$("#n_name").value = "새 리스트"; E.$("#n_pin").value = "4321"; E.$("#newModal").hidden = false;
  await E.$("#n_make").onclick(); await tick(450);
  ok(E.statuses.some(s => /주인 링크/.test(s[0])), JSON.stringify(E.statuses));
  eq(opened, [], "창이 떴음");
});

test("새 리스트 직후 — 예시를 못 넣어도 주인 링크는 알린다", async () => {
  const F = makeDb(), E = load(F);
  F.hooks.failCommit = ops => ops.some(o => o[0] === "set" && /^wishOps\//.test(o[1]));
  E.$("#n_name").value = "새 리스트"; E.$("#n_pin").value = "";
  await E.$("#n_make").onclick(); await tick(450);
  ok(E.statuses.some(s => /주인 링크/.test(s[0])), JSON.stringify(E.statuses));
});

/* ── 4. 새 리스트 직후 설정 · 지우기 ── */
test("새 리스트 직후 — 리스트 정보를 받아, 설정이 PIN 을 '걸려 있음' 으로 보이고 지우기가 된다", async () => {
  const F = makeDb(), E = load(F); rulesOn(F); F.hooks.live = true;
  E.$("#n_name").value = "새 리스트"; E.$("#n_pin").value = "4321";
  await E.$("#n_make").onclick(); await tick(450);
  const wid = E.run("WID"), v = E.run("VID");
  ok(wid, "안 만들어짐: " + denied(F));
  eq(E.run(`!!listOf("${wid}")`), true, "리스트 정보를 안 받음");
  eq(E.$("#pickName").textContent, "🔒 새 리스트");
  E.run(`openModal("setModal")`);
  ok(/걸려 있어요/.test(E.$("#s_pinLbl").textContent), E.$("#s_pinLbl").textContent);
  await E.$("#s_delete").onclick(); await tick(20);
  eq(F.store.has("wishes/" + wid), false, "지우기가 반응 없이 끝남: " + denied(F));
  eq(F.store.has("wishView/" + v), false);
});

/* ── 5. 죽은 열쇠 ── */
test("다른 기기에서 PIN 이 바뀐 주인이 ?v= 로 열면 — 열쇠를 지우고 한 번 알리고, 다음엔 안 알린다", async () => {
  const F = makeDb(); seed(F, { pin: "2222" });
  const dead = sha(WID + ":1111"), E = device(F, owned(dead));
  await E.run(`openView("${VID}")`); await tick();
  eq(E.run("KEY"), ""); eq(E.$("#view-list").hidden, false, "친구 화면이 안 뜸");
  eq(E.ls["wt_key:" + WID], undefined, "죽은 열쇠가 남음");
  eq(E.statuses.filter(s => DEAD.test(s[0])).length, 1, JSON.stringify(E.statuses));
  ok(E.statuses.some(s => /주인 링크/.test(s[0])), "주인 링크 안내");
  E.statuses.length = 0;
  await E.run(`openView("${VID}")`); await tick();
  eq(E.statuses.filter(s => DEAD.test(s[0])).length, 0, "또 알림");
});

test("옛 문서에서도 죽은 열쇠를 지우고 알린다", async () => {
  const F = makeDb(); seed(F, { pin: "2222", migrated: false });
  const E = device(F, owned(sha(WID + ":1111")));
  await E.run(`openView("${VID}")`); await tick();
  eq(E.ls["wt_key:" + WID], undefined);
  ok(E.statuses.some(s => DEAD.test(s[0])), JSON.stringify(E.statuses));
});

test("친구에게는 안 뜬다 — 새 기기 · 목록에만 있는 기기", async () => {
  const F = makeDb(); seed(F, { pin: "2222" });
  for (const ls of [{}, { wt_mine: JSON.stringify([WID]) }, { wt_mine: JSON.stringify(["다른것"]), ["wt_key:다른것"]: sha("x") }]){
    const E = device(F, ls);
    await E.run(`openView("${VID}")`); await tick();
    eq(E.statuses.filter(s => DEAD.test(s[0])).length, 0, "친구에게 뜸 " + JSON.stringify(ls));
  }
});

test("살아 있는 열쇠로는 안 뜨고 주인으로 열린다", async () => {
  const F = makeDb(), k = seed(F, { pin: "2222" }), E = device(F, owned(k));
  await E.run(`openView("${VID}")`); await tick();
  eq(E.run("KEY"), k); eq(E.statuses.filter(s => DEAD.test(s[0])).length, 0);
});

test("네트워크로 열쇠를 못 읽었을 때는 열쇠를 지우지 않고 안 알린다", async () => {
  const F = makeDb(), k = seed(F, { pin: "2222" }), E = device(F, owned(k));
  F.hooks.failGetPath = p => p.startsWith("wishOwner/");
  await E.run(`openView("${VID}")`); await tick();
  eq(E.ls["wt_key:" + WID], k, "열쇠를 지움");
  eq(E.statuses.filter(s => DEAD.test(s[0])).length, 0);
});

test("가짜 화면(v 다름)을 열어도 살아 있는 열쇠를 지우지 않는다", async () => {
  const F = makeDb(), k = seed(F), E = device(F, owned(k));
  const fake = "f".repeat(24);
  F.store.set("wishView/" + fake, { wh: WH, heading: "가짜", subheading: "", order: [] });
  await E.run(`openView("${fake}")`); await tick();
  eq(E.run("KEY"), ""); eq(E.ls["wt_key:" + WID], k, "열쇠를 지움");
  eq(E.statuses.filter(s => DEAD.test(s[0])).length, 0);
});

/* ── 2. 같은 PIN 의 열쇠 문서가 남아 있을 때 ── */
for (const migrated of [true, false]){
  const tag = migrated ? "옮긴 문서" : "옛 문서";
  test(tag + " — 같은 PIN 의 열쇠 문서가 남아 있어도 PIN 을 바꿀 수 있다 (set 은 update 로 평가됨)", async () => {
    const F = makeDb(), k = seed(F, { pin: "1111", migrated }); rulesOn(F);
    const k2 = sha(WID + ":2222");
    F.store.set("wishOwner/" + k2, { wid: WID, v: VID, n: "o".repeat(10) });          // 전에 남은 문서
    const E = device(F, owned(k));
    await E.run(`openOwner("${WID}")`); await tick();
    eq(E.run("KEY"), k, "주인으로 못 들어감");
    E.$("#s_pin").value = "2222"; E.$("#setModal").hidden = false;
    await E.$("#s_pinSave").onclick(); await tick();
    eq(F.store.get("wishes/" + WID).kh, sha(k2), "거절됨: " + denied(F));
    eq(E.run("KEY"), k2);
    ok(!F.store.has("wishOwner/" + k), "옛 열쇠가 남음");
    ok(F.store.get("wishOwner/" + k2).n !== "o".repeat(10), "n 이 새것이 아님 — 옛 xo_ 와 겹칠 수 있음");
  });
}

test("열쇠 문서 update — wid 는 못 바꾼다", () => {
  const F = makeDb(), k = seed(F, { pin: "1111" });
  const A = "a".repeat(12), KA = sha(A + ":");
  F.store.set("wishes/" + A, { name: "남", locked: false, kh: sha(KA) });
  F.store.set("wishOwner/" + KA, { wid: A, v: "x".repeat(24), n: "n".repeat(10) });
  /* 내 리스트(A)의 주인이 남의 열쇠 문서를 내 것으로 */
  const r = check(F.store, [opDoc("o1", A, KA),
    ["set", "wishOwner/" + k, { wid: A, v: "x".repeat(24), n: "z".repeat(10), op: "o1" }],
    ["update", "wishes/" + A, { kh: sha(k), op: "o1" }]]);
  ok(!r.ok, "wid 가 바뀜");
});

test("열쇠 문서 update — 주인 확인이 없거나 kh 가 안 맞으면 거절", () => {
  const F = makeDb(), k = seed(F, { pin: "1111" });
  const K2 = sha(WID + ":2222");
  F.store.set("wishOwner/" + K2, { wid: WID, v: VID, n: "o".repeat(10) });
  ok(!check(F.store, [["set", "wishOwner/" + K2, { wid: WID, v: VID, n: "z".repeat(10) }]]).ok, "확인 없이 update");
  ok(!check(F.store, [opDoc("o1", WID, k), ["set", "wishOwner/" + K2, { wid: WID, v: VID, n: "z".repeat(10), op: "o1" }]]).ok, "kh 를 안 바꾸는 update");
  ok(!check(F.store, [opDoc("o2", WID, K2), ["set", "wishOwner/" + K2, { wid: WID, v: VID, n: "z".repeat(10), op: "o2" }], ["update", "wishes/" + WID, { kh: sha(K2), op: "o2" }]]).ok, "죽은 열쇠로 되살리기");
});

test("열쇠 문서 update 의 정상 경로는 통과한다 (규칙 흉내에서)", () => {
  const F = makeDb(), k = seed(F, { pin: "1111" });
  const K2 = sha(WID + ":2222");
  F.store.set("wishOwner/" + K2, { wid: WID, v: VID, n: "o".repeat(10) });
  const r = check(F.store, [opDoc("o1", WID, k), ["set", "wishOwner/" + K2, { wid: WID, v: VID, n: "z".repeat(10), op: "o1" }], ["update", "wishes/" + WID, { kh: sha(K2), op: "o1" }]]);
  ok(r.ok, r.why);
});

/* ── 3. wishes 가 없을 때 wishOps ── */
test("wishes 가 없으면 kh 없는 옛 문서처럼 — 진짜 열쇠 문서가 있을 때만 확인표가 만들어진다", () => {
  const F = makeDb(), k = sha(WID + ":");
  F.store.set("wishOwner/" + k, { wid: WID, v: VID, n: "n".repeat(10) });
  ok(check(F.store, [opDoc("o1", WID, k)]).ok, "열쇠가 있는데 거절");
});

test("wishes 가 없어도 권한이 넓어지지 않는다 — 없는 열쇠 · 남의 열쇠는 거절", () => {
  const F = makeDb(), k = sha(WID + ":");
  F.store.set("wishOwner/" + k, { wid: WID, v: VID, n: "n".repeat(10) });
  ok(!check(F.store, [opDoc("o1", WID, sha("없는 열쇠"))]).ok, "없는 열쇠");
  const A = "a".repeat(12), KA = sha(A + ":");
  F.store.set("wishes/" + A, { name: "남", locked: false, kh: sha(KA) });
  F.store.set("wishOwner/" + KA, { wid: A, v: "x".repeat(24), n: "n".repeat(10) });
  ok(!check(F.store, [opDoc("o2", WID, KA)]).ok, "남의 열쇠로 없는 리스트의 확인표");
  ok(!check(F.store, [opDoc("o3", "없는리스트wid", k)]).ok, "다른 wid 의 확인표");
});

test("wishes 가 있으면 kh 로만 — 없는 경로로 빠져 숨은 열쇠가 통하지 않는다", () => {
  const F = makeDb(); seed(F, { pin: "1111" });
  const hidden = sha("숨은");
  F.store.set("wishOwner/" + hidden, { wid: WID, v: VID, n: "h".repeat(10) });
  ok(!check(F.store, [opDoc("o1", WID, hidden)]).ok, "숨은 열쇠가 통함");
});

test("리스트를 지운 뒤 남은 숨은 열쇠로는 다른 리스트도, 지워진 리스트의 화면도 못 고친다", () => {
  const F = makeDb(); seed(F, { pin: "1111" });
  const hidden = sha("숨은");
  F.store.set("wishOwner/" + hidden, { wid: WID, v: VID, n: "h".repeat(10) });
  F.store.delete("wishes/" + WID); F.store.delete("wishView/" + VID); F.store.delete(itemP("a1"));   // 지우기는 화면 · 리스트를 한 batch 로 지운다
  const A = "a".repeat(12), V2 = "x".repeat(24), KA = sha(A + ":");
  F.store.set("wishes/" + A, { name: "남", locked: false, kh: sha(KA) });
  F.store.set("wishView/" + V2, { wh: sha(A), heading: "남", subheading: "", order: [] });
  ok(!check(F.store, [opDoc("o1", WID, hidden), ["update", "wishView/" + V2, { heading: "장난", op: "o1" }]]).ok, "다른 리스트를 고침");
  ok(!check(F.store, [opDoc("o2", A, hidden), ["update", "wishView/" + V2, { heading: "장난", op: "o2" }]]).ok, "다른 리스트의 확인표");
});

test("묶음 한도 — wishes 있는지 먼저 봐도 옛 문서 리스트 지우기 마지막 묶음이 20 이하다", async () => {
  const F = makeDb(), k = seed(F, { migrated: false }); rulesOn(F);
  const E = device(F, owned(k));
  await E.run(`openOwner("${WID}")`); await tick();
  await E.$("#s_delete").onclick(); await tick(20);
  eq(F.store.has("wishes/" + WID), false, "덜 지워짐: " + denied(F));
  ok(Math.max(...F.hooks.ruleLog.map(r => r.count)) <= 20);
});

main();
