"""Build the Local Busan static site (English, Japanese, Simplified Chinese).

English sources: src/pages/*.html and src/guides/*.html
Japanese:        src/ja/pages/*.html and src/ja/guides/*.html   -> served under /ja/
Chinese:         src/zh/pages/*.html and src/zh/guides/*.html   -> served under /zh/
Each file starts with a JSON comment holding its metadata, e.g.
<!-- {"title": "...", "description": "...", "path": "/about", "nav": "about"} -->
"path" is the language-neutral path; translated files use the SAME path as the English file
so the language switcher and hreflang tags can pair them. Internal links in translated pages
can be written like the English ones (/about); the build adds the /ja or /zh prefix.
Run: python3 src/build.py   ->  writes site/
"""
import json, re, datetime, pathlib, html

SITE_URL = "https://localbusan.com"   # change if your address is different
SITE_NAME = "Local Busan"
AUTHORS = [
    {"@type": "Person", "name": "Minwoo Choi", "url": SITE_URL + "/about#minwoo"},
    {"@type": "Person", "name": "Hyunseo", "url": SITE_URL + "/about#hyunseo"},
]
ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT.parent / "site"
TODAY = datetime.date.today().isoformat()
YEAR = datetime.date.today().year
VERIFY = ["rwcxFP-PQmnBg84kqpqzv1FpxHzRL_FCqZ4QD2k7Seo", "tK6F0QeMDl2YvQYlnRr1BxjwUCncVLAwwo9wmyorlCo"]  # localbusan.com, localbusan.pages.dev

LANGS = {
    "en": {
        "prefix": "", "html": "en", "hreflang": "en", "og": "en_US", "label": "English", "short": "EN",
        "src": ROOT,
        "nav": [("eat", "Eat", "/guides#eat"), ("cafes", "Cafés", "/guides#cafes"), ("tours", "Tours", "/guides#tours"),
                ("neighborhoods", "Neighborhoods", "/guides#neighborhoods"), ("tips", "Practical tips", "/guides#tips"),
                ("about", "About", "/about")],
        "ask": "Ask a Local", "skip": "Skip to content", "lang_nav": "Language",
        "footer": "Independent guides to Busan, written by Minwoo Choi and Hyunseo — two Busan locals who have lived here all their lives. Some links on this site are affiliate links: if you book through them we may earn a small commission, at no extra cost to you.",
        "fnav": [("About", "/about"), ("All guides", "/guides"), ("Ask a Local", "/ask"), ("Affiliate disclosure", "/affiliate-disclosure"), ("Privacy", "/privacy")],
    },
    "ja": {
        "prefix": "/ja", "html": "ja", "hreflang": "ja", "og": "ja_JP", "label": "日本語", "short": "日本語",
        "src": ROOT / "ja",
        "nav": [("eat", "グルメ", "/guides#eat"), ("cafes", "カフェ", "/guides#cafes"), ("tours", "ツアー", "/guides#tours"),
                ("neighborhoods", "エリア", "/guides#neighborhoods"), ("tips", "お役立ち情報", "/guides#tips"),
                ("about", "私たちについて", "/about")],
        "ask": "地元民に質問", "skip": "本文へスキップ", "lang_nav": "言語",
        "footer": "釜山で生まれ育った地元民、Minwoo Choi と Hyunseo が書く独立系の釜山ガイドです。一部のリンクはアフィリエイトリンクです。リンク経由で予約された場合、お客様の負担なく当サイトに少額の手数料が入ることがあります。",
        "fnav": [("私たちについて", "/about"), ("ガイド一覧", "/guides"), ("地元民に質問", "/ask"), ("アフィリエイトについて", "/affiliate-disclosure"), ("プライバシー", "/privacy")],
    },
    "zh": {
        "prefix": "/zh", "html": "zh-Hans", "hreflang": "zh-Hans", "og": "zh_CN", "label": "简体中文", "short": "中文",
        "src": ROOT / "zh",
        "nav": [("eat", "美食", "/guides#eat"), ("cafes", "咖啡馆", "/guides#cafes"), ("tours", "游玩", "/guides#tours"),
                ("neighborhoods", "区域", "/guides#neighborhoods"), ("tips", "实用攻略", "/guides#tips"),
                ("about", "关于我们", "/about")],
        "ask": "问问本地人", "skip": "跳到正文", "lang_nav": "语言",
        "footer": "由两位土生土长的釜山本地人 Minwoo Choi 和 Hyunseo 撰写的独立釜山指南。本站部分链接为联盟链接：通过这些链接预订，我们可能获得少量佣金，您无需额外付费。",
        "fnav": [("关于我们", "/about"), ("全部攻略", "/guides"), ("问问本地人", "/ask"), ("联盟链接说明", "/affiliate-disclosure"), ("隐私政策", "/privacy")],
    },
}
ORDER = ["en", "ja", "zh"]

