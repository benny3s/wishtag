/* 개인 PIN — 선점·취소 확인값. 남은 unclaim 으로 남의 선점을 못 취소하고, 옛 선점도 같은 PIN 으로 취소된다 */
const { load, setup, syncItems, friendRules, itemPath, sha, tick, test, main, eq, ok, VID } = require("./env.js");

function fresh(items){
  const E = load(); setup(E, items); friendRules(E); return E;
}
const doc = (E, id) => E.F.store.get(itemPath(id));
async function claim(E, id, nick, pin){
  syncItems(E);
  const it = E.ctx.__I.find(x => x.id === id);
  E.run("openClaim(__I.find(x => x.id === '" + id + "'), 'claim', '')");
  E.$("#cl_nick").value = nick; E.$("#cl_pin").value = pin;
  await E.$("#cl_go").onclick(); syncItems(E);
}
async function cancel(E, id, pin){
  syncItems(E);
  E.run("openClaim(__I.find(x => x.id === '" + id + "'), 'unclaim')");
  E.$("#cl_pin").value = pin;
  await E.$("#cl_go").onclick(); syncItems(E);
}
const two = [{ id: "a1", name: "목도리" }, { id: "b2", name: "책" }];

test("같은 PIN 으로 두 선물을 선점해도 확인값(claimCheck)이 서로 다르다", async () => {
  const E = fresh(two);
  await claim(E, "a1", "민", "1234"); await tick(3); await claim(E, "b2", "민", "1234");
  ok(doc(E, "a1").claimedBy && doc(E, "b2").claimedBy, "선점이 안 됨");
  ok(doc(E, "a1").claimCheck !== doc(E, "b2").claimCheck, "확인값이 같음");
  ok(doc(E, "a1").claimCheck !== sha(sha("1234")), "소금 없는 sha256 두 번 그대로");
});

test("취소 때 남은 unclaim 으로, 같은 PIN 의 다른 선점을 남이 취소할 수 없다", async () => {
  const E = fresh(two);
  await claim(E, "a1", "민", "1234");
  await cancel(E, "a1", "1234");
  eq(doc(E, "a1").claimedBy, "", "취소가 안 됨");
  const leftover = doc(E, "a1").unclaim;
  ok(leftover, "남은 값이 없으면 이 시험은 뜻이 없다");
  await tick(3); await claim(E, "b2", "민", "1234");
  ok(doc(E, "b2").claimedBy === "민", "다시 선점이 안 됨");
  let rejected = false;
  try { await E.ctx.db.collection("wishView/" + VID + "/items").doc("b2").update({ claimedBy: "", claimedAt: 0, claimCheck: "", unclaim: leftover }); }
  catch(e){ rejected = e.code === "permission-denied"; }
  ok(rejected, "남은 unclaim 으로 남이 취소해 버림");
  eq(doc(E, "b2").claimedBy, "민");
});

test("취소했던 선물을 같은 PIN 으로 다시 선점해도, 그 전에 남은 unclaim 으로는 취소할 수 없다", async () => {
  const E = fresh(two);
  await claim(E, "a1", "민", "1234");
  await cancel(E, "a1", "1234");
  const leftover = doc(E, "a1").unclaim;
  await tick(3); await claim(E, "a1", "민", "1234");
  eq(doc(E, "a1").claimedBy, "민");
  let rejected = false;
  try { await E.ctx.db.collection("wishView/" + VID + "/items").doc("a1").update({ claimedBy: "", claimedAt: 0, claimCheck: "", unclaim: leftover }); }
  catch(e){ rejected = e.code === "permission-denied"; }
  ok(rejected, "옛 unclaim 으로 취소됨");
});

test("선점 → 맞는 PIN 으로 취소가 된다", async () => {
  const E = fresh(two);
  await claim(E, "a1", "민", "pass12");
  await cancel(E, "a1", "pass12");
  eq([doc(E, "a1").claimedBy, doc(E, "a1").claimCheck], ["", ""]);
});

test("틀린 PIN 으로는 취소되지 않는다", async () => {
  const E = fresh(two);
  await claim(E, "a1", "민", "pass12");
  await cancel(E, "a1", "pass13");
  eq(doc(E, "a1").claimedBy, "민");
  ok(E.$("#clMsg").textContent.includes("PIN"), "안내가 없음: " + E.$("#clMsg").textContent);
});

test("옛 방식으로 선점된 선물(claimCheck = sha256(sha256(PIN)))도 같은 PIN 으로 취소된다", async () => {
  const old = sha(sha("1234"));
  const E = fresh([{ id: "o1", name: "옛 선물", claimedBy: "옛친구", claimedAt: 1760000000000, claimCheck: old, unclaim: "" }]);
  await cancel(E, "o1", "1234");
  eq([doc(E, "o1").claimedBy, doc(E, "o1").claimCheck], ["", ""]);
});

test("옛 방식 선점은 틀린 PIN 으로 취소되지 않는다", async () => {
  const old = sha(sha("1234"));
  const E = fresh([{ id: "o1", name: "옛 선물", claimedBy: "옛친구", claimedAt: 1760000000000, claimCheck: old, unclaim: "" }]);
  await cancel(E, "o1", "9999");
  eq(doc(E, "o1").claimedBy, "옛친구"); eq(doc(E, "o1").claimCheck, old);
});

test("새 방식으로 선점할 때 unclaim 은 비워서 보낸다", async () => {
  const E = fresh(two);
  await claim(E, "a1", "민", "1234");
  eq(doc(E, "a1").unclaim, "");
  eq(doc(E, "a1").claimCheck.length, 64);
});

main();
