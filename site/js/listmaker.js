// Olive Young list maker: screenshots -> product names & prices (OCR in the browser) -> receipt with tax refund estimate.
// Images never leave the device. The OCR engine (Tesseract.js) and its language data load from the jsDelivr CDN.
(function () {
  'use strict';
  var TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  var MAX_ITEMS = 30;
  var REFUND_MIN = 15000, REFUND_MAX = 1000000; // per receipt (immediate refund)
  var RATE_LOW = 0.05, RATE_HIGH = 0.08;        // refund is about 5-8% of the purchase

  var items = []; // {id, url, img, name, price, qty, status: 'reading'|'done'|'failed'|'manual'}
  var nextId = 1;
  var workerPromise = null;
  var queue = Promise.resolve();
  var lastBlob = null;
  var el = {};

  function $(id) { return document.getElementById(id); }
  function won(n) { return '₩' + Math.round(n).toLocaleString('en-US'); }
  function setStatus(msg) { el.status.textContent = msg || ''; }

  // ---------- OCR ----------
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = resolve; s.onerror = function () { reject(new Error('load')); };
      document.head.appendChild(s);
    });
  }

  function getWorker() {
    if (!workerPromise) {
      workerPromise = loadScript(TESSERACT_URL).then(function () {
        return window.Tesseract.createWorker('kor+eng');
      });
      workerPromise.catch(function () { workerPromise = null; });
    }
    return workerPromise;
  }

  var UI_WORDS = /(장바구니|구매하기|바로구매|오늘드림|픽업|무료배송|배송|쿠폰|증정|리뷰|별점|할인|세일|특가|품절|재고|매장|찜|공유|선물|옵션|선택|카트|BEST|Best|SALE|Sale|Review|review|Add to|Buy|Cart|cart|Free|Shipping|Coupon|Wish)/;

  function parseText(text) {
    var lines = text.split(/\n+/).map(function (l) { return l.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
    // Prices: numbers followed by 원 or preceded by ₩ / W
    var prices = [];
    lines.forEach(function (l) {
      if (/리뷰|review|★|☆|평점|별점|\(\d/i.test(l)) return; // review counts, ratings
      // 1) amounts with a currency mark (OCR often turns 원 into 월/윈/웜)
      var re = /(?:₩|W)\s?(\d{1,3}(?:[,.]\d{3})+|\d{4,7})|(\d{1,3}(?:[,.]\d{3})+|\d{4,7})\s?[원월윈웜]/g, m;
      while ((m = re.exec(l))) {
        var v = parseInt((m[1] || m[2]).replace(/[,.]/g, ''), 10);
        if (v >= 500 && v <= 2000000) prices.push(v);
      }
      // 2) comma-formatted amounts like 20,800 even if the currency mark was lost
      var re2 = /(?:^|[^\d,])(\d{1,3}(?:,\d{3})+)(?![\d,])/g;
      while ((m = re2.exec(l))) {
        var v2 = parseInt(m[1].replace(/,/g, ''), 10);
        if (v2 >= 1000 && v2 <= 2000000 && prices.indexOf(v2) === -1) prices.push(v2);
      }
    });
    // The sale price is usually the lowest price shown (the original price is crossed out).
    var price = prices.length ? Math.min.apply(null, prices) : 0;

    // Name: the line that looks most like a product title (+ the brand line right above it, if any).
    var best = '', bestScore = 0, bestIdx = -1;
    function skip(l) {
      if (/올리브\s?영|olive\s?young/i.test(l)) return true;
      if (/원|₩|%|★/.test(l) && /\d/.test(l)) return true;
      if (UI_WORDS.test(l) && l.length < 14) return true;
      if (/상품\s?이미지/.test(l)) return true;
      return false;
    }
    lines.forEach(function (l, i) {
      if (skip(l)) return;
      var letters = (l.match(/[가-힣A-Za-z]/g) || []).length;
      if (letters < 4) return;
      var score = letters + (/[가-힣]/.test(l) ? 3 : 0) + (/\d+\s?(ml|mL|g|매|개|입|ea)\b/.test(l) ? 4 : 0)
        - (l.match(/[^가-힣A-Za-z0-9\s\[\]()+\-/.,&'%]/g) || []).length * 2;
      if (score > bestScore) { bestScore = score; best = l; bestIdx = i; }
    });
    if (bestIdx > 0) {
      var prev = lines[bestIdx - 1];
      if (!skip(prev) && prev.length <= 14 && !/\d/.test(prev) && /[가-힣A-Za-z]{2,}/.test(prev) && best.indexOf(prev) === -1) best = prev + ' ' + best;
    }
    best = best.replace(/^[^가-힣A-Za-z0-9\[(]+/, '').replace(/[|_~]+/g, '').trim().slice(0, 80);
    return { name: best, price: price };
  }

  function readItem(it) {
    queue = queue.then(function () {
      return getWorker().then(function (worker) {
        return worker.recognize(it.img);
      }).then(function (res) {
        (window.__lmRaw = window.__lmRaw || []).push(res.data.text || '');
        var p = parseText(res.data.text || '');
        if (!it.name) it.name = p.name;
        if (!it.price) it.price = p.price;
        it.status = (p.name || p.price) ? 'done' : 'failed';
      }).catch(function () {
        it.status = 'failed';
        setStatus('Could not load the text reader. Check your internet connection, or type the names and prices yourself.');
      }).then(function () {
        render();
        var left = items.filter(function (x) { return x.status === 'reading'; }).length;
        if (!left) setStatus('Done reading. Please check each name and price — the reader can make mistakes.');
        else setStatus('Reading screenshots… ' + left + ' left');
      });
    });
  }

  // ---------- Items ----------
  function addFiles(files) {
    var list = Array.prototype.slice.call(files).filter(function (f) { return /^image\//.test(f.type); });
    if (!list.length) { setStatus('Please choose screenshots or photos.'); return; }
    var room = MAX_ITEMS - items.length;
    if (room <= 0) { setStatus('You can add up to ' + MAX_ITEMS + ' products.'); return; }
    list = list.slice(0, room);
    var slots = new Array(list.length), pending = list.length, failed = false;
    setStatus('Loading ' + pending + ' image' + (pending > 1 ? 's' : '') + '…');
    function done() {
      if (--pending > 0) return;
      slots.forEach(function (it) { if (it) { items.push(it); readItem(it); } });
      render();
      setStatus(failed ? 'Some images could not be opened (HEIC photos may not work in every browser — screenshots are best).' : 'Reading screenshots… the first one takes a little longer.');
    }
    list.forEach(function (f, k) {
      var url = URL.createObjectURL(f);
      var img = new Image();
      img.onload = function () { slots[k] = { id: nextId++, url: url, img: img, name: '', price: 0, qty: 1, status: 'reading' }; done(); };
      img.onerror = function () { URL.revokeObjectURL(url); failed = true; done(); };
      img.src = url;
    });
  }

  function addManual() {
    if (items.length >= MAX_ITEMS) return;
    items.push({ id: nextId++, url: null, img: null, name: '', price: 0, qty: 1, status: 'manual' });
    render();
    var last = el.list.querySelector('.lm-row:last-child .lm-name');
    if (last) last.focus();
  }

  function removeItem(id) {
    items = items.filter(function (it) {
      if (it.id === id && it.url) URL.revokeObjectURL(it.url);
      return it.id !== id;
    });
    render();
  }

  // ---------- Totals ----------
  function totals() {
    var subtotal = 0, count = 0;
    items.forEach(function (it) { subtotal += (it.price || 0) * (it.qty || 0); count += it.qty || 0; });
    var eligible = subtotal >= REFUND_MIN && subtotal < REFUND_MAX;
    return {
      subtotal: subtotal, count: count, eligible: eligible,
      low: eligible ? subtotal * RATE_LOW : 0,
      high: eligible ? subtotal * RATE_HIGH : 0
    };
  }

  function renderReceipt() {
    var t = totals();
    el.rCount.textContent = t.count + ' item' + (t.count === 1 ? '' : 's');
    el.rSubtotal.textContent = won(t.subtotal);
    if (t.eligible) {
      el.rRefund.textContent = '− ' + won(t.low) + ' to ' + won(t.high);
      el.rPay.textContent = won(t.subtotal - t.high) + ' – ' + won(t.subtotal - t.low);
      el.rNote.textContent = 'Instant tax refund at the counter: about 5–8% of your total. Show your physical passport before you pay.';
    } else if (t.subtotal >= REFUND_MAX) {
      el.rRefund.textContent = 'Split your order';
      el.rPay.textContent = won(t.subtotal);
      el.rNote.textContent = 'The instant refund works on receipts under ₩1,000,000. Ask to split your purchase into separate receipts.';
    } else {
      el.rRefund.textContent = '—';
      el.rPay.textContent = won(t.subtotal);
      el.rNote.textContent = t.subtotal ? 'Add ' + won(REFUND_MIN - t.subtotal) + ' more to reach the ₩15,000 minimum for a tax refund.' : 'Add products to see your total.';
    }
    el.make.disabled = items.length === 0;
  }

  function render() {
    el.list.innerHTML = '';
    el.empty.hidden = items.length > 0;
    el.clear.hidden = items.length === 0;
    items.forEach(function (it, i) {
      var row = document.createElement('div');
      row.className = 'lm-row';

      var thumb = document.createElement('div');
      thumb.className = 'lm-rthumb';
      if (it.url) { var im = document.createElement('img'); im.src = it.url; im.alt = ''; thumb.appendChild(im); }
      else { thumb.textContent = i + 1; }
      row.appendChild(thumb);

      var main = document.createElement('div');
      main.className = 'lm-rmain';
      var nameId = 'lm-name-' + it.id, priceId = 'lm-price-' + it.id;
      var nl = document.createElement('label'); nl.className = 'visually-hidden'; nl.htmlFor = nameId; nl.textContent = 'Product ' + (i + 1) + ' name';
      var name = document.createElement('input');
      name.id = nameId; name.className = 'lm-name'; name.type = 'text'; name.maxLength = 80;
      name.placeholder = it.status === 'reading' ? 'Reading…' : 'Product name';
      name.value = it.name;
      name.addEventListener('input', function () { it.name = name.value; });
      main.appendChild(nl); main.appendChild(name);

      var line = document.createElement('div');
      line.className = 'lm-rline';
      var pl = document.createElement('label'); pl.className = 'visually-hidden'; pl.htmlFor = priceId; pl.textContent = 'Product ' + (i + 1) + ' price in won';
      var pwrap = document.createElement('span'); pwrap.className = 'lm-pwrap';
      var price = document.createElement('input');
      price.id = priceId; price.type = 'text'; price.inputMode = 'numeric'; price.className = 'lm-price';
      price.placeholder = 'Price';
      price.value = it.price ? it.price.toLocaleString('en-US') : '';
      var lineTotal = document.createElement('span'); lineTotal.className = 'lm-ltotal'; lineTotal.textContent = won(it.price * it.qty);
      price.addEventListener('input', function () {
        var v = parseInt(price.value.replace(/[^0-9]/g, ''), 10);
        it.price = isNaN(v) ? 0 : v;
        lineTotal.textContent = won(it.price * it.qty);
        renderReceipt();
      });
      price.addEventListener('blur', function () { price.value = it.price ? it.price.toLocaleString('en-US') : ''; });
      pwrap.appendChild(document.createTextNode('₩'));
      pwrap.appendChild(price);
      line.appendChild(pl); line.appendChild(pwrap);

      var qty = document.createElement('span'); qty.className = 'lm-qty';
      var minus = document.createElement('button'); minus.type = 'button'; minus.textContent = '−'; minus.setAttribute('aria-label', 'Decrease quantity of product ' + (i + 1));
      var q = document.createElement('output'); q.textContent = it.qty; q.setAttribute('aria-label', 'Quantity');
      var plus = document.createElement('button'); plus.type = 'button'; plus.textContent = '+'; plus.setAttribute('aria-label', 'Increase quantity of product ' + (i + 1));
      minus.disabled = it.qty <= 1;
      minus.addEventListener('click', function () { if (it.qty > 1) { it.qty--; q.textContent = it.qty; minus.disabled = it.qty <= 1; lineTotal.textContent = won(it.price * it.qty); renderReceipt(); } });
      plus.addEventListener('click', function () { if (it.qty < 99) { it.qty++; q.textContent = it.qty; minus.disabled = false; lineTotal.textContent = won(it.price * it.qty); renderReceipt(); } });
      qty.appendChild(minus); qty.appendChild(q); qty.appendChild(plus);
      line.appendChild(qty);
      line.appendChild(lineTotal);
      main.appendChild(line);

      if (it.status === 'failed') {
        var warn = document.createElement('span'); warn.className = 'lm-warn';
        warn.textContent = "Couldn't read this one — please type the name and price.";
        main.appendChild(warn);
      }
      row.appendChild(main);

      var rm = document.createElement('button');
      rm.type = 'button'; rm.className = 'lm-remove'; rm.textContent = '×';
      rm.setAttribute('aria-label', 'Remove product ' + (i + 1));
      rm.addEventListener('click', function () { removeItem(it.id); });
      row.appendChild(rm);

      el.list.appendChild(row);
    });
    renderReceipt();
  }

  // ---------- Export image ----------
  function fit(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    while (text.length && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
    return text + '…';
  }

  function makeImage() {
    if (!items.length) return;
    var t = totals();
    var W = 1080, pad = 56, rowH = 132, headH = 230;
    var footH = 330;
    var H = headH + items.length * rowH + footH;
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var ctx = c.getContext('2d');
    var sans = 'Inter, "Noto Sans KR", "Apple SD Gothic Neo", system-ui, sans-serif';

    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#0A5C8A'; ctx.fillRect(0, 0, W, 186);
    ctx.fillStyle = '#FFFFFF'; ctx.font = '700 46px ' + sans;
    ctx.fillText(fit(ctx, (el.title.value || 'My Olive Young list').trim(), W - pad * 2), pad, 80);
    ctx.font = '500 30px ' + sans;
    ctx.fillText('이 제품들을 찾고 있어요. 도와주세요!', pad, 128);
    ctx.font = '400 22px ' + sans; ctx.fillStyle = '#CFE3F0';
    ctx.fillText("I'm looking for these products · " + t.count + ' item' + (t.count === 1 ? '' : 's'), pad, 164);

    items.forEach(function (it, i) {
      var y = headH + i * rowH;
      ctx.fillStyle = i % 2 ? '#FFFFFF' : '#F6F8F9';
      ctx.fillRect(0, y - 16, W, rowH);
      ctx.fillStyle = '#0E1A24'; ctx.beginPath(); ctx.arc(pad + 18, y + 40, 18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.font = '700 18px ' + sans; ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), pad + 18, y + 47); ctx.textAlign = 'left';
      var tx = pad + 52, ts = 100;
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(tx, y - 6, ts, ts);
      ctx.strokeStyle = '#E4E9ED'; ctx.lineWidth = 2; ctx.strokeRect(tx, y - 6, ts, ts);
      if (it.img) {
        var s = Math.min((ts - 8) / it.img.naturalWidth, (ts - 8) / it.img.naturalHeight);
        var dw = it.img.naturalWidth * s, dh = it.img.naturalHeight * s;
        ctx.drawImage(it.img, tx + (ts - dw) / 2, y - 6 + (ts - dh) / 2, dw, dh);
      }
      var nx = tx + ts + 24, nw = W - pad - nx - 190;
      ctx.fillStyle = '#0E1A24'; ctx.font = '600 28px ' + sans;
      ctx.fillText(fit(ctx, it.name || 'Product ' + (i + 1), nw), nx, y + 30);
      ctx.fillStyle = '#4A5A66'; ctx.font = '400 24px ' + sans;
      ctx.fillText(it.qty + ' × ' + won(it.price || 0), nx, y + 72);
      ctx.fillStyle = '#0E1A24'; ctx.font = '700 28px ' + sans; ctx.textAlign = 'right';
      ctx.fillText(won((it.price || 0) * it.qty), W - pad, y + 30);
      ctx.textAlign = 'left';
    });

    var fy = headH + items.length * rowH + 10;
    ctx.strokeStyle = '#0E1A24'; ctx.setLineDash([10, 8]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pad, fy); ctx.lineTo(W - pad, fy); ctx.stroke(); ctx.setLineDash([]);
    function line(label, value, y, bold, color) {
      ctx.fillStyle = color || '#0E1A24'; ctx.font = (bold ? '700 34px ' : '400 26px ') + sans;
      ctx.fillText(label, pad, y); ctx.textAlign = 'right'; ctx.fillText(value, W - pad, y); ctx.textAlign = 'left';
    }
    line('Total', won(t.subtotal), fy + 56, true);
    if (t.eligible) {
      line('Est. instant tax refund (5–8%)', '− ' + won(t.low) + ' ~ ' + won(t.high), fy + 106, false, '#0A5C8A');
      line('You pay after refund', won(t.subtotal - t.high) + ' ~ ' + won(t.subtotal - t.low), fy + 162, true);
    } else {
      line('Tax refund', t.subtotal >= REFUND_MAX ? 'Split into receipts under ₩1,000,000' : 'Needs ₩15,000+ on one receipt', fy + 106, false, '#55656F');
    }
    ctx.fillStyle = '#55656F'; ctx.font = '400 21px ' + sans;
    ctx.fillText('Prices from screenshots — check in store. Show your passport before paying: 택스 리펀드 해 주세요.', pad, fy + 222);
    ctx.fillText('Made with Local Busan · localbusan.pages.dev', pad, fy + 266);

    c.toBlob(function (blob) {
      lastBlob = blob;
      if (el.resultImg.src) URL.revokeObjectURL(el.resultImg.src);
      el.resultImg.src = URL.createObjectURL(blob);
      el.result.hidden = false;
      var file = new File([blob], 'olive-young-list.png', { type: 'image/png' });
      el.share.hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
      el.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 'image/png');
  }

  function download() {
    if (!lastBlob) return;
    var a = document.createElement('a');
    a.href = URL.createObjectURL(lastBlob); a.download = 'olive-young-list.png';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function share() {
    if (!lastBlob) return;
    navigator.share({ files: [new File([lastBlob], 'olive-young-list.png', { type: 'image/png' })], title: 'My Olive Young list' }).catch(function () {});
  }

  document.addEventListener('DOMContentLoaded', function () {
    ['files', 'drop', 'list', 'empty', 'title', 'make', 'clear', 'add', 'result', 'resultImg', 'download', 'share', 'status', 'rCount', 'rSubtotal', 'rRefund', 'rPay', 'rNote'].forEach(function (k) {
      el[k] = $('lm-' + k.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); }));
    });
    if (!el.files) return;
    el.files.addEventListener('change', function () { addFiles(el.files.files); el.files.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { el.drop.addEventListener(ev, function (e) { e.preventDefault(); el.drop.classList.add('is-over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { el.drop.addEventListener(ev, function (e) { e.preventDefault(); el.drop.classList.remove('is-over'); }); });
    el.drop.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files); });
    el.add.addEventListener('click', addManual);
    el.make.addEventListener('click', makeImage);
    el.clear.addEventListener('click', function () {
      items.forEach(function (it) { if (it.url) URL.revokeObjectURL(it.url); });
      items = []; el.result.hidden = true; setStatus(''); render();
    });
    el.download.addEventListener('click', download);
    el.share.addEventListener('click', share);
    render();
  });

  window.__lmParse = parseText; // used by tests
})();