LOGO_SVG = ('<svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">'
            '<rect width="32" height="32" rx="8" fill="#0A5C8A"/>'
            '<path d="M6 19c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2" stroke="#fff" stroke-width="2" stroke-linecap="round"/>'
            '<path d="M6 24c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".6"/>'
            '<circle cx="22" cy="10" r="3" fill="#F2A65A"/></svg>')

GLOBE = ('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
         'stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/></svg>')

# Links that must not get a language prefix
STATIC = re.compile(r'^/(css|js|images|favicon|ja/|zh/|ja$|zh$|sitemap|robots)')


def lp(lang, path):
    """Language-prefixed path."""
    pre = LANGS[lang]["prefix"]
    if not pre:
        return path
    if path == "/":
        return pre + "/"
    return pre + path


import hashlib as _h
CSS_V = _h.md5((pathlib.Path(__file__).resolve().parent.parent / "site/css/style.css").read_bytes()).hexdigest()[:8]

KLOOK_LANG = {"en": "en-BS", "ja": "ja", "zh": "zh-CN"}


def localize_links(lang, body):
    if lang == "en":
        return body
    body = body.replace('data-lang="en-BS"', f'data-lang="{KLOOK_LANG[lang]}"')
    def fix(m):
        attr, path = m.group(1), m.group(2)
        if STATIC.match(path):
            return m.group(0)
        return f'{attr}="{lp(lang, path)}'
    return re.sub(r'(href|action)="(/[^"]*)', fix, body)


def header(lang, active, path, available):
    L = LANGS[lang]
    links = []
    for key, label, href in L["nav"]:
        cur = ' aria-current="page"' if key == active else ""
        links.append(f'<a href="{lp(lang, href)}"{cur}>{label}</a>')
    ask_cur = ' aria-current="page"' if active == "ask" else ""
    links.append(f'<a class="btn btn-pill" href="{lp(lang, "/ask")}"{ask_cur}>{L["ask"]}</a>')
    switch = []
    for code in ORDER:
        target = lp(code, path if code in available else "/")
        if code == lang:
            switch.append(f'<a href="{target}" lang="{LANGS[code]["html"]}" hreflang="{LANGS[code]["hreflang"]}" aria-current="true">{LANGS[code]["short"]}</a>')
        else:
            switch.append(f'<a href="{target}" lang="{LANGS[code]["html"]}" hreflang="{LANGS[code]["hreflang"]}">{LANGS[code]["short"]}</a>')
    return f"""<a class="skip-link" href="#main">{L["skip"]}</a>
<header class="site-header">
  <div class="container">
    <a class="logo" href="{lp(lang, "/")}">{LOGO_SVG}<span>{SITE_NAME}</span></a>
    <div class="header-right">
      <nav class="nav" aria-label="Main">{''.join(links)}</nav>
      <nav class="lang-switch" aria-label="{L["lang_nav"]}">{GLOBE}{''.join(switch)}</nav>
    </div>
  </div>
</header>"""


def footer(lang):
    L = LANGS[lang]
    fl = "".join(f'<a href="{lp(lang, h)}">{t}</a>' for t, h in L["fnav"])
    return f"""<footer class="site-footer">
  <div class="container">
    <div class="footer-brand">
      <strong>{SITE_NAME}</strong>
      <span>{L["footer"]}</span>
      <span>&copy; {YEAR} {SITE_NAME}</span>
    </div>
    <nav aria-label="Footer">{fl}</nav>
  </div>
</footer>"""


