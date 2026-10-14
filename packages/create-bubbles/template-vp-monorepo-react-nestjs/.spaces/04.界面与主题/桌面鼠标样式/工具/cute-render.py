"""制作软萌鼠标概念图及可辨识的小尺寸预览，不操作系统鼠标。"""

from pathlib import Path
import re
import math
import json
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'ui'
SIZE = 640
S = SIZE / 128
STATES = [('arrow', '正常选择'), ('hand', '链接选择'), ('text', '文本选择'),
          ('busy', '忙碌'), ('working', '后台运行'), ('move', '移动'),
          ('resize', '缩放'), ('no', '不可用')]
THEMES = [
    dict(key='cat', number='01', name='奶油小猫', en='CREAM KITTEN',
         note='一点杏色，一点腮红。把猫猫藏进每一次点击。',
         top='#FFFDF4', bottom='#F5DFB9', edge='#8C7060', accent='#D99477',
         pink='#EAB0AE', panel='#F6EDDF', bg='#FCF9F3', dark='#3C343A',
         tagline='猫耳 · 肉垫 · 卷尾'),
    dict(key='bunny', number='02', name='桃桃兔子', en='PEACH BUNNY',
         note='圆圆的脸，软软的耳朵。像一颗桃子味的软糖。',
         top='#FFF4EF', bottom='#F2C8C5', edge='#A1747D', accent='#D9919F',
         pink='#E59EAA', panel='#F7E4E4', bg='#FCF7F7', dark='#40313E',
         tagline='兔耳 · 桃粉 · 小花'),
    dict(key='cloud', number='03', name='棉花云朵', en='COTTON CLOUD',
         note='轻轻飘着的小云朵，陪你在桌面上做个白日梦。',
         top='#FFFFFF', bottom='#DCDCF5', edge='#7C7D9E', accent='#9B94C5',
         pink='#EDBDB6', panel='#EDEBF6', bg='#F8F8FC', dark='#33344C',
         tagline='云朵 · 星星 · 月亮'),
]


def color(value, alpha=255):
    return tuple(int(value[i:i + 2], 16) for i in (1, 3, 5)) + (alpha,)


def font(size, bold=False):
    return ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc' if bold else
                              'C:/Windows/Fonts/msyh.ttc', size)


def path_points(path):
    """将闭合贝塞尔轮廓离散为细密采样点，供高倍抗锯齿绘制。"""
    tokens = re.findall(r'[MLCQZ]|-?\d+(?:\.\d+)?', path)
    points, current, index = [], (0, 0), 0
    while index < len(tokens):
        command = tokens[index]
        index += 1
        count = {'M': 2, 'L': 2, 'Q': 4, 'C': 6, 'Z': 0}[command]
        args = list(map(float, tokens[index:index + count]))
        index += count
        if command in ('M', 'L'):
            current = tuple(args)
            points.append(current)
        elif command in ('C', 'Q'):
            start = current
            for step in range(1, 29):
                t = step / 28
                u = 1 - t
                if command == 'C':
                    p = (u ** 3 * start[0] + 3*u*u*t*args[0] + 3*u*t*t*args[2] + t**3*args[4],
                         u ** 3 * start[1] + 3*u*u*t*args[1] + 3*u*t*t*args[3] + t**3*args[5])
                else:
                    p = (u*u*start[0] + 2*u*t*args[0] + t*t*args[2],
                         u*u*start[1] + 2*u*t*args[1] + t*t*args[3])
                points.append(p)
            current = points[-1]
        elif points:
            points.append(points[0])
    return [(round(x*S), round(y*S)) for x, y in points]


def curve(im, path, fill, width=2):
    ImageDraw.Draw(im).line(path_points(path), fill=color(fill), width=round(width*S), joint='curve')


def ellipse(im, box, fill, outline=None, width=1):
    ImageDraw.Draw(im).ellipse(tuple(round(v*S) for v in box), fill=color(fill),
                              outline=color(outline) if outline else None, width=round(width*S))


