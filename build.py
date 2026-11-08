#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
New 6 Keys Weekly Report — 빌드 스크립트
설치 명령어: 없음 (파이썬 표준 라이브러리만 사용)
실행 방법  : python3 build.py   →  같은 폴더에 index.html(단일 파일, 외부 CDN 없음) 생성
역할       : src/ 의 템플릿·스타일·자바스크립트 조각 + lib/ 의 PptxGenJS·JSZip + data/ 의 주차별 JSON
            + tools/ 의 마스터 장식 PNG 를 한 파일로 합친다.
"""
import base64  # 장식 PNG 를 base64 로 바꾸기 위해 사용
import glob  # data/*.json 목록을 찾기 위해 사용
import json  # JSON 읽기/쓰기에 사용
import os  # 경로 처리에 사용
import sys  # 오류 종료 코드에 사용

ROOT = os.path.dirname(os.path.abspath(__file__))  # 이 스크립트가 있는 폴더(레포 최상위)


def read_text(path):  # 텍스트 파일을 UTF-8 로 읽는 함수
    try:  # 파일이 없을 때를 대비한다
        with open(os.path.join(ROOT, path), 'r', encoding='utf-8') as f:  # 파일을 연다
            return f.read()  # 내용을 돌려준다
    except FileNotFoundError:  # 파일이 없으면
        print('파일을 찾을 수 없습니다: ' + path)  # 한글 안내문을 출력한다
        sys.exit(1)  # 비정상 종료한다


def safe_script(js):  # <script> 안에 넣을 때 </script> 가 끼어들지 않게 막는 함수
    return js.replace('</script', '<\\/script')  # 닫는 태그 문자열을 이스케이프한다


def b64_png(path):  # PNG 파일을 data URI 문자열로 바꾸는 함수
    with open(os.path.join(ROOT, path), 'rb') as f:  # 바이너리로 연다
        return base64.b64encode(f.read()).decode('ascii')  # 순수 base64 문자열을 만든다(앱에서 data URI 로 조립)


def build_seed():  # data/*.json 을 모아 내장 자료(SEED)로 만드는 함수
    seed = {}  # 주차 → 자료 사전
    for p in sorted(glob.glob(os.path.join(ROOT, 'data', 'w*.json'))):  # w로 시작하는 주차 파일만 읽는다
        try:  # JSON 형식이 깨진 파일을 건너뛰기 위함
            with open(p, 'r', encoding='utf-8') as f:  # 파일을 연다
                d = json.load(f)  # JSON 으로 읽는다
            seed[d['week']] = d  # 주차 키로 저장한다
        except Exception as e:  # 읽기 실패 시
            print('데이터 형식이 올바르지 않습니다: ' + p + ' (' + str(e) + ')')  # 한글 안내문을 출력한다
    return seed  # 내장 자료를 돌려준다


def main():  # 전체 빌드를 수행하는 함수
    tpl = read_text('src/template.html')  # HTML 틀을 읽는다
    css = read_text('src/style.css')  # 스타일을 읽는다
    parts = ['01_core.js', '02_scene.js', '03_render.js', '04_pptx.js', '05_app.js']  # 합칠 자바스크립트 조각 순서
    app = '\n'.join(read_text('src/' + p) for p in parts)  # 조각을 순서대로 이어 붙인다
    jszip = read_text('lib/jszip.min.js')  # JSZip(minified)
    pptx = read_text('lib/pptxgen.min.js')  # PptxGenJS(minified)
    seed = build_seed()  # 내장 주차 자료
    deco = {  # 마스터 장식 3개(빨강 마름모 · 남색 원 · 연두 둥근사각형)
        'diamond': b64_png('tools/deco_diamond.png'),  # 빨강 마름모
        'circle': b64_png('tools/deco_circle.png'),  # 남색 원
        'round': b64_png('tools/deco_round.png'),  # 연두 둥근사각형
    }
    data_js = 'window.__SEED__=' + json.dumps(seed, ensure_ascii=False) + ';\nwindow.__DECO__=' + json.dumps(deco) + ';'  # 자료 스크립트
    out = tpl  # 틀에서 시작한다
    out = out.replace('/*__STYLE__*/', css)  # 스타일 삽입
    out = out.replace('/*__LIB_JSZIP__*/', safe_script(jszip))  # JSZip 삽입
    out = out.replace('/*__LIB_PPTX__*/', safe_script(pptx))  # PptxGenJS 삽입
    out = out.replace('/*__DATA__*/', safe_script(data_js))  # 내장 자료·장식 삽입
    out = out.replace('/*__APP__*/', safe_script(app))  # 앱 코드 삽입
    with open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf-8') as f:  # 결과 파일을 쓴다
        f.write(out)  # 저장한다
    print('빌드 완료: index.html (%d KB), 내장 주차 %d개' % (len(out.encode('utf-8')) // 1024, len(seed)))  # 결과 요약


if __name__ == '__main__':  # 직접 실행했을 때만
    main()  # 빌드를 수행한다
