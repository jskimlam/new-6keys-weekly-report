# New 6 Keys Weekly Report

6대 원료(WTI · SM · AN · BD · BPA · MMA) 주간 가격 아카이브를 **회사 양식 슬라이드**로 보여 주고,
**전체화면 발표**와 **편집 가능한 PPT(.pptx) 저장**까지 되는 단일 HTML 앱입니다.
기존 [Weekly-Brief-Dashboard](https://jskimlam.github.io/Weekly-Brief-Dashboard/) 와 **같은 구글 시트(Apps Script)** 를 공유합니다.

- 실행: `index.html` 더블클릭 (설치 명령어 없음, CDN·인터넷 의존 없음 — PptxGenJS·JSZip 인라인)
- 시작 화면: 바로 슬라이드(요약 1장 + 품목 6장). 상단 주차 선택으로 아카이브 이동(최근 6주 그래프 자동 갱신)
- 발표: `F5`/`F` 전체화면, `→ ←` 이동, `B`/`W` 검은·흰 화면, `L` 레이저, `O` 목차, `S` 단계 등장, `T` 전환, 숫자+Enter 쪽 이동, `Esc` 종료
- 관리자: 우측 상단 🔒 관리자 → 비밀번호 입력 → 편집(E)·품목 입력·시트 저장·새 주차·JSON·새로고침
- 저장: PNG(3060×2284, 마스터 포함), PPT(현재 쪽 / 선택 쪽 / 전체 / 쪽별 개별 파일)

## 구조
```
src/template.html  src/style.css
src/01_core.js     설정·유틸·시트(GAS) 연동·병합 규칙
src/02_scene.js    장면(scene) 모델 — 화면과 PPT 가 함께 읽는 요소 목록
src/03_render.js   화면 렌더러(DOM/SVG)·마스터·PNG
src/04_pptx.js     PptxGenJS 변환 + JSZip 후처리(차트 XML·내장 엑셀·슬라이드 마스터)
src/05_app.js      발표·관리자·편집·초기화
data/              내장 주차 자료(W40~W45, 시트 장애 대비)
build.py           src + lib + data 를 index.html 하나로 합침  →  python3 build.py
tests/             Playwright / python-pptx 검증 스크립트
```

## 빌드·검증
```
python3 build.py                                  # index.html 생성
pip install playwright python-pptx lxml
python3 tests/behave.py                           # 발표·전환·편집·PPT 반영 자동 점검
python3 tests/export.py && python3 tests/check_pptx.py out/all.pptx
```

## GitHub Pages
Settings → Pages → Branch `main` / `/ (root)` 로 켜면 `https://jskimlam.github.io/new-6keys-weekly-report/` 에서 열립니다.

## 주의
- 관리자 비밀번호는 요청에 따라 `src/01_core.js` 에 들어 있습니다. 공개 레포이므로 **접근 제어 수단이 아닙니다.**
- 마스터 장식 PNG 3개는 회사 원본이 없어 비슷하게 만든 근사본입니다. 원본이 있으면 `tools/deco_*.png` 를 교체 후 `python3 build.py`.
- 시트 저장 시 `ai_outlook`/`prev_price`/`headline` 이 시트에 실제로 보존되는지는 Apps Script 쪽 구현에 달려 있습니다(저장 후 새로고침으로 확인, 안 되면 JSON 내려받기 사용).
