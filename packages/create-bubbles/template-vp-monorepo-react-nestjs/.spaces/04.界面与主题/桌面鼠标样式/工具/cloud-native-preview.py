"""只在内存中用 Windows 绘制指针，验证透明边缘并留存可复查预览。"""

import ctypes
from ctypes import wintypes
import json
from pathlib import Path
import runpy

from PIL import Image, ImageDraw, ImageChops

SOURCE = runpy.run_path(str(Path(__file__).with_name('cloud-build.py')))


class BitmapHeader(ctypes.Structure):
    _fields_ = [('size', wintypes.DWORD), ('width', wintypes.LONG), ('height', wintypes.LONG),
                ('planes', wintypes.WORD), ('bits', wintypes.WORD), ('compression', wintypes.DWORD),
                ('bytes', wintypes.DWORD), ('x', wintypes.LONG), ('y', wintypes.LONG),
                ('used', wintypes.DWORD), ('important', wintypes.DWORD)]


def native_render(path, size, background):
    """调用 LoadImage/DrawIconEx 到内存 DIB，返回像素后立即释放所有资源。"""
    user = ctypes.WinDLL('user32', use_last_error=True)
    gdi = ctypes.WinDLL('gdi32', use_last_error=True)
    user.LoadImageW.argtypes = [wintypes.HINSTANCE, wintypes.LPCWSTR, wintypes.UINT, ctypes.c_int, ctypes.c_int, wintypes.UINT]
    user.LoadImageW.restype = wintypes.HANDLE
    user.DestroyCursor.argtypes = [wintypes.HANDLE]
    user.DrawIconEx.argtypes = [wintypes.HDC, ctypes.c_int, ctypes.c_int, wintypes.HANDLE,
                               ctypes.c_int, ctypes.c_int, wintypes.UINT, wintypes.HBRUSH, wintypes.UINT]
    gdi.CreateCompatibleDC.argtypes = [wintypes.HDC]
    gdi.CreateCompatibleDC.restype = wintypes.HDC
    gdi.CreateDIBSection.argtypes = [wintypes.HDC, ctypes.POINTER(BitmapHeader), wintypes.UINT,
                                   ctypes.POINTER(ctypes.c_void_p), wintypes.HANDLE, wintypes.DWORD]
    gdi.CreateDIBSection.restype = wintypes.HBITMAP
    gdi.SelectObject.argtypes = [wintypes.HDC, wintypes.HANDLE]
    gdi.SelectObject.restype = wintypes.HANDLE
    gdi.DeleteObject.argtypes = [wintypes.HANDLE]
    gdi.DeleteDC.argtypes = [wintypes.HDC]
    dc = gdi.CreateCompatibleDC(None)
    bits = ctypes.c_void_p()
    info = BitmapHeader(40, size, -size, 1, 32, 0, size * size * 4, 0, 0, 0, 0)
    bitmap = gdi.CreateDIBSection(dc, ctypes.byref(info), 0, ctypes.byref(bits), None, 0)
    assert bitmap and bits.value
    old = gdi.SelectObject(dc, bitmap)
    handle = None
    try:
        pixel = bytes((background[2], background[1], background[0], 255))
        ctypes.memmove(bits, pixel * size * size, size * size * 4)
        handle = user.LoadImageW(None, str(path), 2, size, size, 16)
        assert handle and user.DrawIconEx(dc, 0, 0, handle, size, size, 0, None, 3)
        raw = ctypes.string_at(bits, size * size * 4)
        return Image.frombytes('RGBA', (size, size), raw, 'raw', 'BGRA').convert('RGB')
    finally:
        if handle:
            user.DestroyCursor(handle)
        gdi.SelectObject(dc, old)
        gdi.DeleteObject(bitmap)
        gdi.DeleteDC(dc)


def main():
    """比较原生静态透明度与独立解码的合成结果，并输出原生绘制证据。"""
    board = Image.new('RGB', (1200, 640), '#F8F8FC')
    draw = ImageDraw.Draw(board)
    font = SOURCE['SOURCE']['font']
    draw.text((42, 24), 'Windows 原生绘制检查', font=font(30, True), fill='#584B65')
    draw.text((43, 72), '32 / 48 / 64 px 指针绘制到内存画布，放大查看边缘与透明度', font=font(18), fill='#7C7D9E')
    checks = []
    for row, size in enumerate((32, 48, 64)):
        y = 120 + row * 160
        draw.text((42, y + 60), f'{size} px', font=font(22), fill='#7C7D9E')
        for i, filename in enumerate(('normal.cur', 'link.cur', 'text.cur', 'busy.ani', 'working.ani', 'move.cur')):
            path = SOURCE['CURSORS'] / filename
            for background, offset in [((255, 255, 255), 0), ((51, 52, 76), 74)]:
                im = native_render(path, size, background)
                entry = dict(file=filename, size=size, background=list(background), native_draw=True)
                if path.suffix == '.cur':
                    decoded = SOURCE['decode_cur'](path.read_bytes())[size][0]
                    expected = Image.new('RGBA', (size, size), background + (255,))
                    expected.alpha_composite(decoded)
                    difference = ImageChops.difference(im, expected.convert('RGB'))
                    maximum = max(channel.getextrema()[1] for channel in difference.split())
                    assert maximum <= 3, (filename, size, maximum)
                    entry['max_composite_error'] = maximum
                board.paste(im.resize((72, 72), Image.Resampling.NEAREST), (165 + i * 162 + offset, y + 30))
                checks.append(entry)
    target = SOURCE['UI'] / 'cloud-windows-render.png'
    board.save(target)
    with Image.open(target) as check:
        check.load()
    report = dict(date='2026-10-14', renders=len(checks), checked_static_composites=24,
                  configuration_changed=False, image=str(target), results=checks)
    (SOURCE['EVIDENCE'] / 'cloud-native-render.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print('Native DrawIconEx: 36 renders and 24 transparency comparisons passed')


if __name__ == '__main__':
    main()
