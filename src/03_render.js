// ============================================================================
// 03_render.js — 화면 렌더러: 장면(scene)을 DOM/SVG 로 그린다 (+ 글 넘침 측정, 마스터, PNG 변환)
// 이 렌더러와 PPT 변환기(04_pptx.js)는 같은 장면 요소를 읽는다.
// ============================================================================

// ───────────────────────── 1. 단위 변환 ─────────────────────────
function px(inch) { return inch * PXI; } // 인치 → 화면 px
function ptpx(pt) { return pt * PXPT; } // pt → 화면 px
function chartDec(el, vals) { // 차트 라벨 소수 자릿수(화면·PPT 공통 규칙)
  if (el.dec === 2) return 2; // WTI 는 소수 2자리 고정
  const nonInt = (vals || []).some(v => isFinite(v) && Math.abs(v - Math.round(v)) > 1e-9); // 소수가 하나라도 있는지
  return nonInt ? 1 : 0; // 있으면 1자리, 없으면 정수
}
function fmtDec(v, d) { // 소수 d자리 + 천 단위 쉼표
  if (!isFinite(v)) return ''; // 값이 없으면 빈칸
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); // 변환
}

// ───────────────────────── 2. 문단 → HTML ─────────────────────────
function runHTML(r) { // 글자 조각 1개를 span 으로
  let st = 'font-size:' + ptpx(r.sz).toFixed(2) + 'px;color:#' + r.c + ';'; // 크기·색
  if (r.b) st += 'font-weight:700;'; // 굵게
  const deco = []; if (r.u) deco.push('underline'); if (r.s) deco.push('line-through'); // 밑줄·취소선
  if (deco.length) st += 'text-decoration:' + deco.join(' ') + ';'; // 장식선
  if (r.hl) st += 'background:#' + r.hl + ';'; // 형광펜
  return '<span style="' + st + '">' + (esc(r.t) || '​') + '</span>'; // 빈 조각은 폭 없는 문자로 높이 확보
}
function parasHTML(paras) { // 문단 목록 → HTML 문자열
  return (paras || []).map((p, i) => { // 문단마다
    const mx = Math.max.apply(null, p.runs.map(r => r.sz)); // 문단 안 최대 글자 크기
    const st = 'font-size:' + ptpx(mx).toFixed(2) + 'px;text-align:' + ({ l: 'left', c: 'center', r: 'right' }[p.al] || 'left') + ';' + (p.sp && i > 0 ? 'margin-top:' + ptpx(p.sp).toFixed(2) + 'px;' : ''); // 줄 높이 기준 크기·정렬·간격
    return '<div class="p' + (p.bul ? ' bul' : '') + '" data-pi="' + i + '" style="' + st + '">' + p.runs.map(runHTML).join('') + '</div>'; // 문단 div
  }).join(''); // 합치기
}
function measureH(paras, wIn, ins) { // 문단들이 차지하는 높이(인치)를 실제로 재는 함수 (자동 맞춤용)
  const box = document.getElementById('measure'); // 측정 영역
  const d = document.createElement('div'); // 임시 상자
  d.style.cssText = 'position:absolute;left:0;top:0;width:' + px(wIn - ins[0] - ins[2]).toFixed(2) + 'px;'; // 폭만 지정
  d.innerHTML = parasHTML(paras); // 문단 넣기
  box.appendChild(d); // 붙이기
  const h = d.getBoundingClientRect().height; // 높이 측정
  box.removeChild(d); // 치우기
  return h / PXI + ins[1] + ins[3]; // 인치로 환산 + 위아래 여백
}

