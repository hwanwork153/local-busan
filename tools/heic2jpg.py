"""Minimal HEIC (iPhone grid) -> JPG converter using ffmpeg's HEVC decoder.
Usage: python3 heic2jpg.py input.heic output.jpg
"""
import struct, sys, subprocess, tempfile, os
from PIL import Image

data = open(sys.argv[1], 'rb').read()


def boxes(buf, start, end):
    i = start
    while i < end:
        size, typ = struct.unpack('>I4s', buf[i:i + 8])
        hdr = 8
        if size == 1:
            size = struct.unpack('>Q', buf[i + 8:i + 16])[0]; hdr = 16
        elif size == 0:
            size = end - i
        yield typ.decode('latin1'), i + hdr, i + size
        i += size


def find(buf, start, end, name):
    for t, s, e in boxes(buf, start, end):
        if t == name:
            return s, e
    return None

meta = find(data, 0, len(data), 'meta')
ms, me = meta[0] + 4, meta[1]  # full box
sub = {t: (s, e) for t, s, e in boxes(data, ms, me)}

# pitm
s, e = sub['pitm']
version = data[s]
primary = struct.unpack('>H', data[s + 4:s + 6])[0] if version == 0 else struct.unpack('>I', data[s + 4:s + 8])[0]

# iinf
s, e = sub['iinf']
v = data[s]
off = s + 4 + (2 if v == 0 else 4)
items = {}
for t, bs, be in boxes(data, off, e):
    v2 = data[bs]
    if v2 >= 2:
        if v2 == 2:
            iid = struct.unpack('>H', data[bs + 4:bs + 6])[0]; p = bs + 8
        else:
            iid = struct.unpack('>I', data[bs + 4:bs + 8])[0]; p = bs + 10
        itype = data[p:p + 4].decode('latin1')
        items[iid] = itype

# iloc
s, e = sub['iloc']
v = data[s]
p = s + 4
b1, b2 = data[p], data[p + 1]; p += 2
off_size, len_size, base_size = b1 >> 4, b1 & 15, b2 >> 4
idx_size = (b2 & 15) if v in (1, 2) else 0
cnt = struct.unpack('>H', data[p:p + 2])[0] if v < 2 else struct.unpack('>I', data[p:p + 4])[0]
p += 2 if v < 2 else 4


def rd(n):
    global p
    if n == 0:
        return 0
    val = int.from_bytes(data[p:p + n], 'big'); p += n
    return val

locs = {}
for _ in range(cnt):
    iid = rd(2) if v < 2 else rd(4)
    method = 0
    if v in (1, 2):
        method = rd(2) & 15
    rd(2)  # data ref index
    base = rd(base_size)
    ext = rd(2)
    exts = []
    for _ in range(ext):
        if idx_size:
            rd(idx_size)
        eo = rd(off_size); el = rd(len_size)
        exts.append((base + eo, el))
    locs[iid] = (method, exts)

idat = sub.get('idat')


def item_data(iid):
    method, exts = locs[iid]
    out = b''
    for o, l in exts:
        if method == 1:
            out += data[idat[0] + o: idat[0] + o + l]
        else:
            out += data[o:o + l]
    return out

# iref dimg
refs = {}
if 'iref' in sub:
    s, e = sub['iref']
    v = data[s]
    for t, bs, be in boxes(data, s + 4, e):
        q = bs
        w = 2 if v == 0 else 4
        frm = int.from_bytes(data[q:q + w], 'big'); q += w
        n = struct.unpack('>H', data[q:q + 2])[0]; q += 2
        to = [int.from_bytes(data[q + k * w:q + (k + 1) * w], 'big') for k in range(n)]
        refs.setdefault(t, {})[frm] = to

# iprp
s, e = sub['iprp']
ipco = find(data, s, e, 'ipco')
props = [(t, bs, be) for t, bs, be in boxes(data, ipco[0], ipco[1])]
ipma = find(data, s, e, 'ipma')
q = ipma[0]
v = data[q]; flags = int.from_bytes(data[q + 1:q + 4], 'big'); q += 4
n = struct.unpack('>I', data[q:q + 4])[0]; q += 4
assoc = {}
for _ in range(n):
    if v < 1:
        iid = struct.unpack('>H', data[q:q + 2])[0]; q += 2
    else:
        iid = struct.unpack('>I', data[q:q + 4])[0]; q += 4
    c = data[q]; q += 1
    lst = []
    for _ in range(c):
        if flags & 1:
            val = struct.unpack('>H', data[q:q + 2])[0] & 0x7fff; q += 2
        else:
            val = data[q] & 0x7f; q += 1
        lst.append(val)
    assoc[iid] = lst


def prop(iid, name):
    for idx in assoc.get(iid, []):
        t, bs, be = props[idx - 1]
        if t == name:
            return bs, be
    return None


def hvcc_headers(iid):
    bs, be = prop(iid, 'hvcC')
    q = bs + 22
    narr = data[q]; q += 1
    out = b''
    for _ in range(narr):
        q += 1
        nn = struct.unpack('>H', data[q:q + 2])[0]; q += 2
        for _ in range(nn):
            l = struct.unpack('>H', data[q:q + 2])[0]; q += 2
            out += b'\x00\x00\x00\x01' + data[q:q + l]; q += l
    return out


def annexb(raw):
    out = b''; q = 0
    while q < len(raw):
        l = struct.unpack('>I', raw[q:q + 4])[0]; q += 4
        out += b'\x00\x00\x00\x01' + raw[q:q + l]; q += l
    return out


def decode(iid, tmp):
    path = os.path.join(tmp, f'{iid}.hevc')
    open(path, 'wb').write(hvcc_headers(iid) + annexb(item_data(iid)))
    png = path + '.png'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path, '-frames:v', '1', png], check=True)
    return Image.open(png).convert('RGB')

with tempfile.TemporaryDirectory() as tmp:
    if items[primary] == 'grid':
        g = item_data(primary)
        flag = g[1]
        rows, cols = g[2] + 1, g[3] + 1
        if flag & 1:
            W, H = struct.unpack('>II', g[4:12])
        else:
            W, H = struct.unpack('>HH', g[4:8])
        tiles = [decode(t, tmp) for t in refs['dimg'][primary]]
        tw, th = tiles[0].size
        img = Image.new('RGB', (tw * cols, th * rows))
        for k, t in enumerate(tiles):
            img.paste(t, ((k % cols) * tw, (k // cols) * th))
        img = img.crop((0, 0, W, H))
    else:
        img = decode(primary, tmp)
    rot = prop(primary, 'irot')
    if rot:
        angle = (data[rot[0]] & 3) * 90
        if angle:
            img = img.rotate(angle, expand=True)
    img.save(sys.argv[2], quality=90)
    print('saved', img.size)