def layout(lang, meta, body, available):
    L = LANGS[lang]
    path = meta["path"]
    title = meta["title"]
    full_title = title if SITE_NAME in title else f"{title} | {SITE_NAME}"
    desc = html.escape(meta["description"], quote=True)
    url = SITE_URL + lp(lang, path)
    robots = '<meta name="robots" content="noindex">' if meta.get("noindex") else ""
    og_type = "article" if meta.get("kind") == "guide" else "website"
    image = SITE_URL + meta.get("image", "/images/og.png")
    alternates = ""
    if not meta.get("noindex"):
        alts = [f'<link rel="alternate" hreflang="{LANGS[c]["hreflang"]}" href="{SITE_URL + lp(c, path)}">' for c in ORDER if c in available]
        if "en" in available:
            alts.append(f'<link rel="alternate" hreflang="x-default" href="{SITE_URL + path}">')
        alternates = "\n".join(alts)
    jsonld = meta.get("jsonld")
    jsonld_tag = f'<script type="application/ld+json">{json.dumps(jsonld, ensure_ascii=False)}</script>' if jsonld else ""
    scripts = "".join(f'<script src="{s}" defer></script>' for s in meta.get("scripts", []))
    return f"""<!doctype html>
<html lang="{L["html"]}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(full_title)}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{url}">
{alternates}
{robots}
<meta property="og:site_name" content="{SITE_NAME}">
<meta property="og:locale" content="{L["og"]}">
<meta property="og:type" content="{og_type}">
<meta property="og:title" content="{html.escape(title, quote=True)}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/images/apple-touch-icon.png">
<meta name="theme-color" content="#0A5C8A">
{"".join(f'<meta name="google-site-verification" content="{v}">' for v in VERIFY)}
<meta name="author" content="Minwoo Choi, Hyunseo">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/style.css?v={CSS_V}">
{jsonld_tag}
{scripts}
</head>
<body>
{header(lang, meta.get("nav", ""), path, available)}
<main id="main">
{body}
</main>
{footer(lang)}
</body>
</html>
"""


def read_page(path):
    text = path.read_text(encoding="utf-8")
    m = re.match(r"\s*<!--\s*(\{.*?\})\s*-->\s*", text, re.S)
    if not m:
        raise SystemExit(f"{path}: missing metadata comment")
    return json.loads(m.group(1)), text[m.end():]


def out_file(lang, page_path):
    p = lp(lang, page_path)
    if p.endswith("/"):
        return OUT / p.strip("/") / "index.html" if p != "/" else OUT / "index.html"
    return OUT / (p.strip("/") + ".html")


def collect():
    """Return {path: {lang: (meta, body, is_guide)}}"""
    pages = {}
    for lang in ORDER:
        base = LANGS[lang]["src"]
        for kind in ("pages", "guides"):
            d = base / kind
            if not d.exists():
                continue
            for src in sorted(d.glob("*.html")):
                meta, body = read_page(src)
                pages.setdefault(meta["path"], {})[lang] = (meta, body, kind == "guides")
    return pages


def build():
    pages = collect()
    sitemap = []
    for path, versions in pages.items():
        available = set(versions)
        for lang, (meta, body, is_guide) in versions.items():
            if is_guide:
                meta.setdefault("kind", "guide")
                meta.setdefault("jsonld", {
                    "@context": "https://schema.org", "@type": "Article",
                    "headline": meta["title"], "description": meta["description"],
                    "inLanguage": LANGS[lang]["html"],
                    "author": meta.get("authors", AUTHORS),
                    "datePublished": meta.get("published", TODAY), "dateModified": meta.get("updated", TODAY),
                    "mainEntityOfPage": SITE_URL + lp(lang, path),
                })
            target = out_file(lang, path)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(layout(lang, meta, localize_links(lang, body), available), encoding="utf-8")
            if not meta.get("noindex"):
                sitemap.append((lp(lang, path), meta.get("updated", TODAY)))
    sitemap.sort()
    urls = "\n".join(f"  <url><loc>{SITE_URL}{p}</loc><lastmod>{d}</lastmod></url>" for p, d in sitemap)
    (OUT / "sitemap.xml").write_text(
        f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}\n</urlset>\n', encoding="utf-8")
    (OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {SITE_URL}/sitemap.xml\n", encoding="utf-8")
    print(f"Built {len(sitemap)} indexed pages into {OUT}")


if __name__ == "__main__":
    build()
