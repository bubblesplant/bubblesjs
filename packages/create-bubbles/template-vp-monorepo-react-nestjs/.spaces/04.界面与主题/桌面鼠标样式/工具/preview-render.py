"""绘制四套鼠标设计预览；仅保存图稿，不更改系统鼠标。"""

from pathlib import Path
import json
import math

from PIL import Image, ImageDraw, ImageFilter, ImageFont


FEATURE = Path(__file__).resolve().parents[1]
OUTPUT = FEATURE / "ui"
OUTPUT.mkdir(parents=True, exist_ok=True)
FONTS = Path("C:/Windows/Fonts")
WORK = 384
VIEW = 128
SCALE = WORK / VIEW

STYLES = [
    dict(code="A", name="霜白极简", subtitle="精确、简洁，适合每天长时间使用。",
         accent="#596370", outline="#27313D", halo="#FFFFFF", top="#FFFFFF",
         bottom="#DFE5EB", secondary="#758496", ring="#74859A",
         surface="#EFF2F5", filename="cursor-a-frost.png", pixel=False),
    dict(code="B", name="森光翡翠", subtitle="保留森林气质，让轮廓更轻盈、更清晰。",
         accent="#278B6F", outline="#164C3F", halo="#FFF9E8", top="#76DFBB",
         bottom="#24A17E", secondary="#F2D796", ring="#42BA95",
         surface="#EAF2ED", filename="cursor-b-jade.png", pixel=False),
    dict(code="C", name="星轨冰蓝", subtitle="冷色几何造型，搭配克制的冰蓝边缘。",
         accent="#347ECB", outline="#82DCFF", halo="#F4FBFF", top="#263E67",
         bottom="#12263F", secondary="#ACB9FF", ring="#55C7EE",
         surface="#EBEFF5", filename="cursor-c-orbit.png", pixel=False),
    dict(code="D", name="奶油像素", subtitle="奶油色与薄荷色，带一点轻松的复古感。",
         accent="#907557", outline="#725742", halo="#FFFEF6", top="#FFF2CD",
         bottom="#EED5A0", secondary="#77B8A4", ring="#83B4A2",
         surface="#F4EFE5", filename="cursor-d-pixel.png", pixel=True),
]
STATES = [
    ("arrow", "正常选择"), ("hand", "链接选择"), ("text", "文本选择"),
    ("busy", "忙碌"), ("working", "后台运行"), ("move", "移动"),
    ("resize", "缩放"), ("no", "不可用"),
]


def rgba(value, alpha=255):
    """将设计色转换为可指定透明度的 RGBA。"""
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4)) + (alpha,)


def font(size, bold=False):
    return ImageFont.truetype(str(FONTS / ("msyhbd.ttc" if bold else "msyh.ttc")), size)


def coords(points):
    return [(round(x * SCALE), round(y * SCALE)) for x, y in points]


def gradient(top, bottom):
    """在造型内部生成轻微纵向渐变，不向外产生发光。"""
    result = Image.new("RGBA", (WORK, WORK))
    draw = ImageDraw.Draw(result)
    a, b = rgba(top), rgba(bottom)
    for y in range(WORK):
        t = y / (WORK - 1)
        color = tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(4))
        draw.line((0, y, WORK, y), fill=color)
    return result


def paint_shape(canvas, points, style, width=3.5, highlight=True):
    """填充指针多边形，并添加在深浅背景上可见的双层轮廓。"""
    pts = coords(points)
    mask = Image.new("L", (WORK, WORK))
    md = ImageDraw.Draw(mask)
    md.polygon(pts, fill=255)
    layer = gradient(style["top"], style["bottom"])
    canvas.alpha_composite(Image.composite(layer, Image.new("RGBA", layer.size), mask))
    d = ImageDraw.Draw(canvas)
    d.line(pts + [pts[0]], fill=rgba(style["halo"]),
           width=round((width + 3.3) * SCALE), joint="curve")
    canvas.alpha_composite(Image.composite(layer, Image.new("RGBA", layer.size), mask))
    d = ImageDraw.Draw(canvas)
    d.line(pts + [pts[0]], fill=rgba(style["outline"]),
           width=round(width * SCALE), joint="curve")
    if highlight and style["code"] == "B":
        d.line(coords([(points[0][0] + 6, points[0][1] + 18),
                       (points[0][0] + 6, min(points[0][1] + 51, 80))]),
               fill=rgba("#D8F6E8", 220), width=round(1.5 * SCALE))


