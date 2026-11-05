/* 시험용 환경 — index.html 의 본 스크립트를 node vm 에 올리고 화면·저장소는 가짜(stub)로 바꾼다.
   core.js 는 읽지 않고 쓰는 함수만 흉내 낸다. 실서버·브라우저에 닿지 않는다. */
const fs = require("fs"), path = require("path"), vm = require("vm");

function mainScript(src){
  const html = src || fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const i = html.indexOf("<script>/* 위시태그");
  const j = html.indexOf("</script>", i);
  return html.slice(i + "<script>".length, j);
}

/* ── 가짜 화면 요소 ── */
function fakeEl(tag){
  const e = {
    tag, value: "", hidden: true, textContent: "", disabled: false, open: false, className: "", title: "", type: "",
    children: [], style: {}, attrs: {}, onclick: null,
    classList: { toggle(){}, add(){}, remove(){} },
    set innerHTML(v){ this.children = []; }, get innerHTML(){ return ""; },
    appendChild(c){ this.children.push(c); return c; },
    append(...cs){ cs.forEach(c => this.children.push(c)); },
    setAttribute(k, v){ this.attrs[k] = v; },
    addEventListener(){}, focus(){}, closest(){ return null; },
    get firstChild(){ return this.children[0] || fakeEl("x"); }
  };
  return e;
}
/** 요소 트리에서 글자가 맞는 버튼들 */
function findButtons(root, text){
  const out = [];
  (function walk(n){ if (!n || typeof n !== "object") return; if (n.tag === "button" && String(n.textContent).includes(text)) out.push(n); (n.children || []).forEach(walk); })(root);
  return out;
}
/** 요소 트리의 글자 전부 */
function allText(root){
  const out = [];
  (function walk(n){ if (n == null) return; if (typeof n !== "object"){ out.push(String(n)); return; } if (n.textContent) out.push(String(n.textContent)); (n.children || []).forEach(walk); })(root);
  return out.join(" | ");
}

