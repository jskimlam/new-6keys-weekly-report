# pip install pillow  (설치 명령어)
# LAM6Keys 앱 아이콘(B안: 열쇠 + 6 + 회사 마크)과 마스터 장식 PNG 를 만든다
from PIL import Image, ImageDraw, ImageFont
import os
NAVY = (12, 66, 112)      # 0C4270 군청
RED = (227, 38, 46)       # E3262E 마름모
BLUE = (91, 132, 196)     # 5B84C4 원
LIME = (161, 202, 58)     # A1CA3A 둥근사각형
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'  # 영문·숫자 굵은 글꼴
SS = 4  # 4배 크게 그려 줄여서 부드럽게

def mark(d, cx, cy, size, gap):
    """회사 마크 3개(빨강 마름모 · 파랑 원 · 연두 둥근사각형)를 가운데 정렬로 그린다"""
    h = size / 2
    d.polygon([(cx - gap, cy - h), (cx - gap + h, cy), (cx - gap, cy + h), (cx - gap - h, cy)], fill=RED)  # 마름모
    d.ellipse([cx - h, cy - h, cx + h, cy + h], fill=BLUE)  # 원
    d.rounded_rectangle([cx + gap - h, cy - h, cx + gap + h, cy + h], radius=size * 0.3, fill=LIME)  # 둥근사각형

def big_icon(px):
    """512 기준 설계를 px 로 그린다(전체가 꽉 찬 정사각형 — iOS/마스커블에서 모서리를 알아서 자름)"""
    S = px * SS
    k = S / 512.0
    im = Image.new('RGB', (S, S), 'white')
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([14 * k, 14 * k, S - 14 * k, S - 14 * k], radius=84 * k, outline=NAVY, width=int(16 * k))  # 군청 테두리
    mark(d, 256 * k, 112 * k, 56 * k, 100 * k)  # 상단 회사 마크
    hx, hy, r = 178 * k, 268 * k, 72 * k  # 열쇠 머리
    d.ellipse([hx - r, hy - r, hx + r, hy + r], fill=NAVY)
    f = ImageFont.truetype(FONT, int(104 * k))
    d.text((hx, hy + 4 * k), '6', font=f, fill='white', anchor='mm')  # 머리 안의 6
    d.rectangle([hx + r - 8 * k, hy - 14 * k, 404 * k, hy + 12 * k], fill=NAVY)  # 열쇠 몸통
    d.rectangle([336 * k, hy + 12 * k, 360 * k, hy + 50 * k], fill=NAVY)  # 이빨 1
    d.rectangle([374 * k, hy + 12 * k, 398 * k, hy + 38 * k], fill=NAVY)  # 이빨 2
    f2 = ImageFont.truetype(FONT, int(64 * k))
    d.text((256 * k, 412 * k), 'LAM 6Keys', font=f2, fill=NAVY, anchor='mm')  # 하단 글자
    return im.resize((px, px), Image.LANCZOS)

def small_icon(px):
    """16/32px 용 단순형: 열쇠 머리의 6 + 몸통만"""
    S = px * 8
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 0.22, fill=NAVY)
    f = ImageFont.truetype(FONT, int(S * 0.74))
    d.text((S * 0.5, S * 0.54), '6', font=f, fill='white', anchor='mm')
    d.polygon([(S * 0.14, S * 0.06), (S * 0.14 + S * 0.16, S * 0.06 + S * 0.0), (S * 0.14, S * 0.06)], fill=NAVY)
    d.polygon([(S * 0.80, S * 0.14), (S * 0.92, S * 0.26), (S * 0.80, S * 0.38), (S * 0.68, S * 0.26)], fill=RED)  # 모서리 작은 마름모
    return im.resize((px, px), Image.LANCZOS)

def deco(name, px=256):
    """마스터 장식 PNG(투명 배경)"""
    S = px * 4
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    m = S * 0.04
    if name == 'diamond':
        d.polygon([(S / 2, m), (S - m, S / 2), (S / 2, S - m), (m, S / 2)], fill=RED)
    elif name == 'circle':
        d.ellipse([m, m, S - m, S - m], fill=BLUE)
    else:
        d.rounded_rectangle([m, m, S - m, S - m], radius=S * 0.3, fill=LIME)
    return im.resize((px, px), Image.LANCZOS)

if __name__ == '__main__':
    base = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(base)
    os.makedirs(os.path.join(root, 'icons'), exist_ok=True)
    for px, name in [(512, 'icon-512.png'), (192, 'icon-192.png'), (180, 'apple-touch-icon.png')]:
        big_icon(px).save(os.path.join(root, 'icons', name))
    small_icon(32).save(os.path.join(root, 'icons', 'favicon-32.png'))
    small_icon(16).save(os.path.join(root, 'icons', 'favicon-16.png'))
    ico = [small_icon(s) for s in (16, 32, 48)]
    ico[2].save(os.path.join(root, 'icons', 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])
    for n in ('diamond', 'circle', 'round'):
        deco(n).save(os.path.join(base, 'deco_%s.png' % n))
    print('아이콘·장식 PNG 생성 완료')