def stroked_line(canvas, points, style, width=5):
    """为文本、缩放等细线状态绘制稳定可见的边缘。"""
    d = ImageDraw.Draw(canvas)
    d.line(coords(points), fill=rgba(style["halo"]),
           width=round((width + 5) * SCALE), joint="curve")
    d.line(coords(points), fill=rgba(style["outline"]),
           width=round((width + 2) * SCALE), joint="curve")
    d.line(coords(points), fill=rgba(style["top"]),
           width=round(width * SCALE), joint="curve")


def hand_points():
    """手型保留直立食指和收拢指节，避免像戴手套的抽象符号。"""
    return [(43, 69), (43, 20), (44, 14), (48, 10), (54, 10), (60, 13),
            (62, 19), (62, 48), (66, 45), (72, 45), (78, 49), (83, 47),
            (89, 48), (95, 55), (100, 54), (106, 58), (109, 64),
            (109, 81), (105, 92), (97, 108), (97, 114), (58, 114),
            (54, 102), (43, 90), (28, 74), (27, 67), (31, 62),
            (37, 63), (43, 69)]


def make_pixel(kind, style):
    """在 24×24 的固定网格绘制像素方案，保持边缘真正整齐。"""
    mask = Image.new("L", (24, 24))
    d = ImageDraw.Draw(mask)
    if kind == "arrow":
        d.polygon([(3, 2), (3, 19), (8, 15), (12, 22), (15, 20),
                   (11, 13), (19, 13)], fill=255)
    elif kind == "hand":
        d.polygon([(8, 13), (8, 3), (9, 2), (11, 2), (12, 3),
                   (12, 9), (15, 9), (16, 10), (18, 10), (19, 12),
                   (21, 12), (21, 17), (19, 21), (11, 21),
                   (9, 18), (4, 13), (4, 11), (6, 11)], fill=255)
    elif kind == "text":
        d.rectangle((11, 3, 12, 20), fill=255)
        d.rectangle((7, 2, 16, 3), fill=255)
        d.rectangle((7, 20, 16, 21), fill=255)
    elif kind == "busy":
        d.polygon([(6, 3), (18, 3), (18, 6), (15, 9), (13, 11),
                   (13, 12), (15, 14), (18, 17), (18, 20),
                   (6, 20), (6, 17), (9, 14), (11, 12), (11, 11),
                   (9, 9), (6, 6)], fill=255)
    elif kind == "move":
        d.polygon([(12, 1), (16, 5), (13, 5), (13, 10), (18, 10),
                   (18, 7), (22, 11), (18, 15), (18, 12), (13, 12),
                   (13, 18), (16, 18), (12, 22), (8, 18), (11, 18),
                   (11, 12), (5, 12), (5, 15), (1, 11), (5, 7),
                   (5, 10), (11, 10), (11, 5), (8, 5)], fill=255)
    elif kind == "resize":
        d.line([(5, 18), (18, 5)], fill=255, width=3)
        d.polygon([(2, 21), (2, 12), (11, 21)], fill=255)
        d.polygon([(21, 2), (12, 2), (21, 11)], fill=255)
    elif kind == "no":
        d.ellipse((3, 3, 21, 21), outline=255, width=2)
        d.line((6, 18, 18, 6), fill=255, width=2)
    elif kind == "working":
        arrow = make_pixel("arrow", style).resize((270, 270), Image.Resampling.NEAREST)
        busy = make_pixel("busy", style).resize((155, 155), Image.Resampling.NEAREST)
        result = Image.new("RGBA", (WORK, WORK))
        result.alpha_composite(arrow, (0, 0))
        result.alpha_composite(busy, (215, 210))
        return result

    outer = mask.filter(ImageFilter.MaxFilter(5))
    border = mask.filter(ImageFilter.MaxFilter(3))
    result = Image.new("RGBA", (24, 24))
    result.paste(rgba(style["halo"]), mask=outer)
    result.paste(rgba(style["outline"]), mask=border)
    result.paste(rgba(style["top"]), mask=mask)
    rd = ImageDraw.Draw(result)
    if kind == "arrow":
        rd.line((5, 6, 5, 13), fill=rgba("#FFFFFF"), width=1)
        rd.rectangle((11, 17, 12, 19), fill=rgba(style["secondary"]))
    elif kind == "hand":
        rd.line((10, 5, 10, 10), fill=rgba("#FFFFFF"), width=1)
        rd.rectangle((11, 19, 18, 20), fill=rgba(style["secondary"]))
        for x, y in [(13, 11), (16, 12), (19, 14)]:
            rd.line((x, y, x, y + 3), fill=rgba(style["outline"]))
    elif kind == "busy":
        rd.rectangle((8, 4, 16, 5), fill=rgba(style["secondary"]))
        rd.polygon([(12, 14), (8, 18), (16, 18)], fill=rgba(style["secondary"]))
    return result.resize((WORK, WORK), Image.Resampling.NEAREST)


