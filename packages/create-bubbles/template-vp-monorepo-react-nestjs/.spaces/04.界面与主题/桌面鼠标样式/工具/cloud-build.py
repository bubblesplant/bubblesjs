"""将用户选定的棉花云朵造型导出为标准 Windows CUR/ANI 和真实资源预览。"""

from pathlib import Path
import ctypes
from ctypes import wintypes
import hashlib
import json
import math
import runpy
import struct
import zipfile

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
UI = ROOT / 'ui'
PACKAGE = ROOT / '指针包' / 'cotton-cloud'
CURSORS = PACKAGE / 'cursors'
EVIDENCE = ROOT / '测试证据'
SOURCE = runpy.run_path(str(Path(__file__).with_name('cute-render.py')))
THEME = next(t for t in SOURCE['THEMES'] if t['key'] == 'cloud')
SIZE = SOURCE['SIZE']
SCALE = SOURCE['S']
SIZES = (32, 48, 64, 96, 128)
FRAME_COUNT = 24
JIFFIES = 4
ROLES = [
    ('Arrow', 'normal.cur', '正常选择', (20, 13)),
    ('Help', 'help.cur', '帮助选择', (20, 13)),
    ('AppStarting', 'working.ani', '后台运行', (14.375, 9.34375)),
    ('Wait', 'busy.ani', '忙碌', (64, 64)),
    ('Crosshair', 'precision.cur', '精确选择', (64, 64)),
    ('IBeam', 'text.cur', '文本选择', (64, 64)),
    ('NWPen', 'handwriting.cur', '手写', (27, 101)),
    ('No', 'unavailable.cur', '不可用', (64, 64)),
    ('SizeNS', 'resize-ns.cur', '纵向缩放', (64, 64)),
    ('SizeWE', 'resize-we.cur', '横向缩放', (64, 64)),
    ('SizeNWSE', 'resize-nwse.cur', '斜向缩放 ↖↘', (64, 64)),
    ('SizeNESW', 'resize-nesw.cur', '斜向缩放 ↗↙', (64, 64)),
    ('SizeAll', 'move.cur', '移动', (64, 64)),
    ('UpArrow', 'alternate.cur', '候选选择', (64, 15)),
    ('Hand', 'link.cur', '链接选择', (51, 11)),
    ('Pin', 'location.cur', '位置选择', (64, 108)),
    ('Person', 'person.cur', '人员选择', (20, 13)),
]


def blank():
    return Image.new('RGBA', (SIZE, SIZE))


def shape(im, path, fill=None, width=2.25):
    SOURCE['blob'](im, path, THEME, fill, width)


def busy_frame(frame):
    """旋转星轨并固定月亮，保持中心热点不随帧移动。"""
    im = blank()
    draw = ImageDraw.Draw(im)
    angle = frame * 360 / FRAME_COUNT
    box = tuple(round(v * SCALE) for v in (28, 28, 100, 100))
    for fill, width in [('#FFFFFF', 15), (THEME['edge'], 11), (THEME['bottom'], 7)]:
        draw.arc(box, 32 + angle, 335 + angle, fill=fill, width=round(width * SCALE))
    shape(im, 'M 64 41 C 46 42 43 65 53 74 C 64 86 83 75 83 64 C 70 69 59 57 64 41 Z', '#FFF0BE', 1.4)
    phase = math.radians(30 + angle)
    SOURCE['star'](im, THEME, 64 + 36 * math.cos(phase), 64 + 36 * math.sin(phase), 7.5, '#F3DDA6')
    return im


