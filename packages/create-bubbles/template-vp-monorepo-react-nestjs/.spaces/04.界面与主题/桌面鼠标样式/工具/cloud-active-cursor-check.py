"""比较当前 Windows 系统指针与安装文件的原生绘制，确认已经即时应用。"""

import ctypes
from ctypes import wintypes
import hashlib
import json
import os
from pathlib import Path


class BitmapHeader(ctypes.Structure):
    _fields_ = [('size', wintypes.DWORD), ('width', wintypes.LONG), ('height', wintypes.LONG),
                ('planes', wintypes.WORD), ('bits', wintypes.WORD), ('compression', wintypes.DWORD),
                ('bytes', wintypes.DWORD), ('x', wintypes.LONG), ('y', wintypes.LONG),
                ('used', wintypes.DWORD), ('important', wintypes.DWORD)]


class IconInfo(ctypes.Structure):
    _fields_ = [('fIcon', wintypes.BOOL), ('xHotspot', wintypes.DWORD), ('yHotspot', wintypes.DWORD),
                ('hbmMask', wintypes.HBITMAP), ('hbmColor', wintypes.HBITMAP)]


class Bitmap(ctypes.Structure):
    _fields_ = [('type', wintypes.LONG), ('width', wintypes.LONG), ('height', wintypes.LONG),
                ('stride', wintypes.LONG), ('planes', wintypes.WORD), ('bits', wintypes.WORD),
                ('data', ctypes.c_void_p)]


USER = ctypes.WinDLL('user32', use_last_error=True)
GDI = ctypes.WinDLL('gdi32', use_last_error=True)
USER.LoadCursorW.argtypes = [wintypes.HINSTANCE, ctypes.c_void_p]
USER.LoadCursorW.restype = wintypes.HANDLE
USER.LoadImageW.argtypes = [wintypes.HINSTANCE, wintypes.LPCWSTR, wintypes.UINT,
                          ctypes.c_int, ctypes.c_int, wintypes.UINT]
USER.LoadImageW.restype = wintypes.HANDLE
USER.GetIconInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(IconInfo)]
USER.GetIconInfo.restype = wintypes.BOOL
USER.DrawIconEx.argtypes = [wintypes.HDC, ctypes.c_int, ctypes.c_int, wintypes.HANDLE,
                          ctypes.c_int, ctypes.c_int, wintypes.UINT, wintypes.HBRUSH, wintypes.UINT]
USER.DrawIconEx.restype = wintypes.BOOL
USER.DestroyCursor.argtypes = [wintypes.HANDLE]
GDI.GetObjectW.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p]
GDI.CreateCompatibleDC.argtypes = [wintypes.HDC]
GDI.CreateCompatibleDC.restype = wintypes.HDC
GDI.CreateDIBSection.argtypes = [wintypes.HDC, ctypes.POINTER(BitmapHeader), wintypes.UINT,
                               ctypes.POINTER(ctypes.c_void_p), wintypes.HANDLE, wintypes.DWORD]
GDI.CreateDIBSection.restype = wintypes.HBITMAP
GDI.SelectObject.argtypes = [wintypes.HDC, wintypes.HANDLE]
GDI.SelectObject.restype = wintypes.HANDLE
GDI.DeleteObject.argtypes = [wintypes.HANDLE]
GDI.DeleteDC.argtypes = [wintypes.HDC]


def describe(handle):
    """读取系统指针尺寸与热点，只释放 GetIconInfo 产生的位图副本。"""
    info = IconInfo()
    if not USER.GetIconInfo(handle, ctypes.byref(info)):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        bitmap = Bitmap()
        assert GDI.GetObjectW(info.hbmColor or info.hbmMask, ctypes.sizeof(bitmap), ctypes.byref(bitmap))
        height = bitmap.height if info.hbmColor else bitmap.height // 2
        return bitmap.width, height, [info.xHotspot, info.yHotspot]
    finally:
        if info.hbmColor:
            GDI.DeleteObject(info.hbmColor)
        if info.hbmMask:
            GDI.DeleteObject(info.hbmMask)


def render(handle, width, height, step=0):
    """将指定系统或文件指针绘制到白色内存画布，避免释放共享系统句柄。"""
    dc = GDI.CreateCompatibleDC(None)
    bits = ctypes.c_void_p()
    header = BitmapHeader(40, width, -height, 1, 32, 0, width * height * 4, 0, 0, 0, 0)
    bitmap = GDI.CreateDIBSection(dc, ctypes.byref(header), 0, ctypes.byref(bits), None, 0)
    assert dc and bitmap and bits.value
    old = GDI.SelectObject(dc, bitmap)
    try:
        ctypes.memmove(bits, b'\xff' * (width * height * 4), width * height * 4)
        assert USER.DrawIconEx(dc, 0, 0, handle, width, height, step, None, 3)
        return ctypes.string_at(bits, width * height * 4)
    finally:
        GDI.SelectObject(dc, old)
        GDI.DeleteObject(bitmap)
        GDI.DeleteDC(dc)


def main():
    """核对五个核心系统角色的热点与绘制，两种 ANI 另外检查第 12 帧。"""
    root = Path(__file__).resolve().parents[1]
    installed = Path(os.environ['LOCALAPPDATA']) / 'CottonCloudCursors' / 'cursors'
    roles = [('Arrow', 32512, 'normal.cur'), ('Hand', 32649, 'link.cur'),
             ('IBeam', 32513, 'text.cur'), ('Wait', 32514, 'busy.ani'),
             ('AppStarting', 32650, 'working.ani')]
    results = []
    for role, identifier, filename in roles:
        system = USER.LoadCursorW(None, ctypes.c_void_p(identifier))
        assert system, role
        width, height, hotspot = describe(system)
        expected = USER.LoadImageW(None, str(installed / filename), 2, width, height, 16)
        assert expected, filename
        try:
            _, _, file_hotspot = describe(expected)
            assert hotspot == file_hotspot, (role, hotspot, file_hotspot)
            steps = (0, 12) if filename.endswith('.ani') else (0,)
            for step in steps:
                actual_pixels = render(system, width, height, step)
                expected_pixels = render(expected, width, height, step)
                assert actual_pixels == expected_pixels, (role, step, '系统图像与安装资源不同')
                results.append(dict(role=role, size=[width, height], hotspot=hotspot, frame=step,
                                    system_matches_installed_file=True,
                                    render_sha256=hashlib.sha256(actual_pixels).hexdigest()))
        finally:
            USER.DestroyCursor(expected)
    report = dict(date='2026-10-14', active_system_cursors_verified=True,
                  checked_roles=len(roles), checked_frames=len(results), results=results)
    (root / '测试证据' / 'cloud-active-cursors.json').write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print('即时应用通过：5 个核心系统指针、7 个画面与安装文件的绘制及热点完全一致。')


if __name__ == '__main__':
    main()
