/* 규칙 흉내 — benny-apps/firestore.rules 의 '위시태그' 절을 손으로 옮긴 것 (실제 컴파일은 배포 때).
   규칙을 고치면 여기도 같이 고친다 (t_rules.py 가 규칙 글자와 맞는지 조금 본다).

   get/exists 는 요청 전, getAfter/existsAfter 는 요청 뒤 상태를 본다 (실제 규칙과 같음).
   문서 접근은 캐시가 없다고 치고 한 번 부를 때마다 센다 — 가장 나쁜 경우로 한도(작업 하나 10 · 묶음 20)를 본다.
   규칙 안의 오류(없는 문서의 data 등)는 거절로 친다. */
const { createHash } = require("crypto");

class Deny extends Error {}
const hex = s => { if (typeof s !== "string") throw new Deny("문자열이 아님"); return createHash("sha256").update(s, "utf8").digest("hex"); };
const str = (v, n) => typeof v === "string" && v.length <= n;
const hasOnly = (d, keys) => Object.keys(d).every(k => keys.includes(k));
const OR = (d, k, dflt) => (d && d[k] !== undefined ? d[k] : dflt);
const tsOrNull = v => v == null || typeof v === "object";
const isInt = v => Number.isInteger(v);

function applied(store, ops){
  const m = new Map(store);
  for (const [op, p, d] of ops){
    if (op === "delete") m.delete(p);
    else if (op === "set") m.set(p, d);
    else m.set(p, Object.assign({}, m.get(p) || {}, d));
  }
  return m;
}

/** ops = [["set"|"update"|"delete", 경로, 값], …] → { ok, why, count, perOp } */
function check(store, ops){
  const after = applied(store, ops);
  let total = 0;
  const perOp = [];
  for (const [op, p, d] of ops){
    let n = 0;
    const C = {
      exists: q => { n++; return store.has(q); },
      existsAfter: q => { n++; return after.has(q); },
      get: q => { n++; if (!store.has(q)) throw new Deny("없는 문서 get " + q); return store.get(q); },
      getAfter: q => { n++; if (!after.has(q)) throw new Deny("없는 문서 getAfter " + q); return after.get(q); }
    };
    const res = store.get(p);
    if (op === "update" && res === undefined) return { ok: false, why: "없는 문서 update " + p, count: total, perOp };
    const method = op === "delete" ? "delete" : (res === undefined ? "create" : "update");
    const req = op === "delete" ? undefined : after.get(p);
    let allowed = false, why = "";
    try { allowed = !!evalRule(C, method, p, req, res); } catch(e){ if (!(e instanceof Deny)) throw e; why = e.message; }
    if (!allowed) return { ok: false, why: method + " " + p.split("/")[0] + " 거절 " + why, count: total, perOp };
    if (n > 10) return { ok: false, why: "작업 하나의 문서 접근 " + n + " > 10", count: total, perOp };
    total += n; perOp.push(n);
  }
  if (ops.length > 1 && total > 20) return { ok: false, why: "묶음 문서 접근 " + total + " > 20", count: total, perOp };
  if (ops.length === 1 && total > 10) return { ok: false, why: "문서 접근 " + total + " > 10", count: total, perOp };
  return { ok: true, why: "", count: total, perOp };
}