/* ── 가짜 Firestore — 문서 경로 → 값. 트랜잭션은 읽은 문서가 그사이 바뀌면 다시 돈다 ── */
const SV = { __sv: "serverTimestamp" };
function makeDb(){
  const store = new Map(), ver = new Map();
  let seq = 0;
  /* offline → 쓰기는 기기에 쌓이고 서버 답은 끝내 안 옴 · hold(Promise) → 묶음 저장이 그 약속이 풀릴 때까지 기다림 */
  /* rules(ops) → { ok } : rules_sim 을 걸면 요청 전체를 규칙으로 본다 · live → 구독하면 지금 값을 한 번 준다 */
  const hooks = { failCommit: null, failGet: null, failWrite: null, offline: false, hold: null, writes: [], rules: null, live: false };
  const ruleGate = ops => { if (hooks.rules && !hooks.rules(ops).ok) throw Object.assign(new Error("규칙 거절"), { code: "permission-denied" }); };
  const bump = p => ver.set(p, (ver.get(p) || 0) + 1);
  function applyUpdate(cur, data){
    const o = JSON.parse(JSON.stringify(cur));
    for (const k in data){
      const v = data[k];
      if (v && v.__union){ const a = Array.isArray(o[k]) ? o[k] : []; v.__union.forEach(x => { if (!a.some(y => JSON.stringify(y) === JSON.stringify(x))) a.push(x); }); o[k] = a; continue; }
      if (k.includes(".")){ const [a, b] = k.split("."); o[a] = Object.assign({}, o[a] || {}); o[a][b] = v; continue; }
      o[k] = v;
    }
    return o;
  }
  const write = (op, p, data) => {
    if (hooks.failWrite && hooks.failWrite(op, p, data)) throw Object.assign(new Error("거절"), { code: "permission-denied" });
    hooks.writes.push({ op, path: p, data });
    if (op === "delete"){ store.delete(p); bump(p); return; }
    if (op === "set"){ store.set(p, JSON.parse(JSON.stringify(data))); bump(p); return; }
    if (!store.has(p)){ const e = new Error("no doc " + p); e.code = "not-found"; throw e; }
    store.set(p, applyUpdate(store.get(p), data)); bump(p);
  };
  function snap(p){ const d = store.get(p); return { id: p.split("/").pop(), exists: d !== undefined, data: () => d && JSON.parse(JSON.stringify(d)), ref: ref(p) }; }
  function ref(p){
    return {
      path: p, id: p.split("/").pop(),
      collection: n => col(p + "/" + n),
      onSnapshot: cb => { if (hooks.live) Promise.resolve().then(() => cb(snap(p))); return () => {}; },
      get: async () => { await null; if (hooks.failGet) throw hooks.failGet; if (hooks.failGetPath && hooks.failGetPath(p)) throw Object.assign(new Error("net"), { code: "unavailable" }); return snap(p); },
      set: async d => { await null; ruleGate([["set", p, d]]); write("set", p, d); },
      update: async d => { await null; ruleGate([["update", p, d]]); write("update", p, d); },
      delete: async () => { await null; ruleGate([["delete", p]]); write("delete", p); }
    };
  }
  function col(p){
    return {
      path: p,
      onSnapshot: cb => { if (hooks.live) Promise.resolve().then(() => cb({ docs: [...store.keys()].filter(k => k.startsWith(p + "/") && !k.slice(p.length + 1).includes("/")).map(snap) })); return () => {}; },
      doc: id => ref(p + "/" + (id || ("auto" + (++seq)))),
      add: async d => { await null; const r = ref(p + "/auto" + (++seq)); write("set", r.path, d); return r; },
      get: async () => { await null; if (hooks.failGet) throw hooks.failGet;
        const docs = [...store.keys()].filter(k => k.startsWith(p + "/") && !k.slice(p.length + 1).includes("/")).map(snap);
        return { docs }; }
    };
  }
  const db = {
    collection: n => col(n),
    batch(){
      const ops = [];
      return {
        set: (r, d) => ops.push(["set", r.path, d]),
        update: (r, d) => ops.push(["update", r.path, d]),
        delete: r => ops.push(["delete", r.path]),
        commit: async () => { await null; if (hooks.hold) await hooks.hold; if (hooks.failCommit && hooks.failCommit(ops)) throw Object.assign(new Error("net"), { code: "unavailable" }); ruleGate(ops); ops.forEach(o => write(o[0], o[1], o[2])); if (hooks.offline) await new Promise(() => {}); }
      };
    },
    async runTransaction(fn){
      for (let n = 0; n < 5; n++){
        const reads = new Map(), ops = [];
        const tx = {
          get: async r => { await null; reads.set(r.path, ver.get(r.path) || 0); return snap(r.path); },
          set: (r, d) => { ops.push(["set", r.path, d]); return tx; },
          update: (r, d) => { ops.push(["update", r.path, d]); return tx; },
          delete: r => { ops.push(["delete", r.path]); return tx; }
        };
        const res = await fn(tx);
        await null; await null;
        if ([...reads].some(([p, v]) => (ver.get(p) || 0) !== v)) continue;     // 누가 먼저 썼다 — 다시
        ops.forEach(o => write(o[0], o[1], o[2]));
        return res;
      }
      throw Object.assign(new Error("aborted"), { code: "aborted" });
    }
  };
  return { db, store, hooks };
}

/** 본 스크립트를 올린 새 환경 — shared: 같은 저장소를 쓰는 다른 기기, opts.html: 옛 화면 원본 */
function load(shared, opts){
  const els = {};
  const $ = s => els[s] || (els[s] = fakeEl("div"));
  const F = shared || makeDb();
  const asks = [], statuses = [], closed = [], urls = [];
  const ls = {};
  const ctx = {
    console, setTimeout, clearTimeout, Promise, JSON, Math, Date, Object, Array, Set, Map, String, Number, Error, URLSearchParams, TextEncoder, Uint8Array, URL,
    crypto: require("crypto").webcrypto,
    localStorage: { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; },
      get length(){ return Object.keys(ls).length; }, key: i => Object.keys(ls)[i] || null },
    location: { origin: "https://x.test", pathname: "/wishtag/", search: "", reload(){} },
    history: { replaceState: (s, t, u) => { urls.push(u); }, state: null },
    navigator: {}, matchMedia: () => ({ matches: false }), scrollTo(){}, addEventListener(){}, removeEventListener(){},
    document: { createElement: tag => fakeEl(tag), title: "" },
    firebase: { firestore: { FieldValue: { serverTimestamp: () => SV, arrayUnion: (...a) => ({ __union: a }) } } },
    db: F.db, FB_OK: false,
    $, $$: () => [],
    MODAL_OPEN: {}, MODAL_AFTER: {}, MODAL_CLOSE: {},
    ASK: true,
    ask: async o => { asks.push(o); return ctx.ASK; },
    openModal: id => { if (ctx.MODAL_OPEN[id]) ctx.MODAL_OPEN[id](); $("#" + id).hidden = false; },
    closeModal: id => { $("#" + id).hidden = true; closed.push(id); if (ctx.MODAL_AFTER[id]) ctx.MODAL_AFTER[id](); },
    setStatus: (m, c) => statuses.push([m, c || ""]),
    errText: e => (e && e.message) || "오류", shareLine(){}
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(mainScript(opts && opts.html), ctx, { filename: "index.html" });
  statuses.length = 0;
  const run = code => vm.runInContext(code, ctx);
  return { ctx, run, $, els, F, asks, statuses, ls, closed, urls };
}