def blob(im, path, theme, fill=None, width=2.25):
    """为柔软轮廓绘制纵向色差、边缘和克制的局部投影。"""
    pts = path_points(path)
    mask = Image.new('L', (SIZE, SIZE))
    md = ImageDraw.Draw(mask)
    md.polygon(pts, fill=255)
    shadow = Image.new('RGBA', im.size, color(theme['edge'], 35))
    shadow_mask = mask.filter(ImageFilter.GaussianBlur(1.5*S))
    shadow.putalpha(shadow_mask.point(lambda a: round(a*.13)))
    im.alpha_composite(shadow, (round(1*S), round(2*S)))
    layer = Image.new('RGBA', im.size)
    ld = ImageDraw.Draw(layer)
    a, b = color(fill or theme['top']), color(fill or theme['bottom'])
    for y in range(SIZE):
        t = y / SIZE
        c = tuple(round(a[k]*(1-t) + b[k]*t) for k in range(4))
        ld.line((0, y, SIZE, y), fill=c)
    im.alpha_composite(Image.composite(layer, Image.new('RGBA', im.size), mask))
    d = ImageDraw.Draw(im)
    d.line(pts, fill=color('#FFFFFF', 240), width=round((width+1.8)*S), joint='curve')
    im.alpha_composite(Image.composite(layer, Image.new('RGBA', im.size), mask))
    ImageDraw.Draw(im).line(pts, fill=color(theme['edge']), width=round(width*S), joint='curve')


def face(im, theme, x, y, sleepy=False):
    """用少量五官和腮红表现角色，缩小时优先保持主体轮廓。"""
    for dx in (-12, 12):
        if sleepy:
            curve(im, f'M {x+dx-3} {y} Q {x+dx} {y+3} {x+dx+3} {y}', theme['edge'], 1.7)
        else:
            ellipse(im, (x+dx-1.7, y-2, x+dx+1.7, y+2.5), theme['edge'])
    for dx in (-20, 20):
        ellipse(im, (x+dx-4, y+5, x+dx+4, y+9.5), theme['pink'])
    if theme['key'] == 'cat':
        ellipse(im, (x-1.7, y+5, x+1.7, y+7.5), theme['edge'])
        curve(im, f'M {x-5} {y+9} Q {x-2} {y+12} {x} {y+8} Q {x+2} {y+12} {x+5} {y+9}', theme['edge'], 1.2)
    else:
        curve(im, f'M {x-3} {y+7} Q {x} {y+10.5} {x+3} {y+7}', theme['edge'], 1.4)


def star(im, theme, x, y, size=7, fill=None):
    blob(im, f'M {x} {y-size} Q {x+1} {y-1} {x+size} {y} Q {x+1} {y+1} {x} {y+size} Q {x-1} {y+1} {x-size} {y} Q {x-1} {y-1} {x} {y-size} Z', theme, fill or '#FFF0BE', 1.2)


def flower(im, theme, x, y, size=8):
    for angle in range(0, 360, 72):
        dx = math.cos(math.radians(angle))*size*.57
        dy = math.sin(math.radians(angle))*size*.57
        ellipse(im, (x+dx-size*.5, y+dy-size*.5, x+dx+size*.5, y+dy+size*.5), '#FFF8E9', theme['edge'], .8)
    ellipse(im, (x-2.3, y-2.3, x+2.3, y+2.3), theme['pink'])