function evalRule(C, method, p, d, res){
  const seg = p.split("/");
  const OP = id => "wishOps/" + id;

  const opFresh = op => typeof op === "string" && op.length > 0 && op.length <= 120 && !C.exists(OP(op)) && C.existsAfter(OP(op));
  const opOk = (wid, op) => opFresh(op) && C.getAfter(OP(op)).wid === wid;
  const opOkView = (view, op) => opFresh(op) && (
    hex(C.getAfter(OP(op)).wid) === OR(view, "wh", "") ||
    C.getAfter(OP(op)).wid === OR(view, "wid", null));
  const viewData = v => C.get("wishView/" + v);
  const wishKeyOk = (wid, k, kh) =>
    (kh !== "" && hex(k) === kh) ||
    (kh === "" && C.get("wishOwner/" + k).wid === wid);

  /* wishes/{wid} */
  if (seg[0] === "wishes" && seg.length === 2){
    const wid = seg[1];
    if (method === "create")
      return hasOnly(d, ["name", "locked", "kh", "createdAt", "updatedAt"])
        && str(d.name, 20) && d.name.length > 0 && typeof d.locked === "boolean"
        && typeof d.kh === "string" && d.kh.length === 64;
    if (method === "update"){
      const kh = OR(d, "kh", "");
      return hasOnly(d, ["name", "locked", "kh", "createdAt", "updatedAt", "op"])
        && str(d.name, 20) && d.name.length > 0 && typeof d.locked === "boolean"
        && typeof kh === "string" && (kh.length === 64 || (kh === "" && OR(res, "kh", "") === ""))
        && opOk(wid, d.op);
    }
    return opOk(wid, "xw_" + wid);
  }

  /* wishOwner/{k} */
  if (seg[0] === "wishOwner" && seg.length === 2){
    const k = seg[1];
    const wishOwnerOk = () => hasOnly(d, ["wid", "v", "n", "op"])
      && typeof d.wid === "string" && typeof d.v === "string" && d.v.length >= 16
      && typeof d.n === "string" && d.n.length >= 6 && d.n.length <= 20
      && ( (!C.exists("wishes/" + d.wid) && C.existsAfter("wishes/" + d.wid)) || opOk(d.wid, OR(d, "op", "")) )
      && OR(C.getAfter("wishes/" + d.wid), "kh", "") === hex(k);
    if (method === "update") return d.wid === res.wid && wishOwnerOk();
    if (method === "create") return wishOwnerOk();
    return opOk(res.wid, "xo_" + k + "_" + res.n);
  }

  /* wishOps/{op} */
  if (seg[0] === "wishOps" && seg.length === 2){
    if (method !== "create") return false;
    return hasOnly(d, ["wid", "k", "at"])
      && typeof d.wid === "string" && typeof d.k === "string" && d.k.length === 64
      && wishKeyOk(d.wid, d.k, C.exists("wishes/" + d.wid) ? OR(C.get("wishes/" + d.wid), "kh", "") : "");
  }

  /* wishView/{v} */
  if (seg[0] === "wishView" && seg.length === 2){
    const v = seg[1];
    const shape = x => str(x.heading, 40) && str(x.subheading, 1000) && Array.isArray(x.order) && x.order.length <= 100;
    if (method === "create")
      return hasOnly(d, ["wh", "heading", "subheading", "order", "updatedAt"])
        && v.length >= 16 && typeof d.wh === "string" && d.wh.length === 64 && shape(d);
    if (method === "update")
      return hasOnly(d, ["wid", "wh", "heading", "subheading", "order", "updatedAt", "op"])
        && OR(d, "wid", null) === OR(res, "wid", null) && OR(d, "wh", null) === OR(res, "wh", null)
        && shape(d) && opOkView(res, d.op);
    return opOkView(res, "xv_" + v);
  }

  /* wishView/{v}/items/{iid} */
  if (seg[0] === "wishView" && seg.length === 4 && seg[2] === "items"){
    const v = seg[1], iid = seg[3];
    const valid = x => hasOnly(x, ["name", "note", "link", "claimedBy", "claimedAt", "claimCheck", "unclaim", "example", "op", "createdAt"])
      && str(x.name, 60) && x.name.length > 0 && str(OR(x, "note", ""), 200) && str(OR(x, "link", ""), 600)
      && str(OR(x, "claimedBy", ""), 12) && isInt(OR(x, "claimedAt", 0))
      && str(OR(x, "claimCheck", ""), 64) && str(OR(x, "unclaim", ""), 64)
      && typeof OR(x, "example", false) === "boolean" && str(OR(x, "op", ""), 120) && tsOrNull(OR(x, "createdAt", null));
    const CLAIM = ["claimedBy", "claimedAt", "claimCheck", "unclaim"];
    const onlyClaim = () => [...new Set([...Object.keys(d), ...Object.keys(res)])]
      .filter(k => JSON.stringify(d[k]) !== JSON.stringify(res[k])).every(k => CLAIM.includes(k));
    if (method === "create") return valid(d) && opOkView(viewData(v), d.op);
    if (method === "update"){
      if (!valid(d)) return false;
      if (opOkView(viewData(v), OR(d, "op", ""))) return true;
      if (onlyClaim() && OR(res, "claimedBy", "") === "" && d.claimedBy.length > 0 && d.claimCheck.length === 64) return true;
      if (onlyClaim() && OR(res, "claimedBy", "") !== "" && d.claimedBy === "" && d.claimCheck === "" && hex(d.unclaim) === res.claimCheck) return true;
      return false;
    }
    return opOkView(viewData(v), "xi_" + v + "_" + iid);
  }
  return false;
}

/** 저장소에 규칙을 건다 — 거절은 permission-denied. E.F.hooks.ruleLog 에 묶음마다 문서 접근 수가 쌓인다 */
function rulesOn(F){
  F.hooks.ruleLog = [];
  F.hooks.rules = ops => {
    const r = check(F.store, ops);
    F.hooks.ruleLog.push({ size: ops.length, count: r.count, ok: r.ok, why: r.why });
    return r;
  };
}

module.exports = { check, rulesOn, Deny };
