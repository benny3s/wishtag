"""옮기기 스크립트(benny-apps/migrate_wish_1105.py) — 가짜 call 위에서. 실서버 · 토큰에 닿지 않는다"""
import contextlib, hashlib, io, json, os, sys, urllib.parse

sys.dont_write_bytecode = True    # benny-apps 에 __pycache__ 를 남기지 않게
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "benny-apps"))
sys.stdout.reconfigure(encoding="utf-8")

sha = lambda t: hashlib.sha256(t.encode("utf-8")).hexdigest()
DOCS = "projects/benny-apps/databases/(default)/documents"
WID, WID2, WID3 = "widaaaaaaaaa", "widbbbbbbbbb", "widccccccccc"
VID, VID2 = "v" * 24, "u" * 24
KEY = sha(WID + ":1234")


def doc(col, id_, **f):
    fields = {k: ({"stringValue": v} if isinstance(v, str) else {"booleanValue": v} if isinstance(v, bool) else {"arrayValue": {"values": []}}) for k, v in f.items()}
    return {"name": f"{DOCS}/{col}/{id_}", "fields": fields, "createTime": "2026-10-20T01:02:03Z", "updateTime": "2026-10-21T01:02:03Z"}


class Fake:
    """Firestore REST 흉내 — 목록 GET 과 updateMask PATCH (currentDocument.updateTime 를 지킴)"""

    def __init__(self, docs):
        self.docs = {d["name"]: d for d in docs}
        self.patches = []
        self.reject = set()   # 이 문서는 그사이 바뀐 것으로

    def __call__(self, url, body=None, method=None):
        path = url.split("/v1/", 1)[1].split("?")[0]
        path = urllib.parse.unquote(path)
        if method == "PATCH":
            qs = urllib.parse.parse_qs(url.split("?", 1)[1])
            self.patches.append({"path": path, "mask": qs.get("updateMask.fieldPaths", []), "pre": qs.get("currentDocument.updateTime", []), "body": body})
            d = self.docs[path]
            if path in self.reject or qs.get("currentDocument.updateTime", [""])[0] != d["updateTime"]:
                raise RuntimeError(f"400 {path[-60:]}: FAILED_PRECONDITION 비밀내용")
            for m in qs["updateMask.fieldPaths"]:
                if m in body["fields"]:
                    d["fields"][m] = body["fields"][m]
                else:
                    d["fields"].pop(m, None)
            d["updateTime"] = "2026-11-05T00:00:00.%06dZ" % len(self.patches)
            return d
        assert method is None and body is None, url
        pre = path + "/"
        return {"documents": [d for n, d in self.docs.items() if n.startswith(pre) and "/" not in n[len(pre):]]}


def world():
    return Fake([
        doc("wishes", WID, name="지민", locked=True),
        doc("wishes", WID2, name="둘", locked=False),
        doc("wishes", WID3, name="이미", locked=False, kh=sha(sha(WID3 + ":"))),
        doc("wishOwner", KEY, wid=WID, v=VID, n="n" * 10),
        doc("wishOwner", sha(WID2 + ":"), wid=WID2, v=VID2, n="m" * 10),
        doc("wishOwner", sha("숨은 값"), wid=WID2, v=VID2, n="h" * 10),
        doc("wishOwner", sha(WID3 + ":"), wid=WID3, v="t" * 24, n="k" * 10),
        doc("wishView", VID, wid=WID, heading="지민 생일 선물", subheading="비밀소개", order=[], updatedAt="그대로"),
        doc("wishView", VID2, wid=WID2, heading="둘 제목", subheading="", order=[]),
        doc("wishView", "t" * 24, wh=sha(WID3), heading="옮긴", subheading="", order=[]),
    ])


def run(fake, apply):
    import backup_data as bd
    import migrate_wish_1105 as m
    bd.call = fake
    bd.token = lambda: (_ for _ in ()).throw(AssertionError("토큰에 닿음"))
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = m.main(["--apply"] if apply else [])
    return rc, buf.getvalue()


def field(fake, col, id_, k):
    return fake.docs[f"{DOCS}/{col}/{id_}"]["fields"].get(k, {}).get("stringValue")


TESTS = []
def test(f):
    TESTS.append(f)
    return f


@test
def dry_run_은_아무것도_쓰지_않는다():
    f = world()
    rc, out = run(f, False)
    assert f.patches == [], f.patches
    assert rc == 0
    assert "--apply" in out, out