// ───────────────────────── 3. 요소 → DOM ─────────────────────────
function baseBox(el) { // 요소 공통 상자(위치·크기)
  const d = document.createElement('div'); // div
  d.className = 'el'; // 공통 클래스
  d.style.left = px(el.x).toFixed(2) + 'px'; // x
  d.style.top = px(el.y).toFixed(2) + 'px'; // y
  d.style.width = px(el.w).toFixed(2) + 'px'; // 폭
  d.style.height = px(el.h).toFixed(2) + 'px'; // 높이
  return d; // 반환
}
function applyText(d, el) { // 글자 영역(여백·세로 정렬)을 적용
  const ins = el.ins || [0, 0, 0, 0]; // 여백
  d.style.padding = [ins[1], ins[2], ins[3], ins[0]].map(v => px(v).toFixed(2) + 'px').join(' '); // 위 오른 아래 왼
  d.style.justifyContent = { t: 'flex-start', m: 'center', b: 'flex-end' }[el.va] || 'flex-start'; // 세로 정렬
  d.innerHTML = '<div class="in">' + parasHTML(el.paras) + '</div>'; // 문단 넣기
}
function renderText(el) { // 텍스트 상자
  const d = baseBox(el); // 상자
  applyText(d, el); // 글자
  return d; // 반환
}
function renderShape(el) { // 도형(글자 포함)
  const d = baseBox(el); // 상자
  if (el.shp === 'line') { // 선은 SVG 로
    d.style.overflow = 'visible'; // 높이 0 이어도 보이게
    const lw = ptpx(el.line ? el.line.w : 1); // 선 굵기
    const y1 = el.flipV ? px(el.h) : 0, y2 = el.flipV ? 0 : px(el.h); // 뒤집힘 처리
    const dash = el.line && el.line.dash === 'dash' ? '8 5' : (el.line && el.line.dash === 'sysDot' ? '2 3' : ''); // 점선 종류
    d.innerHTML = '<svg style="position:absolute;left:0;top:0;overflow:visible" width="' + px(el.w).toFixed(2) + '" height="' + Math.max(1, px(el.h)).toFixed(2) + '"><line x1="0" y1="' + y1.toFixed(2) + '" x2="' + px(el.w).toFixed(2) + '" y2="' + y2.toFixed(2) + '" stroke="#' + (el.line ? el.line.c : '000000') + '" stroke-width="' + lw.toFixed(2) + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/></svg>'; // 선
    return d; // 반환
  }
  if (el.fill) d.style.background = '#' + el.fill; // 채움
  if (el.line) d.style.boxShadow = 'inset 0 0 0 ' + ptpx(el.line.w).toFixed(2) + 'px #' + el.line.c; // 테두리(레이아웃에 영향 없게 안쪽 그림자)
  if (el.shp === 'round') d.style.borderRadius = px(el.rad).toFixed(2) + 'px'; // 둥근 모서리(알약은 rad = 높이/2)
  if (el.shp === 'ellipse') d.style.borderRadius = '50%'; // 타원
  if (el.shp === 'diamond') d.style.clipPath = 'polygon(50% 0,100% 50%,50% 100%,0 50%)'; // 마름모
  if (el.paras) applyText(d, el); // 같은 도형 안의 글자
  return d; // 반환
}
function borderCss(b) { return b ? ptpx(b.w).toFixed(2) + 'px solid #' + b.c : 'none'; } // 선 서식 → CSS
function renderTable(el) { // 표(HTML table)
  const wrap = baseBox({ x: el.x, y: el.y, w: el.colW.reduce((a, b) => a + b, 0), h: el.rowH.reduce((a, b) => a + b, 0) }); // 바깥 상자
  wrap.style.overflow = 'visible'; // 표가 커져도 잘리지 않게
  const t = document.createElement('table'); // 표
  t.style.cssText = 'border-collapse:collapse;table-layout:fixed;width:' + px(el.colW.reduce((a, b) => a + b, 0)).toFixed(2) + 'px;'; // 고정 레이아웃
  let cg = '<colgroup>' + el.colW.map(w => '<col style="width:' + px(w).toFixed(2) + 'px">').join('') + '</colgroup>'; // 열 너비
  let body = ''; // 행 HTML
  el.rows.forEach((row, ri) => { // 행마다
    body += '<tr style="height:' + px(el.rowH[ri]).toFixed(2) + 'px"' + (row.go !== undefined ? ' data-go="' + row.go + '"' : '') + ' data-ri="' + ri + '">'; // 행 시작
    row.forEach((c, ci) => { // 셀마다
      let st = 'padding:' + [c.ins[1], c.ins[2], c.ins[3], c.ins[0]].map(v => px(v).toFixed(2) + 'px').join(' ') + ';vertical-align:' + ({ t: 'top', m: 'middle', b: 'bottom' }[c.va] || 'middle') + ';overflow:hidden;'; // 여백·세로 정렬
      if (c.fill) st += 'background:#' + c.fill + ';'; // 배경
      const mode = el.border; // 표 테두리 방식
      let bl = null, br = null, bt = null, bb = null; // 기본 테두리
      if (mode === 'cell') { bl = br = bt = bb = { c: C.line, w: 0.75 }; } // 셀별 개별
      else if (mode === 'all') { bl = br = bt = bb = { c: C.blk, w: 0.75 }; } // 전체
      else if (mode === 'h' && ri > 0) { bb = { c: C.line, w: 0.75 }; } // 가로선만(본문 아래선)
      if (c.bd.l) bl = c.bd.l; if (c.bd.r) br = c.bd.r; if (c.bd.t) bt = c.bd.t; if (c.bd.b) bb = c.bd.b; // 셀 지정 우선
      st += 'border-left:' + borderCss(bl) + ';border-right:' + borderCss(br) + ';border-top:' + borderCss(bt) + ';border-bottom:' + borderCss(bb) + ';'; // 테두리
      body += '<td data-ci="' + ci + '"' + (c.cs > 1 ? ' colspan="' + c.cs + '"' : '') + (c.rs > 1 ? ' rowspan="' + c.rs + '"' : '') + ' style="' + st + '">' + parasHTML(c.paras) + '</td>'; // 셀
    });
    body += '</tr>'; // 행 끝
  });
  t.innerHTML = cg + '<tbody>' + body + '</tbody>'; // 표 내용
  wrap.appendChild(t); // 붙이기
  Array.from(t.querySelectorAll('tr')).forEach((tr, ri) => { // 셀에 장면 참조 연결(편집용)
    Array.from(tr.children).forEach((td, ci) => { td._cell = el.rows[ri][ci]; td._bind = el.rows[ri][ci] ? el.rows[ri][ci].bind : null; }); // 연결
  });
  return wrap; // 반환
}
function svgText(x, y, s, o) { // SVG 글자 한 줄
  return '<text x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" text-anchor="' + (o.anchor || 'middle') + '" font-size="' + ptpx(o.sz).toFixed(2) + '" fill="#' + o.c + '"' + (o.b ? ' font-weight="700"' : '') + '>' + esc(s) + '</text>'; // 글자
}
function renderChart(el) { // 차트(SVG)
  const d = baseBox(el); // 바깥 상자
  d.style.overflow = 'visible'; // 라벨이 살짝 넘쳐도 보이게
  const W = px(el.w), H = px(el.h); // 전체 크기(px)
  const pl = el.plot.x * W, pt = el.plot.y * H, pw = el.plot.w * W, ph = el.plot.h * H; // 플롯 영역
  const n = el.cats.length; // 범주 수
  const slot = pw / n; // 범주 한 칸 폭
  const yOf = v => pt + ph * (1 - (v - el.min) / (el.max - el.min)); // 값 → y
  const allVals = []; el.series.forEach(s => s.vals.forEach(v => allVals.push(v))); // 모든 값
  const dec = chartDec(el, el.series.filter(s => s.labels).reduce((a, s) => a.concat(s.vals), [])); // 라벨 소수 자릿수
  let g = ''; // SVG 내용
  g += '<line x1="' + pl.toFixed(2) + '" y1="' + (pt + ph).toFixed(2) + '" x2="' + (pl + pw).toFixed(2) + '" y2="' + (pt + ph).toFixed(2) + '" stroke="#BFBFBF" stroke-width="' + ptpx(0.75).toFixed(2) + '"/>'; // 범주 축선
  el.cats.forEach((c, i) => { g += svgText(pl + slot * (i + 0.5), pt + ph + ptpx(8) + 6, c, { sz: 8, c: '404040' }); }); // 범주 라벨(아래쪽)
  el.series.filter(s => s.kind === 'bar').forEach(s => { // 막대 먼저
    const bw = slot / (1 + (el.gap || 60) / 100); // 막대 폭
    s.vals.forEach((v, i) => { // 막대마다
      if (!isFinite(v)) return; // 값 없으면 건너뜀
      const y = yOf(v), col = (s.ptColors && s.ptColors[i]) || s.color; // 위치·색
      g += '<rect x="' + (pl + slot * i + (slot - bw) / 2).toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + bw.toFixed(2) + '" height="' + Math.max(0, pt + ph - y).toFixed(2) + '" fill="#' + col + '"/>'; // 막대
      if (s.labels) g += svgText(pl + slot * (i + 0.5), y - 5, fmtDec(v, dec), { sz: s.labels.sz, b: s.labels.b, c: s.labels.c }); // 바깥 끝 라벨
    });
  });
  el.series.filter(s => s.kind === 'line').forEach(s => { // 선
    const pts = s.vals.map((v, i) => isFinite(v) ? [pl + slot * (i + 0.5), yOf(v)] : null); // 점 좌표
    const ok = pts.filter(Boolean); // 유효한 점
    const dash = s.dash === 'dash' ? ' stroke-dasharray="9 6"' : ''; // 점선
    g += '<polyline fill="none" stroke="#' + s.color + '" stroke-width="' + ptpx(s.lw || 2).toFixed(2) + '"' + dash + ' points="' + ok.map(p => p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(' ') + '"/>'; // 선
    ok.forEach((p, i) => { // 마커·라벨
      if (s.marker) g += '<circle cx="' + p[0].toFixed(2) + '" cy="' + p[1].toFixed(2) + '" r="' + ptpx(5).toFixed(2) + '" fill="#FFFFFF" stroke="#' + s.color + '" stroke-width="' + ptpx(1.75).toFixed(2) + '"/>'; // 흰 채움 원형 마커
      if (s.labels) g += svgText(p[0], p[1] - (s.marker ? ptpx(5) + 5 : 5), fmtDec(s.vals[pts.indexOf(p)], dec), { sz: s.labels.sz, b: s.labels.b, c: s.labels.c }); // 위쪽 라벨
    });
  });
  d.innerHTML = '<svg width="' + W.toFixed(2) + '" height="' + H.toFixed(2) + '" viewBox="0 0 ' + W.toFixed(2) + ' ' + H.toFixed(2) + '" style="overflow:visible;position:absolute;left:0;top:0">' + g + '</svg>'; // SVG
  return d; // 반환
}
function renderEl(el, opt) { // 요소 1개 → DOM
  let d; // 결과
  if (el.t === 'text') d = renderText(el); // 글자
  else if (el.t === 'shape') d = renderShape(el); // 도형
  else if (el.t === 'table') d = renderTable(el); // 표
  else if (el.t === 'chart') d = renderChart(el); // 차트
  else throw new Error('알 수 없는 요소 종류입니다'); // 한글 오류
  d._el = el; // 장면 참조 연결(편집·발표용)
  d.dataset.s = String(el.step || 0); // 등장 단계
  if (!opt.all && (el.step || 0) > opt.stepNo) d.classList.add('step-hide'); // 아직 안 나타날 요소
  if (el.bind && opt.edit) { // 편집 모드에서 점선 칸 표시
    if (el.t === 'shape' && el.bind.para !== undefined) { const p = d.querySelectorAll('.p')[el.bind.para]; if (p) { p.classList.add('editable'); p._bind = el.bind; } } // 문단 하나만 편집
    else { d.classList.add('editable'); d._bind = el.bind; } // 요소 전체 편집
  }
  if (el.t === 'table' && opt.edit) d.querySelectorAll('td').forEach(td => { if (td._bind) td.classList.add('editable'); }); // 표 셀 편집 표시
  return d; // 반환
}
function renderPage(slide, opt) { // 한 쪽(.page) 만들기. opt: {stepNo, edit, all}
  const o = Object.assign({ stepNo: 0, edit: false, all: false }, opt || {}); // 기본값
  const page = document.createElement('div'); // 쪽 상자
  page.className = 'page'; // 클래스
  slide.els.forEach(el => { try { page.appendChild(renderEl(el, o)); } catch (e) { console.error(e); toast('요소를 그리지 못했습니다 : ' + e.message); } }); // 요소 그리기
  return page; // 반환
}
function checkTableOverlap(page, slide) { // 표가 계획보다 커져서 아래 요소와 겹치는지 검사 (화면 글꼴 차이 대비)
  const warns = []; // 경고
  page.querySelectorAll('.el').forEach(d => { // 요소마다
    if (!d._el || d._el.t !== 'table') return; // 표만
    const t = d.querySelector('table'); // 표 DOM
    const real = t.getBoundingClientRect().height / (page.getBoundingClientRect().width / 1600) / PXI; // 실제 높이(인치, 배율 보정)
    const plan = d._el.rowH.reduce((a, b) => a + b, 0); // 계획 높이
    if (real > plan + 0.03) warns.push('표 높이가 계획보다 ' + (real - plan).toFixed(2) + 'in 커졌습니다 (' + slide.name + ') — 글자 크기·행 높이 확인 필요'); // 경고
  });
  return warns; // 반환
}

// ───────────────────────── 4. 마스터(구분선 + 장식 3개) ─────────────────────────
function masterNode() { // 마스터 층 DOM — 쪽 전환 중에도 고정
  const m = document.createElement('div'); // 컨테이너
  m.style.cssText = 'position:absolute;inset:0;'; // 전체 덮기
  const ln = document.createElement('div'); // 구분선
  ln.style.cssText = 'position:absolute;left:0;width:1600px;top:' + (px(0.752) - ptpx(1) / 2).toFixed(2) + 'px;height:' + ptpx(1).toFixed(2) + 'px;background:#' + C.navy + ';'; // 남색 1pt
  m.appendChild(ln); // 추가
  [['diamond', 8.958], ['circle', 9.231], ['round', 9.505]].forEach(a => { // 장식 3개
    const im = document.createElement('img'); // 그림
    im.src = 'data:image/png;base64,' + (DECO[a[0]] || ''); // 내장 PNG
    im.style.cssText = 'position:absolute;left:' + px(a[1]).toFixed(2) + 'px;top:' + px(0.6595 - 0.0925).toFixed(2) + 'px;width:' + px(0.185).toFixed(2) + 'px;height:' + px(0.185).toFixed(2) + 'px;'; // 0.185in
    m.appendChild(im); // 추가
  });
  return m; // 반환
}
function drawMaster() { // 마스터 층에 그리기
  const ml = document.getElementById('masterLayer'); // 마스터 층
  ml.innerHTML = ''; // 비우기
  ml.appendChild(masterNode()); // 마스터 그리기
}

// ───────────────────────── 5. 화면 배율 ─────────────────────────
function fitStage() { // 창 크기에 맞춰 1600×1194 캔버스를 축소·중앙 배치
  const vp = document.getElementById('viewport'); // 영역
  const st = document.getElementById('stage'); // 캔버스
  const vw = vp.clientWidth, vh = vp.clientHeight; // 영역 크기
  const sc = Math.min(vw / 1600, vh / 1194); // 배율
  const ox = (vw - 1600 * sc) / 2, oy = (vh - 1194 * sc) / 2; // 중앙 정렬 여백
  st.style.transform = 'translate(' + ox.toFixed(2) + 'px,' + oy.toFixed(2) + 'px) scale(' + sc.toFixed(5) + ')'; // 변환
  st.dataset.scale = String(sc); // 배율 기록(레이저·클릭 좌표용)
  st.dataset.ox = String(ox); st.dataset.oy = String(oy); // 오프셋 기록
  return sc; // 배율 반환
}

// ───────────────────────── 6. PNG 변환 (마스터 포함) ─────────────────────────
function slideToXhtml(slide) { // 쪽 + 마스터를 하나의 XHTML 문자열로
  const stage = document.createElement('div'); // 임시 캔버스
  stage.id = 'stage'; // 같은 CSS 적용
  stage.style.cssText = 'position:relative;transform:none;box-shadow:none;width:1600px;height:1194px;background:#fff;'; // 크기
  const pl = document.createElement('div'); pl.id = 'pageLayer'; pl.appendChild(renderPage(slide, { all: true })); // 쪽 층
  const ml = document.createElement('div'); ml.id = 'masterLayer'; ml.appendChild(masterNode()); // 마스터 층
  stage.appendChild(pl); stage.appendChild(ml); // 조립
  stage.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml'); // XHTML 이름공간
  const css = Array.from(document.querySelectorAll('style')).map(s => s.textContent).join('\n'); // 현재 CSS
  const body = new XMLSerializer().serializeToString(stage); // 유효한 XML 로 직렬화
  return '<div xmlns="http://www.w3.org/1999/xhtml" style="font-family:\'Malgun Gothic\',\'맑은 고딕\',\'Noto Sans CJK KR\',\'Noto Sans KR\',sans-serif"><style><![CDATA[' + css + ']]></style>' + body + '</div>'; // 결과
}
async function slideToPngBlob(slide, wpx, hpx, mime, quality) { // 쪽 → 이미지 Blob (기본 PNG 3060×2284, mime 으로 JPEG 선택 가능)
  try { // 실패하면 한글 안내
    const W = wpx || 3060, H = hpx || 2284; // 출력 크기
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1194"><foreignObject x="0" y="0" width="1600" height="1194">' + slideToXhtml(slide) + '</foreignObject></svg>'; // SVG 포장
    const img = new Image(); // 이미지 객체
    const loaded = new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('이미지 변환에 실패했습니다')); }); // 로드 대기
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); // 로드 시작
    await loaded; // 대기
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; // 캔버스
    const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, W, H); // 흰 바탕
    cx.drawImage(img, 0, 0, W, H); // 그리기
    return await new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('이미지 변환에 실패했습니다')), mime || 'image/png', quality)); // Blob
  } catch (e) { // 오류
    console.error(e); // 기록
    throw new Error('이미지 변환에 실패했습니다. 브라우저를 최신 버전으로 사용해 주세요.'); // 한글 안내
  }
}