def make_icon(kind, style):
    """生成具有一致状态语义和视觉风格的独立透明图标。"""
    if style["pixel"]:
        return make_pixel(kind, style)
    im = Image.new("RGBA", (WORK, WORK))
    d = ImageDraw.Draw(im)
    if kind == "arrow":
        if style["code"] == "C":
            points = [(17, 9), (18, 97), (40, 75), (61, 114),
                      (77, 104), (54, 68), (91, 67)]
        elif style["code"] == "B":
            points = [(17, 9), (18, 96), (40, 77), (59, 113),
                      (76, 104), (55, 68), (92, 65)]
        else:
            points = [(17, 9), (18, 96), (40, 76), (60, 113),
                      (76, 104), (55, 68), (92, 67)]
        paint_shape(im, points, style, 3.5)
        d = ImageDraw.Draw(im)
        if style["code"] == "C":
            d.polygon(coords([(25, 30), (25, 74), (49, 60), (68, 60)]),
                      fill=rgba("#5BAADE", 90))
            d.line(coords([(29, 25), (77, 62)]), fill=rgba("#D1F5FF", 235), width=4)
        if style["code"] == "B":
            d.line(coords([(58, 91), (64, 103)]), fill=rgba(style["secondary"]), width=7)
    elif kind == "hand":
        paint_shape(im, hand_points(), style, 3.1, False)
        d = ImageDraw.Draw(im)
        detail = style["outline"] if style["code"] != "C" else "#72BADB"
        for pts in [[(62, 51), (62, 73)], [(78, 52), (78, 75)],
                    [(95, 60), (95, 78)]]:
            d.line(coords(pts), fill=rgba(detail, 220), width=round(2.2 * SCALE))
        d.line(coords([(59, 104), (97, 104)]), fill=rgba(style["secondary"]),
               width=round(3 * SCALE))
        if style["code"] != "A":
            d.line(coords([(49, 19), (49, 51)]), fill=rgba(style["halo"], 175), width=4)
    elif kind == "text":
        # 32 px 时保留实色中心，避免浅色填充挤掉细小描边。
        text_style = {**style, "top": style["outline"]}
        if style["code"] == "C":
            text_style["outline"] = style["bottom"]
        stroked_line(im, [(64, 22), (64, 106)], text_style, 5)
        stroked_line(im, [(47, 19), (81, 19)], text_style, 5)
        stroked_line(im, [(47, 109), (81, 109)], text_style, 5)
    elif kind == "busy":
        bbox = tuple(round(v * SCALE) for v in (24, 24, 104, 104))
        d.arc(bbox, 30, 330, fill=rgba(style["halo"]), width=round(13 * SCALE))
        d.arc(bbox, 30, 330, fill=rgba(style["outline"]), width=round(9 * SCALE))
        d.arc(bbox, 30, 268, fill=rgba(style["ring"]), width=round(6 * SCALE))
        d.arc(bbox, 268, 330, fill=rgba(style["secondary"]), width=round(6 * SCALE))
    elif kind == "working":
        arrow = make_icon("arrow", style).resize((260, 260), Image.Resampling.LANCZOS)
        busy = make_icon("busy", style).resize((190, 190), Image.Resampling.LANCZOS)
        im.alpha_composite(arrow, (0, 0))
        im.alpha_composite(busy, (195, 193))
    elif kind == "move":
        pts = [(64, 12), (83, 34), (70, 34), (70, 58), (95, 58),
               (95, 45), (117, 64), (95, 83), (95, 70), (70, 70),
               (70, 95), (83, 95), (64, 117), (45, 95), (58, 95),
               (58, 70), (34, 70), (34, 83), (12, 64), (34, 45),
               (34, 58), (58, 58), (58, 34), (45, 34)]
        paint_shape(im, pts, style, 3, False)
    elif kind == "resize":
        pts = [(106, 18), (106, 53), (95, 42), (43, 94), (54, 105),
               (19, 105), (19, 70), (30, 81), (82, 29), (71, 18)]
        paint_shape(im, pts, style, 3.1, False)
    elif kind == "no":
        bbox = tuple(round(v * SCALE) for v in (23, 23, 105, 105))
        d.ellipse(bbox, outline=rgba(style["halo"]), width=round(11 * SCALE))
        d.ellipse(bbox, outline=rgba(style["outline"]), width=round(8 * SCALE))
        d.ellipse(bbox, outline=rgba(style["top"]), width=round(4 * SCALE))
        stroked_line(im, [(36, 93), (92, 36)], style, 4)
    return im