const sha = t => require("crypto").createHash("sha256").update(t, "utf8").digest("hex");
const WID = "w".repeat(12), VID = "v".repeat(24), KEY = sha(WID + ":");
/** 열려 있는 리스트(주인) 하나를 저장소와 화면 상태에 같이 넣는다 */
function setup(E, items){
  E.F.store.set("wishes/" + WID, { name: "리스트", locked: false });
  E.F.store.set("wishOwner/" + KEY, { wid: WID, v: VID, n: "n".repeat(10) });
  E.F.store.set("wishView/" + VID, { wid: WID, heading: "리스트", subheading: "", order: (items || []).map(x => x.id) });
  (items || []).forEach(x => E.F.store.set("wishView/" + VID + "/items/" + x.id, Object.assign({ note: "", link: "", claimedBy: "", claimedAt: 0, claimCheck: "", unclaim: "", example: false }, x)));
  E.ctx.__W = WID; E.ctx.__V = VID; E.ctx.__K = KEY;
  E.run("WID = __W; VID = __V; KEY = __K; asFriend = false;");
  syncItems(E);
}
/** 저장소 → 화면 상태 (구독이 들어온 것처럼) */
function syncItems(E){
  const pre = "wishView/" + VID + "/items/";
  E.ctx.__I = [...E.F.store.keys()].filter(k => k.startsWith(pre)).map(k => Object.assign({ id: k.slice(pre.length) }, JSON.parse(JSON.stringify(E.F.store.get(k)))));
  E.run("ITEMS = __I;");
}
const itemPath = id => "wishView/" + VID + "/items/" + id;
/** 규칙(firestore.rules 의 위시태그 items update) 중 친구 선점·취소 경로를 그대로 흉내 — 주인 경로(op 있음)는 통과 */
function friendRules(E){
  E.F.hooks.failWrite = (op, p, d) => {
    if (op !== "update" || !/^wishView\/[^/]+\/items\/[^/]+$/.test(p)) return false;
    const cur = E.F.store.get(p), nw = Object.assign({}, cur, d);
    if (nw.op) return false;
    const aff = Object.keys(nw).filter(k => JSON.stringify(nw[k]) !== JSON.stringify(cur[k]));
    if (!aff.every(k => ["claimedBy", "claimedAt", "claimCheck", "unclaim"].includes(k))) return true;
    if ((cur.claimedBy || "") === "" && nw.claimedBy.length > 0 && nw.claimCheck.length === 64) return false;
    if ((cur.claimedBy || "") !== "" && nw.claimedBy === "" && nw.claimCheck === "" && sha(nw.unclaim) === cur.claimCheck) return false;
    return true;
  };
}
const tick = n => new Promise(r => setTimeout(r, n || 5));

/* ── 아주 작은 시험 틀 ── */
const results = [];
function test(name, fn){ results.push({ name, fn }); }
async function main(){
  let pass = 0, fail = 0;
  for (const t of results){
    try { await t.fn(); pass++; console.log("  ok   " + t.name); }
    catch(e){ fail++; console.log("  FAIL " + t.name + " — " + String(e && e.message || e).split("\n")[0]); }
  }
  console.log("RESULT " + pass + " " + fail);
  process.exitCode = fail ? 1 : 0;
}
function eq(a, b, msg){ const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) throw new Error((msg || "다름") + ": " + A + " ≠ " + B); }
function ok(v, msg){ if (!v) throw new Error(msg || "거짓"); }

module.exports = { makeDb, load, setup, syncItems, friendRules, itemPath, sha, tick, test, main, eq, ok, WID, VID, KEY };