def asset(role, frame=0):
    """复用选定概念造型，并为缺少的 Windows 角色补齐同一色板的形态。"""
    direct = {'Arrow': 'arrow', 'Hand': 'hand', 'IBeam': 'text', 'No': 'no', 'SizeAll': 'move', 'SizeNESW': 'resize'}
    if role in direct:
        return SOURCE['icon'](direct[role], THEME)
    if role == 'Wait':
        return busy_frame(frame)
    if role == 'AppStarting':
        im = blank()
        im.alpha_composite(asset('Arrow').resize((460, 460), Image.Resampling.LANCZOS), (0, 0))
        im.alpha_composite(busy_frame(frame).resize((300, 300), Image.Resampling.LANCZOS), (335, 338))
        return im
    if role == 'SizeNWSE':
        return asset('SizeNESW').transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    im = blank()
    if role in ('Help', 'Person'):
        im.alpha_composite(asset('Arrow'))
        if role == 'Help':
            SOURCE['ellipse'](im, (83, 76, 120, 113), '#FFF0BE', THEME['edge'], 1.7)
            SOURCE['curve'](im, 'M 95 87 C 98 80 112 83 109 90 Q 107 94 102 96 L 102 99', THEME['edge'], 2.6)
            SOURCE['ellipse'](im, (100.5, 103, 103.5, 106), THEME['edge'])
        else:
            SOURCE['ellipse'](im, (96, 80, 108, 92), '#FFF0BE', THEME['edge'], 1.5)
            shape(im, 'M 88 111 Q 87 95 102 95 Q 117 95 116 111 Z', '#FFF0BE', 1.5)
    elif role == 'Crosshair':
        for path in ['M 64 17 L 64 48', 'M 64 80 L 64 111', 'M 17 64 L 48 64', 'M 80 64 L 111 64']:
            SOURCE['curve'](im, path, '#FFFFFF', 6)
            SOURCE['curve'](im, path, THEME['edge'], 2.2)
        SOURCE['ellipse'](im, (54, 54, 74, 74), THEME['top'], THEME['edge'], 1.8)
        SOURCE['ellipse'](im, (62, 62, 66, 66), THEME['pink'])
    elif role == 'NWPen':
        shape(im, 'M 27 101 L 37 75 L 87 25 Q 93 19 99 25 L 104 30 Q 110 36 104 42 L 54 92 Z', None, 2.2)
        shape(im, 'M 27 101 L 37 75 L 54 92 Z', '#FFF0BE', 1.4)
        SOURCE['curve'](im, 'M 83 29 L 101 47', THEME['accent'], 3)
        SOURCE['curve'](im, 'M 46 76 L 88 34', '#FFFFFF', 2.5)
        SOURCE['star'](im, THEME, 28, 39, 7)
    elif role in ('SizeNS', 'SizeWE'):
        shape(im, 'M 64 15 L 83 37 Q 85 41 79 41 L 71 41 L 71 87 L 79 87 Q 85 87 83 91 L 64 113 L 45 91 Q 43 87 49 87 L 57 87 L 57 41 L 49 41 Q 43 41 45 37 Z', None, 2.2)
        SOURCE['ellipse'](im, (59, 59, 69, 69), THEME['pink'])
        if role == 'SizeWE':
            im = im.transpose(Image.Transpose.ROTATE_90)
    elif role == 'UpArrow':
        shape(im, 'M 64 15 L 97 51 Q 100 56 93 56 L 76 56 L 76 105 Q 76 110 70 110 L 58 110 Q 52 110 52 105 L 52 56 L 35 56 Q 28 56 31 51 Z', None, 2.2)
        SOURCE['star'](im, THEME, 64, 78, 7)
    elif role == 'Pin':
        shape(im, 'M 64 108 C 54 91 30 72 32 48 C 33 16 94 16 96 48 C 98 71 75 91 64 108 Z', None, 2.2)
        SOURCE['face'](im, THEME, 64, 51, True)
        SOURCE['star'](im, THEME, 64, 80, 7)
    else:
        raise ValueError(role)
    return im


