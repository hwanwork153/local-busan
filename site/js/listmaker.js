// Shopping list image maker. Everything runs in the browser: photos are never uploaded.
(function () {
  var items = []; // {img: HTMLImageElement, url, note}
  var fileInput, grid, empty, titleInput, makeBtn, clearBtn, result, resultImg, dlBtn, shareBtn, status;
  var lastBlob = null;

  function $(id) { return document.getElementById(id); }

  function setStatus(msg) { status.textContent = msg || ''; }

  function render() {
    grid.innerHTML = '';
    empty.hidden = items.length > 0;
    makeBtn.disabled = items.length === 0;
    clearBtn.hidden = items.length === 0;
    items.forEach(function (it, i) {
      var card = document.createElement('div');
      card.className = 'lm-item';
      var top = document.createElement('div');
      top.className = 'lm-thumb';
      var num = document.createElement('span');
      num.className = 'lm-num';
      num.textContent = i + 1;
      var img = document.createElement('img');
      img.src = it.url;
      img.alt = 'Product ' + (i + 1);
      top.appendChild(img);
      top.appendChild(num);
      card.appendChild(top);

      var label = document.createElement('label');
      label.className = 'visually-hidden';
      label.htmlFor = 'lm-note-' + i;
      label.textContent = 'Note for product ' + (i + 1);
      var note = document.createElement('input');
      note.type = 'text';
      note.id = 'lm-note-' + i;
      note.placeholder = 'Note (e.g. x2, shade 21)';
      note.maxLength = 40;
      note.value = it.note;
      note.addEventListener('input', function () { it.note = note.value; });
      card.appendChild(label);
      card.appendChild(note);

      var row = document.createElement('div');
      row.className = 'lm-actions';
      row.appendChild(btn('←', 'Move product ' + (i + 1) + ' earlier', i === 0, function () { move(i, -1); }));
      row.appendChild(btn('→', 'Move product ' + (i + 1) + ' later', i === items.length - 1, function () { move(i, 1); }));
      row.appendChild(btn('Remove', 'Remove product ' + (i + 1), false, function () { remove(i); }));
      card.appendChild(row);
      grid.appendChild(card);
    });
  }

  function btn(text, aria, disabled, fn) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'lm-mini';
    b.textContent = text;
    b.setAttribute('aria-label', aria);
    b.disabled = disabled;
    b.addEventListener('click', fn);
    return b;
  }

  function move(i, d) {
    var j = i + d;
    var t = items[i]; items[i] = items[j]; items[j] = t;
    render();
  }

  function remove(i) {
    URL.revokeObjectURL(items[i].url);
    items.splice(i, 1);
    render();
  }

  function addFiles(files) {
    var list = Array.prototype.slice.call(files).filter(function (f) { return /^image\//.test(f.type); });
    if (!list.length) { setStatus('Please choose image files (screenshots or photos).'); return; }
    var room = 30 - items.length;
    if (room <= 0) { setStatus('You can add up to 30 products.'); return; }
    list = list.slice(0, room);
    var pending = list.length;
    setStatus('Adding ' + pending + ' image' + (pending > 1 ? 's' : '') + '…');
    var slots = new Array(list.length), failed = false;
    function done() {
      if (--pending > 0) return;
      slots.forEach(function (it) { if (it) items.push(it); });
      setStatus(failed ? 'Some images could not be read (HEIC photos may not work in every browser — screenshots are best).' : '');
      render();
    }
    list.forEach(function (f, k) {
      var url = URL.createObjectURL(f);
      var img = new Image();
      img.onload = function () { slots[k] = { img: img, url: url, note: '' }; done(); };
      img.onerror = function () { URL.revokeObjectURL(url); failed = true; done(); };
      img.src = url;
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function wrapText(ctx, text, maxW) {
    // Keeps one line; trims with an ellipsis if too long.
    if (ctx.measureText(text).width <= maxW) return text;
    while (text.length && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
    return text + '…';
  }

  function makeImage() {
    if (!items.length) return;
    var W = 1080, pad = 48, gap = 24;
    var cols = items.length <= 4 ? 2 : 3;
    var cellW = Math.floor((W - pad * 2 - gap * (cols - 1)) / cols);
    var imgH = cellW; // square image area
    var noteH = 56;
    var cellH = imgH + noteH;
    var rows = Math.ceil(items.length / cols);
    var headH = 210;
    var footH = 90;
    var H = headH + rows * cellH + (rows - 1) * gap + footH + pad;

    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var ctx = c.getContext('2d');
    var sans = 'Inter, "Noto Sans KR", "Apple SD Gothic Neo", system-ui, sans-serif';

    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);
    // header band
    ctx.fillStyle = '#0A5C8A'; ctx.fillRect(0, 0, W, 170);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 46px ' + sans;
    ctx.fillText(wrapText(ctx, (titleInput.value || 'My Olive Young list').trim(), W - pad * 2), pad, 78);
    ctx.font = '500 30px ' + sans;
    ctx.fillText('이 제품들을 찾고 있어요. 도와주세요!', pad, 126);
    ctx.font = '400 22px ' + sans;
    ctx.fillStyle = '#CFE3F0';
    ctx.fillText("I'm looking for these products · " + items.length + ' item' + (items.length > 1 ? 's' : ''), pad, 158);

    items.forEach(function (it, i) {
      var col = i % cols, row = Math.floor(i / cols);
      var x = pad + col * (cellW + gap);
      var y = headH + row * (cellH + gap);
      // card
      ctx.save();
      roundRect(ctx, x, y, cellW, cellH, 18);
      ctx.fillStyle = '#F6F8F9'; ctx.fill();
      ctx.strokeStyle = '#E4E9ED'; ctx.lineWidth = 2; ctx.stroke();
      ctx.clip();
      // image, contain
      var iw = it.img.naturalWidth, ih = it.img.naturalHeight;
      var s = Math.min((cellW - 16) / iw, (imgH - 16) / ih);
      var dw = iw * s, dh = ih * s;
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x, y, cellW, imgH);
      ctx.drawImage(it.img, x + (cellW - dw) / 2, y + (imgH - dh) / 2, dw, dh);
      ctx.restore();
      // number badge
      ctx.fillStyle = '#0E1A24';
      ctx.beginPath(); ctx.arc(x + 30, y + 30, 22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.font = '700 22px ' + sans; ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), x + 30, y + 38);
      ctx.textAlign = 'left';
      // note
      ctx.fillStyle = '#0E1A24'; ctx.font = '600 24px ' + sans;
      var note = (it.note || '').trim();
      ctx.fillText(wrapText(ctx, note ? note : '☐', cellW - 28), x + 14, y + imgH + 37);
    });

    // footer
    ctx.fillStyle = '#55656F'; ctx.font = '400 22px ' + sans;
    ctx.fillText('Made with Local Busan · localbusan.pages.dev', pad, H - pad + 6);

    c.toBlob(function (blob) {
      lastBlob = blob;
      if (resultImg.src) URL.revokeObjectURL(resultImg.src);
      resultImg.src = URL.createObjectURL(blob);
      result.hidden = false;
      shareBtn.hidden = !(navigator.canShare && navigator.canShare({ files: [new File([blob], 'olive-young-list.png', { type: 'image/png' })] }));
      result.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setStatus('Your list image is ready.');
    }, 'image/png');
  }

  function download() {
    if (!lastBlob) return;
    var a = document.createElement('a');
    a.href = URL.createObjectURL(lastBlob);
    a.download = 'olive-young-list.png';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function share() {
    if (!lastBlob) return;
    var file = new File([lastBlob], 'olive-young-list.png', { type: 'image/png' });
    navigator.share({ files: [file], title: 'My Olive Young list' }).catch(function () {});
  }

  document.addEventListener('DOMContentLoaded', function () {
    fileInput = $('lm-files'); grid = $('lm-grid'); empty = $('lm-empty'); titleInput = $('lm-title');
    makeBtn = $('lm-make'); clearBtn = $('lm-clear'); result = $('lm-result'); resultImg = $('lm-result-img');
    dlBtn = $('lm-download'); shareBtn = $('lm-share'); status = $('lm-status');
    if (!fileInput) return;
    fileInput.addEventListener('change', function () { addFiles(fileInput.files); fileInput.value = ''; });
    var drop = $('lm-drop');
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('is-over'); }); });
    drop.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files); });
    makeBtn.addEventListener('click', makeImage);
    clearBtn.addEventListener('click', function () { items.forEach(function (it) { URL.revokeObjectURL(it.url); }); items = []; result.hidden = true; render(); });
    dlBtn.addEventListener('click', download);
    shareBtn.addEventListener('click', share);
    render();
  });
})();