def icon(kind, theme):
    """绘制每种角色的透明鼠标形态，八个状态保持共同语义。"""
    im = Image.new('RGBA', (SIZE, SIZE))
    key = theme['key']
    if kind == 'arrow':
        if key == 'cat':
            # 上左耳尖作为概念热点；轮廓包含脸与卷尾。
            blob(im, 'M 20 13 L 27 43 Q 20 50 21 63 C 19 80 32 92 49 93 Q 61 99 72 93 C 91 105 102 95 98 83 Q 95 76 91 82 Q 89 89 79 84 C 91 77 94 57 82 46 L 84 24 Q 84 18 79 22 L 61 35 Q 41 28 20 13 Z', theme)
            blob(im, 'M 28 25 L 34 42 Q 42 38 46 40 Z', theme, '#EEC3B4', .8)
            blob(im, 'M 78 29 L 75 43 L 65 39 Z', theme, '#EEC3B4', .8)
            face(im, theme, 54, 61)
            curve(im, 'M 29 50 Q 25 63 31 72', '#FFFFFF', 2.2)
            curve(im, 'M 38 86 Q 44 90 50 89', '#FFFFFF', 1.6)
        elif key == 'bunny':
            blob(im, 'M 17 13 C 20 12 35 25 43 41 Q 48 37 53 37 C 52 19 58 8 65 11 C 73 13 75 33 70 46 C 93 55 96 79 84 91 C 74 103 51 105 38 94 C 19 81 25 59 32 52 C 22 39 17 24 17 13 Z', theme)
            curve(im, 'M 25 24 Q 30 35 37 42', theme['pink'], 4.7)
            curve(im, 'M 64 21 Q 66 31 62 43', theme['pink'], 5.2)
            face(im, theme, 58, 70)
            ellipse(im, (75, 88, 87, 100), '#FFF9F3', theme['edge'], 1.3)
            curve(im, 'M 37 58 Q 29 69 34 78', '#FFFFFF', 2.2)
        else:
            blob(im, 'M 20 13 Q 20 44 23 60 C 16 70 22 87 35 86 Q 40 86 46 81 L 62 104 Q 67 110 74 106 L 81 102 Q 86 98 81 93 L 70 78 C 84 85 99 75 98 62 Q 97 48 84 48 C 80 34 65 34 57 43 Q 40 31 20 13 Z', theme)
            face(im, theme, 57, 62, True)
            curve(im, 'M 29 48 Q 27 58 29 62', '#FFFFFF', 2.5)
            star(im, theme, 96, 28, 6, '#F3DDA6')
    elif kind == 'hand':
        paw = 'M 37 67 L 40 28 C 39 8 60 8 61 26 L 61 46 C 68 37 79 39 81 48 C 90 43 99 48 99 58 C 107 60 109 69 105 80 L 93 103 Q 92 111 84 112 L 56 112 Q 49 111 46 101 L 25 78 C 17 64 29 56 37 67 Z'
        if key == 'bunny':
            paw = 'M 39 67 L 41 25 C 40 5 62 6 62 25 L 63 52 C 71 40 83 43 83 53 C 93 45 102 54 101 66 Q 112 75 104 89 L 92 108 Q 91 113 81 113 L 60 113 Q 51 112 46 103 L 26 79 C 17 62 31 57 39 67 Z'
        if key == 'cloud':
            paw = 'M 38 68 L 41 25 C 41 5 61 6 62 26 L 62 50 C 68 40 80 40 82 49 C 91 42 103 49 103 59 C 115 65 108 83 101 91 Q 94 98 94 106 Q 92 112 82 112 L 61 112 Q 48 112 46 103 L 26 82 C 15 67 26 57 38 68 Z'
        blob(im, paw, theme)
        curve(im, 'M 47 26 L 47 47', '#FFFFFF', 2.5)
        if key == 'cat':
            for x, y, w, h in [(51, 67, 5, 7), (66, 62, 5, 7), (83, 65, 5, 7)]:
                ellipse(im, (x-w, y-h, x+w, y+h), theme['pink'])
            blob(im, 'M 51 89 C 48 79 57 73 64 77 C 70 69 80 74 82 86 C 84 97 74 101 66 97 C 58 101 51 97 51 89 Z', theme, theme['pink'], .5)
        elif key == 'bunny':
            flower(im, theme, 69, 86, 14)
            ellipse(im, (58, 55, 67, 65), theme['pink'])
            ellipse(im, (79, 60, 88, 70), theme['pink'])
        else:
            star(im, theme, 69, 85, 13, '#F3DDA6')
            for x in (55, 73, 90):
                ellipse(im, (x-3, 62, x+3, 68), '#C1BCE7')
        curve(im, 'M 58 105 Q 71 107 85 104', theme['accent'], 2.3)
    elif kind == 'busy':
        d = ImageDraw.Draw(im)
        box = tuple(round(v*S) for v in (28, 28, 100, 100))
        d.arc(box, 32, 335, fill=color('#FFFFFF'), width=round(15*S))
        d.arc(box, 32, 335, fill=color(theme['edge']), width=round(11*S))
        d.arc(box, 32, 335, fill=color(theme['bottom']), width=round(7*S))
        d.arc(tuple(round(v*S) for v in (28, 26, 100, 98)), 175, 269, fill=color(theme['top']), width=round(2*S))
        if key == 'cat':
            blob(im, 'M 45 40 L 45 28 L 57 34 Q 64 32 71 35 L 83 29 L 81 43 Q 85 56 78 63 C 64 70 47 65 43 54 Q 41 48 45 40 Z', theme, None, 1.7)
            face(im, theme, 63, 47, True)
        elif key == 'bunny':
            flower(im, theme, 93, 84, 10)
            ellipse(im, (49, 51, 79, 81), theme['pink'])
            ellipse(im, (54, 55, 74, 75), theme['top'])
        else:
            blob(im, 'M 64 41 C 46 42 43 65 53 74 C 64 86 83 75 83 64 C 70 69 59 57 64 41 Z', theme, '#FFF0BE', 1.4)
            star(im, theme, 94, 81, 8, '#F3DDA6')
    elif kind == 'working':
        im.alpha_composite(icon('arrow', theme).resize((460, 460), Image.Resampling.LANCZOS), (0, 0))
        im.alpha_composite(icon('busy', theme).resize((300, 300), Image.Resampling.LANCZOS), (335, 338))
    elif kind == 'text':
        blob(im, 'M 60 29 L 68 29 L 68 99 L 81 99 Q 87 99 87 104 Q 87 109 81 109 L 47 109 Q 41 109 41 104 Q 41 99 47 99 L 60 99 Z', theme, theme['top'], 2)
        if key == 'cat':
            blob(im, 'M 40 29 L 42 17 L 51 24 L 76 24 L 86 17 L 88 29 Q 87 34 80 34 L 47 34 Q 40 34 40 29 Z', theme, None, 1.7)
        elif key == 'bunny':
            blob(im, 'M 42 30 L 43 19 Q 43 14 47 14 Q 52 14 52 20 L 53 24 L 75 24 L 76 20 Q 76 14 81 14 Q 85 14 85 19 L 86 30 Q 84 34 79 34 L 48 34 Q 42 34 42 30 Z', theme, None, 1.7)
        else:
            blob(im, 'M 42 29 Q 40 21 48 20 Q 50 12 59 17 Q 66 11 72 18 Q 84 17 85 26 Q 88 33 79 34 L 49 34 Q 42 34 42 29 Z', theme, None, 1.7)
    elif kind == 'move':
        blob(im, 'M 64 13 L 81 33 Q 83 37 77 37 L 70 37 L 70 57 L 91 57 L 91 50 Q 91 44 95 47 L 115 64 L 95 81 Q 91 84 91 78 L 91 71 L 70 71 L 70 91 L 77 91 Q 83 91 81 95 L 64 115 L 47 95 Q 44 91 50 91 L 57 91 L 57 71 L 37 71 L 37 78 Q 37 84 33 81 L 13 64 L 33 47 Q 37 44 37 50 L 37 57 L 57 57 L 57 37 L 50 37 Q 44 37 47 33 Z', theme, None, 2)
        ellipse(im, (57, 57, 71, 71), theme['pink'])
    elif kind == 'resize':
        blob(im, 'M 98 23 Q 105 22 105 29 L 104 52 Q 104 56 100 52 L 92 45 L 46 92 L 54 100 Q 57 104 51 104 L 28 105 Q 22 105 23 99 L 24 76 Q 24 72 28 76 L 36 83 L 83 36 L 75 28 Q 72 24 78 24 Z', theme, None, 2.2)
        ellipse(im, (59, 59, 69, 69), theme['pink'])
    elif kind == 'no':
        d = ImageDraw.Draw(im)
        for c, w in [('#FFFFFF', 15), (theme['edge'], 11), (theme['bottom'], 7)]:
            d.ellipse(tuple(round(v*S) for v in (27, 27, 101, 101)), outline=color(c), width=round(w*S))
        for c, w in [('#FFFFFF', 12), (theme['edge'], 8), (theme['bottom'], 4.5)]:
            curve(im, 'M 39 90 L 89 39', c, w)
    return im


