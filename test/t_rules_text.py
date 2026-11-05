"""firestore.rules 글자 점검 — 실제 컴파일은 배포 때. 여기서는 괄호 균형과, rules_sim 이 흉내 낸 판별이 규칙에 정말 있는지만 본다"""
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.stdout.reconfigure(encoding="utf-8")
RULES = open(os.path.join(HERE, "..", "..", "benny-apps", "firestore.rules"), encoding="utf-8").read()
HTML = open(os.path.join(HERE, "..", "index.html"), encoding="utf-8").read()


def strip(t):
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
    t = re.sub(r"//[^\n]*", "", t)
    return re.sub(r"'[^']*'", "''", t)


CODE = strip(RULES)
i = RULES.index("═══ 위시태그")
j = RULES.index("═══ 여행 가자")
WISH = strip(RULES[i:j].split("═══ */", 1)[1])
NOSPACE = re.sub(r"\s+", "", WISH)
TESTS = []
def test(f):
    TESTS.append(f)
    return f


def balanced(t):
    st, pair = [], {")": "(", "]": "[", "}": "{"}
    for c in t:
        if c in "([{":
            st.append(c)
        elif c in pair:
            assert st and st[-1] == pair[c], "괄호가 안 맞음: " + c
            st.pop()
    assert not st, "닫히지 않음: " + "".join(st)


@test
def 전체_괄호_균형():
    balanced(CODE)


@test
def 위시태그_절_괄호_균형():
    balanced(WISH.rstrip())


@test
def viewWid_와_data_wid_로_옛_판별을_쓰는_곳이_없다():
    assert "viewWid" not in WISH
    view = WISH[WISH.index("match /wishView/{v}"):]
    assert "resource.data.wid" not in view, "화면 문서를 wid 로 판별하는 곳이 남음"


@test
def wishOps_는_kh_를_요청_전_값으로_본다():
    assert "get(/databases/$(db)/documents/wishes/$(request.resource.data.wid)).data.get(''," in NOSPACE, "get(wishes).data.get('kh')"
    assert "getAfter(/databases/$(db)/documents/wishes/$(d.wid)).data.get(''" in NOSPACE, "열쇠 만들기는 뒤 값과 대조"


@test
def 열쇠_문서_update_는_wid_를_못_바꾸고_create_와_같은_조건():
    assert "allowupdate:ifrequest.resource.data.wid==resource.data.wid&&wishOwnerOk(k,request.resource.data);" in NOSPACE
    assert "allowcreate:ifwishOwnerOk(k,request.resource.data);" in NOSPACE


@test
def wishOps_는_wishes_가_있는지_먼저_본다():
    assert "exists(/databases/$(db)/documents/wishes/$(request.resource.data.wid))?get(" in NOSPACE


@test
def 화면_문서_만들기는_wh_만():
    m = re.search(r"match/wishView/\{v\}\{.*?allowcreate:if(.*?);", NOSPACE)
    assert m, "create 를 못 찾음"
    keys = re.search(r"hasOnly\(\[(.*?)\]\)", re.search(r"match /wishView/\{v\}.*?allow create[^;]*", RULES, re.S).group(0)).group(1)
    assert "'wh'" in keys and "'wid'" not in keys, keys


@test
def 문서_접근_캐시에_기대지_않게_묶음을_줄였다():
    assert re.search(r"DEL_BATCH\s*=\s*2\b", HTML), "지우기 묶음"
    assert "i += 8" not in HTML, "8개씩 묶는 곳이 남음"


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
