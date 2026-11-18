"""Build the Local Busan static site.

Pages live in src/pages/*.html and guides in src/guides/*.html.
Each file starts with a JSON comment holding its metadata:
<!-- {"title": "...", "description": "...", "path": "/about", "nav": "about"} -->
Run: python3 build.py   ->  writes ../site/
"""
import json, re, datetime, pathlib, html

SITE_URL = "https://localbusan.pages.dev"   # change if your address is different
SITE_NAME = "Local Busan"
AUTHOR = "Minwoo Choi"
AUTHORS = [
    {"@type": "Person", "name": "Minwoo Choi", "url": "https://localbusan.pages.dev/about#minwoo"},
    {"@type": "Person", "name": "Hyunseo", "url": "https://localbusan.pages.dev/about#hyunseo"},
]
ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT.parent / "site"
TODAY = datetime.date.today().isoformat()

NAV = [
    ("eat", "Eat", "/guides#eat"),
    ("cafes", "Cafés", "/guides#cafes"),
    ("tours", "Tours", "/guides#tours"),
    ("neighborhoods", "Neighborhoods", "/guides#neighborhoods"),
    ("tips", "Practical tips", "/guides#tips"),
    ("about", "About", "/about"),
]

LOGO_SVG = ('<svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">'
            '<rect width="32" height="32" rx="8" fill="#0A5C8A"/>'
            '<path d="M6 19c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2" stroke="#fff" stroke-width="2" stroke-linecap="round"/>'
            '<path d="M6 24c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".6"/>'
            '<circle cx="22" cy="10" r="3" fill="#F2A65A"/></svg>')


def header(active):
    links = []
    for key, label, href in NAV:
        cur = ' aria-current="page"' if key == active else ""
        links.append(f'<a href="{href}"{cur}>{label}</a>')
    ask_cur = ' aria-current="page"' if active == "ask" else ""
    links.append(f'<a class="btn btn-pill" href="/ask"{ask_cur}>Ask a Local</a>')
    return f"""<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="container">
    <a class="logo" href="/">{LOGO_SVG}<span>{SITE_NAME}</span></a>
    <nav class="nav" aria-label="Main">{''.join(links)}</nav>
  </div>
</header>"""


FOOTER = f"""<footer class="site-footer">
  <div class="container">
    <div class="footer-brand">
      <strong>{SITE_NAME}</strong>
      <span>Independent guides to Busan, written by Minwoo Choi and Hyunseo — two Busan locals who have lived here all their lives. Some links on this site are affiliate links: if you book through them we may earn a small commission, at no extra cost to you.</span>
      <span>&copy; {datetime.date.today().year} {SITE_NAME}</span>
    </div>
    <nav aria-label="Footer">
      <a href="/about">About</a>
      <a href="/guides">All guides</a>
      <a href="/ask">Ask a Local</a>
      <a href="/affiliate-disclosure">Affiliate disclosure</a>
      <a href="/privacy">Privacy</a>
    </nav>
  </div>
</footer>"""


def layout(meta, body):
    title = meta["title"]
    full_title = title if SITE_NAME in title else f"{title} | {SITE_NAME}"
    desc = html.escape(meta["description"], quote=True)
    url = SITE_URL + (meta["path"] if meta["path"] != "/" else "/")
    robots = '<meta name="robots" content="noindex">' if meta.get("noindex") else ""
    og_type = "article" if meta.get("kind") == "guide" else "website"
    image = SITE_URL + meta.get("image", "/images/og.png")
    jsonld = meta.get("jsonld")
    jsonld_tag = f'<script type="application/ld+json">{json.dumps(jsonld, ensure_ascii=False)}</script>' if jsonld else ""
    scripts = "".join(f'<script src="{s}" defer></script>' for s in meta.get("scripts", []))
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(full_title)}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{url}">
{robots}
<meta property="og:site_name" content="{SITE_NAME}">
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
<meta name="google-site-verification" content="tK6F0QeMDl2YvQYlnRr1BxjwUCncVLAwwo9wmyorlCo">
<meta name="author" content="Minwoo Choi, Hyunseo">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/style.css">
{jsonld_tag}
{scripts}
</head>
<body>
{header(meta.get("nav", ""))}
<main id="main">
{body}
</main>
{FOOTER}
</body>
</html>
"""


def read_page(path):
    text = path.read_text(encoding="utf-8")
    m = re.match(r"\s*<!--\s*(\{.*?\})\s*-->\s*", text, re.S)
    if not m:
        raise SystemExit(f"{path}: missing metadata comment")
    return json.loads(m.group(1)), text[m.end():]


def out_file(page_path):
    if page_path == "/":
        return OUT / "index.html"
    return OUT / (page_path.strip("/") + ".html")


def build():
    sitemap = []
    for src in sorted((ROOT / "pages").glob("*.html")):
        meta, body = read_page(src)
        target = out_file(meta["path"])
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(layout(meta, body), encoding="utf-8")
        if not meta.get("noindex"):
            sitemap.append((meta["path"], meta.get("updated", TODAY)))
    guides_dir = ROOT / "guides"
    if guides_dir.exists():
        for src in sorted(guides_dir.glob("*.html")):
            meta, body = read_page(src)
            meta.setdefault("kind", "guide")
            meta.setdefault("jsonld", {
                "@context": "https://schema.org", "@type": "Article",
                "headline": meta["title"], "description": meta["description"],
                "author": meta.get("authors", AUTHORS),
                "datePublished": meta.get("published", TODAY), "dateModified": meta.get("updated", TODAY),
                "mainEntityOfPage": SITE_URL + meta["path"],
            })
            target = out_file(meta["path"])
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(layout(meta, body), encoding="utf-8")
            if not meta.get("noindex"):
                sitemap.append((meta["path"], meta.get("updated", TODAY)))
    urls = "\n".join(f"  <url><loc>{SITE_URL}{p}</loc><lastmod>{d}</lastmod></url>" for p, d in sitemap)
    (OUT / "sitemap.xml").write_text(
        f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}\n</urlset>\n', encoding="utf-8")
    (OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {SITE_URL}/sitemap.xml\n", encoding="utf-8")
    print(f"Built {len(sitemap)} indexed pages into {OUT}")


if __name__ == "__main__":
    build()