def resized(icon, size, pixel=False):
    return icon.resize((size, size), Image.Resampling.NEAREST if pixel else Image.Resampling.LANCZOS)


def paste_icon(board, icon, xy, size, pixel=False):
    board.alpha_composite(resized(icon, size, pixel), xy)


def write_center(draw, cx, y, text, size=19, fill="#48525E", bold=False):
    f = font(size, bold)
    box = draw.textbbox((0, 0), text, font=f)
    draw.text((cx - (box[2] - box[0]) / 2, y), text, font=f, fill=fill)


def rounded_panel(draw, box, fill, border=None, radius=20):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=border, width=1)


def render_board(style):
    """生成统一排版、八个状态以及深浅背景对比的方案图。"""
    board = Image.new("RGBA", (1600, 1060), "#F8F9F7")
    d = ImageDraw.Draw(board)
    ink = "#23303C"
    accent = style["accent"]
    d.text((56, 38), "桌面鼠标 · 四套视觉提案", font=font(18), fill="#7A838B")
    d.text((56, 78), f"{style['code']}  {style['name']}", font=font(52, True), fill=ink)
    d.text((59, 150), style["subtitle"], font=font(21), fill="#64707B")
    d.text((1375, 79), f"0{ord(style['code']) - 64} / 04", font=font(30), fill=accent)
    for i, color in enumerate([style["top"], style["outline"], style["secondary"]]):
        d.ellipse((1385 + 44 * i, 148, 1411 + 44 * i, 174), fill=color, outline="#C9CFCC")
    d.line((56, 196, 1544, 196), fill="#DFE4E1", width=1)

    icons = {kind: make_icon(kind, style) for kind, _ in STATES}
    rounded_panel(d, (56, 222, 994, 585), style["surface"])
    d.text((82, 243), "核心造型 · 放大展示", font=font(17), fill="#728079")
    for gx in range(84, 972, 38):
        for gy in range(292, 550, 38):
            d.ellipse((gx, gy, gx + 1, gy + 1), fill="#CCD6D0")
    paste_icon(board, icons["arrow"], (225, 290), 225, style["pixel"])
    paste_icon(board, icons["hand"], (584, 290), 225, style["pixel"])
    d = ImageDraw.Draw(board)
    write_center(d, 337, 542, "正常选择", 18, "#66736E")
    write_center(d, 696, 542, "链接选择", 18, "#66736E")

    rounded_panel(d, (1018, 222, 1544, 392), "#FFFFFF", "#E1E5E0")
    d.text((1041, 242), "浅色背景", font=font(17), fill="#7E8985")
    for i, kind in enumerate(["arrow", "hand", "text", "busy"]):
        paste_icon(board, icons[kind], (1070 + i * 110, 292), 62, style["pixel"])
    d = ImageDraw.Draw(board)
    rounded_panel(d, (1018, 415, 1544, 585), "#202B34")
    d.text((1041, 436), "深色背景", font=font(17), fill="#B8C5CD")
    for i, kind in enumerate(["arrow", "hand", "text", "busy"]):
        paste_icon(board, icons[kind], (1070 + i * 110, 486), 62, style["pixel"])

    d = ImageDraw.Draw(board)
    d.text((56, 619), "常用状态", font=font(23, True), fill=ink)
    d.text((175, 625), "同一套形状与配色，覆盖日常操作", font=font(17), fill="#879087")
    width, gap = 172, 16
    for i, (kind, label) in enumerate(STATES):
        x = 56 + i * (width + gap)
        rounded_panel(d, (x, 673, x + width, 847), "#FFFFFF", "#E5E8E4", 15)
        paste_icon(board, icons[kind], (x + 45, 694), 82, style["pixel"])
        d = ImageDraw.Draw(board)
        write_center(d, x + width / 2, 809, label, 17, "#53615D")

    rounded_panel(d, (56, 884, 1544, 1000), "#EDF0ED", radius=16)
    d.text((81, 906), "32 px 基准预览", font=font(20, True), fill="#43564B")
    d.text((82, 946), "打开原图，以 100% 比例查看", font=font(15), fill="#7A887F")
    rounded_panel(d, (408, 901, 945, 983), "#FFFFFF", radius=12)
    rounded_panel(d, (971, 901, 1523, 983), "#26313A", radius=12)
    for i, (kind, _) in enumerate(STATES):
        paste_icon(board, icons[kind], (435 + i * 62, 926), 32, style["pixel"])
        paste_icon(board, icons[kind], (1001 + i * 62, 926), 32, style["pixel"])
    d = ImageDraw.Draw(board)
    d.text((57, 1020), "概念预览 · 动画显示关键形态", font=font(14), fill="#8C968F")
    d.text((1230, 1020), "选定后制作全套系统指针", font=font(14), fill="#8C968F")
    board = board.convert("RGB")
    board.save(OUTPUT / style["filename"], optimize=True)
    return board, icons