def put(board, asset, x, y, size):
    board.alpha_composite(asset.resize((size, size), Image.Resampling.LANCZOS), (x, y))


def panel(d, box, fill, radius=28, outline=None):
    d.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=1)


def centered(d, x, y, text, size, fill, bold=False):
    f = font(size, bold)
    b = d.textbbox((0, 0), text, font=f)
    d.text((x-(b[2]-b[0])/2, y), text, fill=fill, font=f)


def board_for(theme):
    """排版单套角色设计板，放大图与小尺寸图均来自同一透明资产。"""
    board = Image.new('RGBA', (1600, 1160), theme['bg'])
    d = ImageDraw.Draw(board)
    ink = '#584B56'
    d.text((66, 35), '软萌鼠标  /  角色造型提案', font=font(18), fill=theme['edge'])
    d.text((64, 75), theme['name'], font=font(52, True), fill=ink)
    d.text((67, 149), theme['note'], font=font(21), fill='#96858D')
    d.text((1345, 56), theme['number'], font=font(55), fill=theme['accent'])
    d.text((1190, 132), theme['en'], font=font(19), fill=theme['edge'])
    assets = {kind: icon(kind, theme) for kind, _ in STATES}
    panel(d, (64, 216, 972, 649), theme['panel'], 38)
    # 背景圆与轻量主题点缀只属于展示板，不属于指针。
    d.ellipse((143, 255, 470, 582), fill=theme['bg'])
    d.ellipse((586, 266, 897, 577), fill=theme['bg'])
    d.text((89, 237), '主指针与链接手型', font=font(17), fill=theme['edge'])
    put(board, assets['arrow'], 147, 288, 285)
    put(board, assets['hand'], 581, 290, 280)
    d = ImageDraw.Draw(board)
    centered(d, 316, 598, '正常选择', 19, theme['edge'])
    centered(d, 746, 598, '链接选择', 19, theme['edge'])
    panel(d, (998, 216, 1536, 414), '#FFFFFF', 30, '#E8DFE2')
    panel(d, (998, 438, 1536, 649), theme['dark'], 30)
    d.text((1025, 236), '浅色桌面', font=font(17), fill=theme['edge'])
    d.text((1025, 458), '深色桌面', font=font(17), fill='#DECDD9')
    for idx, kind in enumerate(['arrow', 'hand', 'text', 'busy']):
        put(board, assets[kind], 1040+idx*120, 293, 76)
        put(board, assets[kind], 1040+idx*120, 514, 76)
    d = ImageDraw.Draw(board)
    d.text((67, 677), '整套状态', font=font(25, True), fill=ink)
    d.text((202, 687), theme['tagline'], font=font(18), fill=theme['edge'])
    for i, (kind, label) in enumerate(STATES):
        x = 64+i*186
        panel(d, (x, 734, x+171, 923), '#FFFFFF', 22, '#EAE1E5')
        put(board, assets[kind], x+39, 751, 94)
        d = ImageDraw.Draw(board)
        centered(d, x+85, 882, label, 17, '#8C7884')
    panel(d, (64, 952, 1536, 1100), theme['panel'], 25)
    d.text((88, 976), '小尺寸预览', font=font(21, True), fill=ink)
    d.text((89, 1010), '上排 32 px · 下排 48 px', font=font(15), fill=theme['edge'])
    d.text((89, 1046), '原图 100% 比例查看', font=font(15), fill=theme['edge'])
    panel(d, (381, 967, 934, 1085), '#FFFFFF', 17)
    panel(d, (953, 967, 1519, 1085), theme['dark'], 17)
    for i, (kind, _) in enumerate(STATES):
        put(board, assets[kind], 407+i*65, 979, 32)
        put(board, assets[kind], 399+i*65, 1021, 48)
        put(board, assets[kind], 982+i*65, 979, 32)
        put(board, assets[kind], 974+i*65, 1021, 48)
    d = ImageDraw.Draw(board)
    d.text((65, 1121), '静态概念预览 · 动画仅显示关键形态', font=font(14), fill='#AA99A1')
    d.text((1290, 1121), '选定后制作系统指针', font=font(14), fill='#AA99A1')
    path = OUT / f"cute-{theme['key']}.png"
    board.convert('RGB').save(path, optimize=True)
    return assets


