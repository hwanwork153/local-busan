"""Generate Japanese and Chinese page sources from the English ones.

  python3 tools/i18n.py missing ja     -> prints English text units with no Japanese translation yet (JSON)
  python3 tools/i18n.py apply          -> writes src/ja/** and src/zh/** from src/pages + src/guides

Translations live in src/i18n/<lang>.json as {"English text or inner HTML": "translation"}.
A "unit" is the inner HTML of a text element (h1-h3, p, li, a, button, label, span, strong, dt, dd, th, td,
option, output) that has no block-level children, plus alt / placeholder / aria-label / title / value attributes,
plus the page title and description in the metadata comment.
"""
import json, re, sys, pathlib
from bs4 import BeautifulSoup, NavigableString

ROOT = pathlib.Path(__file__).resolve().parent.parent / "src"
LANGS = ["ja", "zh"]
UNIT_TAGS = ["h1", "h2", "h3", "p", "li", "a", "button", "label", "span", "strong", "dt", "dd", "th", "td", "option", "output", "summary"]
BLOCK = {"div", "p", "ul", "ol", "li", "section", "article", "aside", "nav", "table", "thead", "tbody", "tr", "dl", "h1", "h2", "h3", "form", "header", "footer", "figure"}
ATTRS = ["alt", "placeholder", "aria-label", "title"]
LATIN = re.compile(r"[A-Za-z]{2,}")


def sources():
    for kind in ("pages", "guides"):
        for f in sorted((ROOT / kind).glob("*.html")):
            yield kind, f


def split(text):
    m = re.match(r"(\s*<!--\s*)(\{.*?\})(\s*-->\s*)", text, re.S)
    return json.loads(m.group(2)), text[m.end():]


def is_unit(tag):
    if tag.name not in UNIT_TAGS:
        return False
    if any(d.name in BLOCK for d in tag.find_all(True)):
        return False
    for parent in tag.parents:
        if parent.name in UNIT_TAGS and not any(d.name in BLOCK for d in parent.find_all(True)):
            return False  # an ancestor is already a unit
    return True


def norm(s):
    return re.sub(r"\s+", " ", s).strip()


def units_of(body):
    soup = BeautifulSoup(body, "html.parser")
    out = []
    for tag in soup.find_all(UNIT_TAGS):
        if not is_unit(tag):
            continue
        inner = norm(tag.decode_contents())
        if inner and LATIN.search(re.sub(r"<[^>]+>", " ", inner)):
            out.append(inner)
    for tag in soup.find_all(True):
        for a in ATTRS:
            v = tag.get(a)
            if isinstance(v, str) and LATIN.search(v):
                out.append(norm(v))
        if tag.name == "input" and tag.get("type") == "text" and tag.get("value") and LATIN.search(tag["value"]):
            out.append(norm(tag["value"]))
    return soup, out


def load(lang):
    p = ROOT / "i18n" / f"{lang}.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def missing(lang):
    tr = load(lang)
    need = []
    for kind, f in sources():
        meta, body = split(f.read_text(encoding="utf-8"))
        for key in ("title", "description"):
            if meta[key] not in tr and meta[key] not in need:
                need.append(meta[key])
        _, us = units_of(body)
        for u in us:
            if u not in tr and u not in need:
                need.append(u)
    print(json.dumps(need, ensure_ascii=False, indent=1))
    print(f"{len(need)} missing for {lang}", file=sys.stderr)


def apply():
    for lang in LANGS:
        tr = load(lang)
        miss = 0
        for kind, f in sources():
            meta, body = split(f.read_text(encoding="utf-8"))
            meta = json.loads(json.dumps(meta))
            for key in ("title", "description"):
                if meta[key] in tr:
                    meta[key] = tr[meta[key]]
                else:
                    miss += 1
            soup, _ = units_of(body)
            for tag in soup.find_all(UNIT_TAGS):
                if not is_unit(tag):
                    continue
                inner = norm(tag.decode_contents())
                if inner in tr:
                    tag.clear()
                    frag = BeautifulSoup(tr[inner], "html.parser")
                    for child in list(frag.contents):
                        tag.append(child)
                elif inner and LATIN.search(re.sub(r"<[^>]+>", " ", inner)):
                    miss += 1
            for tag in soup.find_all(True):
                for a in ATTRS:
                    v = tag.get(a)
                    if isinstance(v, str) and norm(v) in tr:
                        tag[a] = tr[norm(v)]
                if tag.name == "input" and tag.get("type") == "text" and tag.get("value") and norm(tag["value"]) in tr:
                    tag["value"] = tr[norm(tag["value"])]
            out = ROOT / lang / kind / f.name
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text("<!-- " + json.dumps(meta, ensure_ascii=False) + " -->\n" + str(soup), encoding="utf-8")
        print(f"{lang}: written, {miss} untranslated units left")


if __name__ == "__main__":
    if sys.argv[1] == "missing":
        missing(sys.argv[2])
    else:
        apply()