def render_comparison(all_icons):
    """用四行同版式展示核心造型，便于一次对比全部方向。"""
    board = Image.new("RGBA", (1600, 1480), "#F8F9F7")
    d = ImageDraw.Draw(board)
    d.text((58, 43), "鼠标样式 · 四套方案对比", font=font(43, True), fill="#26343D")
    d.text((59, 112), "同样的使用场景，不同的视觉方向", font=font(20), fill="#7B877F")
    for i, style in enumerate(STYLES):
        y = 173 + i * 307
        rounded_panel(d, (56, y, 1544, y + 281), "#FFFFFF", "#E3E8E2", 22)
        d.text((82, y + 25), style["code"], font=font(49, True), fill=style["accent"])
        d.text((143, y + 43), style["name"], font=font(27, True), fill="#293C35")
        icons = all_icons[style["code"]]
        rounded_panel(d, (369, y + 18, 840, y + 255), style["surface"], radius=15)
        paste_icon(board, icons["arrow"], (422, y + 48), 165, style["pixel"])
        paste_icon(board, icons["hand"], (624, y + 48), 165, style["pixel"])
        d = ImageDraw.Draw(board)
        rounded_panel(d, (865, y + 18, 1517, y + 129), "#F2F4F0", radius=13)
        rounded_panel(d, (865, y + 143, 1517, y + 254), "#26313A", radius=13)
        for col, kind in enumerate(["arrow", "hand", "text", "busy", "move", "resize"]):
            paste_icon(board, icons[kind], (885 + col * 103, y + 39), 64, style["pixel"])
            paste_icon(board, icons[kind], (885 + col * 103, y + 164), 64, style["pixel"])
        d = ImageDraw.Draw(board)
        d.text((83, y + 110), "深浅背景均可对比", font=font(16), fill="#839087")
        for col, color in enumerate([style["top"], style["outline"], style["secondary"]]):
            d.ellipse((86 + col * 43, y + 170, 113 + col * 43, y + 197),
                      fill=color, outline="#CAD3CB")
    d.text((60, 1441), "概念预览 · 完整状态与 32 px 基准预览见单套设计图", font=font(17), fill="#859189")
    board.convert("RGB").save(OUTPUT / "cursor-options-overview.png", optimize=True)


def main():
    all_icons = {}
    for style in STYLES:
        _, icons = render_board(style)
        all_icons[style["code"]] = icons
    render_comparison(all_icons)
    checks = []
    for name in [s["filename"] for s in STYLES] + ["cursor-options-overview.png"]:
        path = OUTPUT / name
        with Image.open(path) as image:
            image.load()
            checks.append(dict(file=name, width=image.width, height=image.height,
                               bytes=path.stat().st_size, decoded=True))
    evidence = FEATURE / "测试证据"
    evidence.mkdir(exist_ok=True)
    (evidence / "image-validation.json").write_text(json.dumps(checks, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(checks, ensure_ascii=True))


if __name__ == "__main__":
    main()