@test
def apply_는_wh_를_넣고_wid_를_지우며_다른_칸은_안_건드린다():
    f = world()
    run(f, True)
    assert field(f, "wishView", VID, "wid") is None
    assert field(f, "wishView", VID, "wh") == sha(WID)
    assert field(f, "wishView", VID, "heading") == "지민 생일 선물"
    assert field(f, "wishView", VID, "updatedAt") == "그대로"
    p = [x for x in f.patches if x["path"].endswith("wishView/" + VID)][0]
    assert sorted(p["mask"]) == ["wh", "wid"], p["mask"]
    assert list(p["body"]["fields"]) == ["wh"]
    assert p["pre"], "그사이 바뀐 문서를 덮어쓰면 안 됨"


@test
def 열쇠가_하나면_kh_를_넣는다():
    f = world()
    run(f, True)
    assert field(f, "wishes", WID, "kh") == sha(KEY)
    p = [x for x in f.patches if x["path"].endswith("wishes/" + WID)][0]
    assert p["mask"] == ["kh"], p["mask"]
    assert p["pre"], "PIN 을 그사이 바꾼 문서를 덮어쓰면 안 됨"
    assert field(f, "wishes", WID, "name") == "지민"


@test
def 열쇠가_둘이면_kh_를_넣지_않고_개수를_보고한다():
    f = world()
    _, out = run(f, True)
    assert field(f, "wishes", WID2, "kh") is None
    assert WID2[:4] in out and "2" in out, out


@test
def 두_번_돌려도_더_쓰지_않는다():
    f = world()
    run(f, True)
    n = len(f.patches)
    _, out = run(f, True)
    assert len(f.patches) == n, f.patches[n:]
    assert field(f, "wishView", VID, "wh") == sha(WID)


@test
def 이미_있는_kh_는_건드리지_않는다():
    f = world()
    before = field(f, "wishes", WID3, "kh")
    run(f, True)
    assert field(f, "wishes", WID3, "kh") == before
    assert not [x for x in f.patches if x["path"].endswith("wishes/" + WID3)]


@test
def kh_가_지금_열쇠와_다르면_고치지_않고_보고한다():
    f = world()
    f.docs[f"{DOCS}/wishes/{WID3}"]["fields"]["kh"] = {"stringValue": sha("다른 값")}
    _, out = run(f, True)
    assert field(f, "wishes", WID3, "kh") == sha("다른 값")
    assert WID3[:4] in out, out


@test
def 그사이_바뀐_문서는_건너뛰고_다시_돌리라고_한다():
    f = world()
    f.reject.add(f"{DOCS}/wishes/{WID}")
    rc, out = run(f, True)
    assert field(f, "wishes", WID, "kh") is None
    assert "비밀내용" not in out, out
    assert rc != 0
    assert field(f, "wishView", VID, "wh") == sha(WID), "다른 문서는 계속 옮겨야 함"


@test
def 출력에_열쇠_PIN_wid_전체_문서_내용이_없다():
    f = world()
    for apply in (False, True):
        _, out = run(f, apply)
        for bad in (KEY, sha(KEY), WID, WID2, VID, "1234", "지민", "비밀소개", "n" * 10, sha("숨은 값")):
            assert bad not in out, bad
        assert sha(WID) not in out


@test
def 진행_경과를_줄로_보고한다():
    f = world()
    _, out = run(f, True)
    assert len([x for x in out.splitlines() if x.strip()]) >= 5, out
    assert "wishView" in out and "wishes" in out, out


@test
def 짧은_wid_는_경고한다():
    f = world()
    short = "abc123"
    f.docs[f"{DOCS}/wishes/{short}"] = doc("wishes", short, name="짧", locked=False)
    f.docs[f"{DOCS}/wishOwner/{sha(short + ':')}"] = doc("wishOwner", sha(short + ":"), wid=short, v="s" * 24, n="q" * 10)
    _, out = run(f, False)
    assert "abc1" in out and "짧" in out, out


p = q = 0
for t in TESTS:
    try:
        t()
        p += 1
        print("  ok   " + t.__name__)
    except Exception as e:
        q += 1
        print("  FAIL " + t.__name__ + " — " + repr(e)[:300])
print(f"RESULT {p} {q}")
sys.exit(1 if q else 0)
