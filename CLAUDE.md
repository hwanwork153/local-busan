# Local Busan — working notes for Claude

Live site: https://localbusan.pages.dev (Cloudflare Pages, auto-deploys from `main` in ~1 min; build output dir = `site`, no build command).
All accounts (GitHub, Cloudflare, Google Search Console, Google Drive) = hwanwork153@gmail.com.

## Structure
- `src/pages/*.html` — site pages. `src/guides/*.html` — guide articles. Each starts with a JSON metadata comment.
- `src/build.py` — wraps pages in the layout and writes `site/` (+ sitemap.xml, robots.txt). Run `python3 src/build.py` after any change, then commit both `src/` and `site/`.
- `site/css/style.css`, `site/js/*`, `site/images/*` — static files edited directly.
- `tools/heic2jpg.py` — converts iPhone HEIC photos: `python3 -I tools/heic2jpg.py in.heic out.jpg`.

## Authors
- Minwoo Choi — fashion lover, shopping enthusiast and practical-tips expert; 27 years in Busan, moved 10+ times (Dongnae, Dalmaji, Haeundae, Centum). Writes shopping guides and practical tips. Photo: site/images/minwoo-choi.jpg
- Hyunseo (현서) — food expert, 24 years in Busan. Writes restaurant guides.

## Writing rules
- English, for foreign travelers. Only facts the owners gave or that come from a cited listing; never invent prices, dishes or hours. Unknown → leave out.
- Every guide: quick answer box, what to order, how to order phrases (Korean + romanization + English), address in English and Korean, hours with source/date, Naver/Kakao/Google map links, author box, Ask CTA.
- Affiliate links only for things the owners have tried; disclosure is in the footer and /affiliate-disclosure.

## Photo workflow (Google Drive)
Photos are dropped in Drive folder "블로그 제휴 마케팅" (id 162l7EjOxYNDLidgDPbFRGnivHKtY1kYj), one subfolder per restaurant/place named like the guide (e.g. "양산왕돼지국밥" → src/guides/best-dwaeji-gukbap-busan.html).
For each new image: download, convert HEIC→JPG, auto-orient, resize to max 1600px, strip EXIF/GPS, save as `site/images/guides/<slug>/<nn>.jpg`.
Blur or crop out faces of strangers; never publish an image where a stranger is the focus.
Insert: first photo replaces the `.tile` hero in the guide (`<img class="hero-photo" ...>` with descriptive English alt text), the rest go in a `<div class="guide-photos">` gallery placed at the `<!-- PHOTOS -->` marker. Keep a list of already-used Drive file ids in `src/photos.json` so photos are never added twice.