def dib_bytes(im):
    """编码直通透明度的 bottom-up BGRA DIB，由 Windows 加载器处理透明混合。"""
    width, height = im.size
    header = struct.pack('<IiiHHIIiiII', 40, width, height * 2, 1, 32, 0, width * height * 4, 0, 0, 0, 0)
    xor = im.transpose(Image.Transpose.FLIP_TOP_BOTTOM).tobytes('raw', 'BGRA')
    stride = ((width + 31) // 32) * 4
    alpha = im.getchannel('A')
    mask = bytearray(stride * height)
    for y in range(height):
        for x in range(width):
            if alpha.getpixel((x, height - 1 - y)) == 0:
                mask[y * stride + x // 8] |= 0x80 >> (x % 8)
    return header + xor + mask


def cur_bytes(im, hotspot, sizes=SIZES):
    """清除缩小产生的极淡振铃，再写入五种尺寸及各自缩放后的热点。"""
    entries, payloads = [], []
    offset = 6 + 16 * len(sizes)
    for size in sizes:
        small = im.resize((size, size), Image.Resampling.LANCZOS)
        small.putalpha(small.getchannel('A').point(lambda value: 0 if value <= 4 else value))
        payload = dib_bytes(small)
        hx, hy = (min(size - 1, round(v * size / 128)) for v in hotspot)
        entries.append(struct.pack('<BBBBHHII', size, size, 0, 0, hx, hy, len(payload), offset))
        payloads.append(payload)
        offset += len(payload)
    return struct.pack('<HHH', 0, 2, len(sizes)) + b''.join(entries) + b''.join(payloads)


def chunk(tag, payload):
    return tag + struct.pack('<I', len(payload)) + payload + (b'\0' if len(payload) % 2 else b'')


def ani_bytes(frames):
    """封装标准 RIFF ACON，所有步骤同长并顺序循环播放。"""
    header = struct.pack('<9I', 36, len(frames), len(frames), 128, 128, 32, 1, JIFFIES, 1)
    body = b'ACON' + chunk(b'anih', header)
    body += chunk(b'LIST', b'fram' + b''.join(chunk(b'icon', frame) for frame in frames))
    return b'RIFF' + struct.pack('<I', len(body)) + body


def decode_cur(data, sizes=SIZES):
    """独立还原每个 DIB 帧并检查目录、热点、长度和透明蒙版一致性。"""
    reserved, kind, count = struct.unpack_from('<HHH', data)
    assert (reserved, kind, count) == (0, 2, len(sizes))
    result = {}
    for i in range(count):
        w, h, colors, res, hx, hy, length, offset = struct.unpack_from('<BBBBHHII', data, 6 + i * 16)
        assert colors == res == 0 and 0 <= hx < w and 0 <= hy < h
        assert offset >= 6 + count * 16 and offset + length <= len(data)
        info = struct.unpack_from('<IiiHHIIiiII', data, offset)
        assert info[:6] == (40, w, h * 2, 1, 32, 0)
        stride = ((w + 31) // 32) * 4
        assert length == 40 + w * h * 4 + stride * h
        raw = data[offset + 40:offset + 40 + w * h * 4]
        im = Image.frombytes('RGBA', (w, h), raw, 'raw', 'BGRA').transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        alpha = im.getchannel('A')
        assert alpha.getextrema()[1] == 255 and alpha.getextrema()[0] == 0
        mask = data[offset + 40 + w * h * 4:offset + length]
        for y in range(h):
            for x in range(w):
                bit = bool(mask[(h - 1 - y) * stride + x // 8] & (0x80 >> (x % 8)))
                assert bit == (alpha.getpixel((x, y)) == 0)
        assert alpha.crop((0, 0, w, 1)).getextrema()[1] == 0
        assert alpha.crop((0, h - 1, w, h)).getextrema()[1] == 0
        assert alpha.crop((0, 0, 1, h)).getextrema()[1] == 0
        assert alpha.crop((w - 1, 0, w, h)).getextrema()[1] == 0
        result[w] = (im, (hx, hy))
    assert set(result) == set(sizes)
    return result


def riff_chunks(data, start, end):
    """按 RIFF 偶数字节填充规则遍历块并拒绝越界。"""
    offset = start
    while offset < end:
        tag, length = struct.unpack_from('<4sI', data, offset)
        begin = offset + 8
        assert begin + length <= end
        yield tag, data[begin:begin + length]
        offset = begin + length + (length % 2)
    assert offset == end


def decode_ani(data):
    """检查 ANI 时序及各帧热点不变，返回真实文件中的 CUR 画面。"""
    assert data[:4] == b'RIFF' and data[8:12] == b'ACON'
    assert struct.unpack_from('<I', data, 4)[0] + 8 == len(data)
    header, frames = None, []
    for tag, payload in riff_chunks(data, 12, len(data)):
        if tag == b'anih':
            header = struct.unpack('<9I', payload)
        elif tag == b'LIST' and payload[:4] == b'fram':
            frames = [decode_cur(frame, (128,)) for kind, frame in riff_chunks(payload, 4, len(payload)) if kind == b'icon']
    assert header == (36, FRAME_COUNT, FRAME_COUNT, 128, 128, 32, 1, JIFFIES, 1)
    assert len(frames) == FRAME_COUNT
    for frame in frames:
        source, hotspot = frame[128]
        for size in SIZES[:-1]:
            frame[size] = (source.resize((size, size), Image.Resampling.LANCZOS),
                           tuple((value * size + 64) // 128 for value in hotspot))
    for size in SIZES:
        assert len({frame[size][1] for frame in frames}) == 1
        assert len({hashlib.sha256(frame[size][0].tobytes()).hexdigest() for frame in frames}) >= 12
    return frames


class IconInfo(ctypes.Structure):
    _fields_ = [('fIcon', wintypes.BOOL), ('xHotspot', wintypes.DWORD), ('yHotspot', wintypes.DWORD),
                ('hbmMask', wintypes.HBITMAP), ('hbmColor', wintypes.HBITMAP)]


def native_load(path, expected):
    """只在内存中加载及释放指针，检查 Windows 对所有尺寸及热点的实际解析。"""
    user = ctypes.WinDLL('user32', use_last_error=True)
    gdi = ctypes.WinDLL('gdi32', use_last_error=True)
    user.LoadImageW.argtypes = [wintypes.HINSTANCE, wintypes.LPCWSTR, wintypes.UINT, ctypes.c_int, ctypes.c_int, wintypes.UINT]
    user.LoadImageW.restype = wintypes.HANDLE
    user.GetIconInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(IconInfo)]
    user.GetIconInfo.restype = wintypes.BOOL
    user.DestroyCursor.argtypes = [wintypes.HANDLE]
    gdi.DeleteObject.argtypes = [wintypes.HANDLE]
    results = []
    for size in SIZES:
        handle = user.LoadImageW(None, str(path), 2, size, size, 0x10)
        if not handle:
            raise ctypes.WinError(ctypes.get_last_error())
        info = IconInfo()
        try:
            if not user.GetIconInfo(handle, ctypes.byref(info)):
                raise ctypes.WinError(ctypes.get_last_error())
            actual = (info.xHotspot, info.yHotspot)
            assert actual == expected[size][1], (path.name, size, actual, expected[size][1])
            assert not info.fIcon
            results.append(dict(size=size, hotspot=list(actual), loaded=True))
        finally:
            if info.hbmMask:
                gdi.DeleteObject(info.hbmMask)
            if info.hbmColor:
                gdi.DeleteObject(info.hbmColor)
            user.DestroyCursor(handle)
    return results


def make_preview(decoded):
    """以实际资源帧排版完整状态及原尺寸对照，不使用概念板截图。"""
    board = Image.new('RGBA', (1600, 1320), '#F8F8FC')
    draw = ImageDraw.Draw(board)
    font = SOURCE['font']
    ink, edge = '#584B65', THEME['edge']
    draw.text((64, 34), '已选方案 03 / Windows 指针包', font=font(18), fill=edge)
    draw.text((60, 72), '棉花云朵', font=font(50, True), fill=ink)
    draw.text((64, 147), '雾紫云朵 · 星月点缀 · 忙碌时星轨缓缓转动', font=font(22), fill=edge)
    draw.rounded_rectangle((64, 206, 870, 498), radius=30, fill='#EDEBF6')
    for role, x in [('Arrow', 120), ('Hand', 385), ('Wait', 625)]:
        board.alpha_composite(decoded[role][128][0].resize((230, 230), Image.Resampling.NEAREST), (x, 232))
    for bg, box, y in [('#FFFFFF', (900, 206, 1536, 340), 243), ('#33344C', (900, 364, 1536, 498), 402)]:
        draw = ImageDraw.Draw(board)
        draw.rounded_rectangle(box, radius=25, fill=bg)
        for i, role in enumerate(['Arrow', 'Hand', 'IBeam', 'Wait', 'SizeAll', 'No']):
            board.alpha_composite(decoded[role][64][0], (946 + i * 94, y))
    draw = ImageDraw.Draw(board)
    draw.text((64, 524), '17 个常用状态', font=font(25, True), fill=ink)
    draw.text((1114, 533), '预览由实际 CUR / ANI 文件解码', font=font(16), fill=edge)
    for i, (role, _, label, _) in enumerate(ROLES):
        x, y = 64 + (i % 9) * 165, 582 + (i // 9) * 200
        draw.rounded_rectangle((x, y, x + 150, y + 180), radius=20, fill='#FFFFFF', outline='#E6E3EF')
        board.alpha_composite(decoded[role][96][0], (x + 27, y + 16))
        draw = ImageDraw.Draw(board)
        text = label.replace(' ↖↘', '').replace(' ↗↙', '')
        if role == 'SizeNWSE':
            text = '斜向缩放 1'
        if role == 'SizeNESW':
            text = '斜向缩放 2'
        SOURCE['centered'](draw, x + 75, y + 136, text, 16, edge)
    draw.rounded_rectangle((64, 998, 1536, 1240), radius=26, fill='#EDEBF6')
    draw.text((86, 1016), '实际画布尺寸', font=font(23, True), fill=ink)
    draw.text((86, 1062), '上排 32 px', font=font(17), fill=edge)
    draw.text((86, 1142), '下排 48 px', font=font(17), fill=edge)
    draw.text((86, 1190), '原图 100% 查看', font=font(15), fill=edge)
    for bg, x in [('#FFFFFF', 365), ('#33344C', 963)]:
        draw.rounded_rectangle((x, 1014, x + 550, 1223), radius=20, fill=bg)
        for i, role in enumerate(['Arrow', 'Hand', 'IBeam', 'Wait', 'SizeAll', 'SizeNESW', 'No']):
            board.alpha_composite(decoded[role][32][0], (x + 36 + i * 71, 1063))
            board.alpha_composite(decoded[role][48][0], (x + 28 + i * 71, 1140))
    draw = ImageDraw.Draw(board)
    draw.text((64, 1270), '32 / 48 / 64 / 96 / 128 px · 两种 24 帧动画 · 安装前备份 · 支持恢复', font=font(17), fill=edge)
    target = UI / 'cloud-cursors-preview.png'
    board.convert('RGB').save(target, optimize=True)
    with Image.open(target) as verified:
        verified.load()
    return target


def make_animation(frames):
    """直接从 ANI 解码帧输出 GIF，使交付预览与安装动画一致。"""
    result = []
    for i in range(FRAME_COUNT):
        board = Image.new('RGBA', (900, 380), '#F8F8FC')
        draw = ImageDraw.Draw(board)
        draw.text((42, 28), '棉花云朵 · 星轨动画', font=SOURCE['font'](28, True), fill='#584B65')
        for role, x, label in [('Wait', 175, '忙碌'), ('AppStarting', 565, '后台运行')]:
            draw.rounded_rectangle((x - 90, 104, x + 220, 316), radius=26, fill='#EDEBF6')
            board.alpha_composite(frames[role][i][128][0].resize((190, 190), Image.Resampling.NEAREST), (x - 32, 112))
            SOURCE['centered'](draw, x + 62, 328, label, 19, THEME['edge'])
        result.append(board.convert('RGB').quantize(colors=128))
    target = UI / 'cloud-cursors-motion.gif'
    result[0].save(target, save_all=True, append_images=result[1:], duration=[60, 70, 70] * 8, loop=0, disposal=2)
    with Image.open(target) as check:
        assert check.n_frames == FRAME_COUNT
        duration = 0
        for i in range(check.n_frames):
            check.seek(i)
            check.load()
            duration += check.info['duration']
        assert duration == 1600
    return target


def main():
    """制作、独立解码、Windows 原生加载并打包，全程不修改鼠标配置。"""
    CURSORS.mkdir(parents=True, exist_ok=True)
    EVIDENCE.mkdir(exist_ok=True)
    decoded, animated, checks, manifest = {}, {}, [], []
    for role, filename, label, hotspot in ROLES:
        path = CURSORS / filename
        if filename.endswith('.ani'):
            data = ani_bytes([cur_bytes(asset(role, i), hotspot, (128,)) for i in range(FRAME_COUNT)])
            animated[role] = decode_ani(data)
            decoded[role] = animated[role][0]
        else:
            data = cur_bytes(asset(role), hotspot)
            decoded[role] = decode_cur(data)
        path.write_bytes(data)
        native = native_load(path, decoded[role])
        digest = hashlib.sha256(data).hexdigest()
        checks.append(dict(role=role, file=filename, bytes=len(data), sha256=digest, native=native,
                           frames=FRAME_COUNT if role in animated else 1, decoded=True))
        manifest.append(dict(role=role, file=filename, label=label, sha256=digest))
    manifest_path = PACKAGE / 'manifest.json'
    manifest_path.write_text(json.dumps(dict(name='棉花云朵', scheme='Cotton Cloud (Custom)', version=1,
                                             sizes=list(SIZES), roles=manifest), ensure_ascii=False, indent=2), encoding='utf-8')
    preview = make_preview(decoded)
    motion = make_animation(animated)
    required = ['manage.ps1', '安装.cmd', '恢复原鼠标.cmd', '使用说明.md']
    assert all((PACKAGE / name).is_file() for name in required), '安装工具尚未齐全'
    archive = PACKAGE.parent / '棉花云朵鼠标.zip'
    files = [path for path in PACKAGE.rglob('*') if path.is_file()]
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as package_zip:
        for path in files:
            package_zip.write(path, Path('棉花云朵鼠标') / path.relative_to(PACKAGE))
    with zipfile.ZipFile(archive) as package_zip:
        assert package_zip.testzip() is None
        assert len(package_zip.infolist()) == len(files)
        for path in files:
            assert package_zip.read(str(Path('棉花云朵鼠标') / path.relative_to(PACKAGE)).replace('\\', '/')) == path.read_bytes()
    report = dict(date='2026-10-14', scheme='棉花云朵', installed=False, system_configuration_changed=False,
                  roles=checks, role_count=len(checks), native_load_count=len(checks) * len(SIZES),
                  animated_frames_validated=FRAME_COUNT * 2, animation_loop_ms=1600,
                  preview=str(preview), motion=str(motion), zip=str(archive), zip_integrity=True)
    (EVIDENCE / 'cloud-cursor-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(dict(roles=len(checks), native_loads=len(checks) * len(SIZES), preview=str(preview), zip=str(archive)), ensure_ascii=False))


if __name__ == '__main__':
    main()