def main():
    """生成三套图稿、对比图，并记录真实文件的解码结果。"""
    OUT.mkdir(exist_ok=True)
    all_assets = {theme['key']: board_for(theme) for theme in THEMES}
    comp = Image.new('RGBA', (1600, 1180), '#FCF9F8')
    d = ImageDraw.Draw(comp)
    d.text((64, 40), '软萌鼠标 · 三套造型', font=font(44, True), fill='#635460')
    d.text((66, 110), '同一种可爱，三种不同的性格。', font=font(21), fill='#AA959F')
    for i, theme in enumerate(THEMES):
        y = 176+i*310
        panel(d, (64, y, 1536, y+278), theme['panel'], 30)
        d.text((88, y+31), f"{i+1:02}", font=font(40), fill=theme['accent'])
        d.text((89, y+94), theme['name'], font=font(30, True), fill='#635460')
        d.text((90, y+147), theme['tagline'], font=font(17), fill=theme['edge'])
        assets = all_assets[theme['key']]
        put(comp, assets['arrow'], 358, y+39, 195)
        put(comp, assets['hand'], 578, y+40, 195)
        d = ImageDraw.Draw(comp)
        panel(d, (838, y+21, 1511, y+124), '#FFFFFF', 17)
        panel(d, (838, y+151, 1511, y+254), theme['dark'], 17)
        for j, kind in enumerate(['arrow', 'hand', 'text', 'busy', 'move', 'resize']):
            put(comp, assets[kind], 875+j*101, y+35, 70)
            put(comp, assets[kind], 875+j*101, y+167, 70)
        d = ImageDraw.Draw(comp)
    d.text((65, 1131), '概念预览 · 完整状态和小尺寸效果见单套图稿', font=font(17), fill='#AA959F')
    comp.convert('RGB').save(OUT / 'cute-comparison.png', optimize=True)
    results = []
    for filename in ['cute-cat.png', 'cute-bunny.png', 'cute-cloud.png', 'cute-comparison.png']:
        path = OUT / filename
        with Image.open(path) as im:
            im.load()
            results.append(dict(file=filename, width=im.width, height=im.height, bytes=path.stat().st_size, decoded=True))
    (ROOT / '测试证据' / 'cute-image-validation.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
    print(json.dumps(results))


if __name__ == '__main__':
    main()
