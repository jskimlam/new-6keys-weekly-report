// ============================================================================
// 04_pptx.js — PPT 저장: 장면(scene)을 PptxGenJS 네이티브 개체로 바꾸고 JSZip 으로 후처리한다
// 파이프라인(고정 순서): ① 장면 확정 → ② PptxGenJS 슬라이드 생성 → ③ JSZip 후처리
//                       (patchCharts → 내장 엑셀 빈 값 제거 → 마스터 삽입) → ④ Blob 다운로드
// 그래프·표·카드는 이미지로 붙이지 않는다. 글자는 해당 도형/표/텍스트 상자 안에 넣는다.
// ============================================================================

const FACE = 'Malgun Gothic'; // PPT 에는 이 글꼴만 기록
const EMU = 914400; // 1인치 = 914400 EMU
class PptxStageError extends Error { // 어느 단계에서 실패했는지 알리기 위한 오류
  constructor(stage, msg) { super(msg); this.stage = stage; } // 단계 이름 기록
}

// ───────────────────────── 1. 글자(run·문단) 변환 ─────────────────────────
function pptRuns(paras) { // 장면 문단 목록 → PptxGenJS 글자 배열 (한 상자에 모든 문단·조각을 담는다)
  const out = []; // 결과
  (paras || []).forEach((p, pi) => { // 문단마다
    const lastPara = pi === paras.length - 1; // 마지막 문단 여부
    p.runs.forEach((r, ri) => { // 조각마다
      const o = { fontFace: FACE, fontSize: r.sz, bold: !!r.b, color: r.c, align: ({ l: 'left', c: 'center', r: 'right' })[p.al] || 'left', lineSpacingMultiple: 0.95 }; // 조각 서식 + 문단 서식
      if (r.u) o.underline = { style: 'sng', color: r.c }; // 밑줄
      if (r.s) o.strike = 'sngStrike'; // 취소선
      if (r.hl) o.highlight = r.hl; // 형광펜
      if (p.bul) o.bullet = { indent: 9.4 }; // 글머리표(0.13in = 9.4pt)
      if (p.sp && pi > 0) o.paraSpaceBefore = p.sp; // 문단 앞 간격
      if (ri === p.runs.length - 1 && !lastPara) o.breakLine = true; // 문단 끝에서 줄바꿈
      out.push({ text: r.t === '' ? ' ' : r.t, options: o }); // 조각 추가
    });
  });
  return out; // 반환
}
function marginPts(ins) { // 인치 여백 [왼,위,오,아래] → PptxGenJS [왼,오,아래,위] (pt)
  const f = v => Math.max(0, v * 72); // 인치 → pt
  return [f(ins[0]), f(ins[2]), f(ins[3]), f(ins[1])]; // 순서 변환
}
function lineOpt(l) { // 선 서식 변환
  if (!l) return undefined; // 선 없음
  return { color: l.c, width: l.w, dashType: l.dash === 'dash' ? 'dash' : (l.dash === 'sysDot' ? 'sysDot' : 'solid') }; // 선 옵션
}

// ───────────────────────── 2. 텍스트·도형 ─────────────────────────
function addTextEl(pptx, slide, el) { // 텍스트 상자 1개
  slide.addText(pptRuns(el.paras), { x: el.x, y: el.y, w: Math.max(el.w, 0.01), h: Math.max(el.h, 0.01), margin: marginPts(el.ins || [0, 0, 0, 0]), valign: { t: 'top', m: 'middle', b: 'bottom' }[el.va] || 'top', fit: 'none', wrap: true, fontFace: FACE, autoFit: false }); // 텍스트 상자
}
function addShapeEl(pptx, slide, el) { // 도형 1개(글자가 있으면 같은 도형 안에)
  const T = pptx.ShapeType; // 도형 종류표
  const shapeType = { rect: T.rect, round: T.roundRect, ellipse: T.ellipse, diamond: T.diamond, line: T.line, bracket: T.rightBracket }[el.shp] || T.rect; // 종류 선택
  const w = Math.max(el.w, el.shp === 'line' ? 0.0001 : 0.01), h = Math.max(el.h, el.shp === 'line' ? 0.0001 : 0.01); // 최소 크기 보장(두께 0 오류 방지)
  const o = { x: el.x, y: el.y, w, h }; // 기본 위치·크기
  if (el.fill) o.fill = { color: el.fill }; else if (el.shp !== 'line') o.fill = { type: 'none' }; // 채움
  if (el.line) o.line = lineOpt(el.line); else if (el.shp !== 'line') o.line = { type: 'none' }; // 테두리
  if (el.flipV) o.flipV = true; // 오른쪽 위로 향하는 선
  if (el.shp === 'round') o.rectRadius = Math.min(el.rad, Math.min(w, h) / 2); // 모서리 반경(인치) — 알약은 높이의 절반
  if (el.paras && el.shp !== 'line') { // 글자가 들어 있는 도형
    Object.assign(o, { shape: shapeType, margin: marginPts(el.ins), valign: { t: 'top', m: 'middle', b: 'bottom' }[el.va] || 'middle', fit: 'none', wrap: true, fontFace: FACE }); // 텍스트 + 도형 일체
    slide.addText(pptRuns(el.paras), o); // 글자 포함 도형
  } else { // 글자 없는 도형
    slide.addShape(shapeType, o); // 도형만
  }
}

// ───────────────────────── 3. 표 ─────────────────────────
function cellBorder(el, ri, c) { // 셀 테두리 [위,오른,아래,왼] 만들기
  const none = { type: 'none' }; // 없음
  const mk = b => b ? { type: 'solid', pt: b.w, color: b.c } : none; // 선 → PptxGenJS 테두리
  let t = null, r = null, b = null, l = null; // 기본
  if (el.border === 'cell') t = r = b = l = { c: C.line, w: 0.75 }; // 셀별 개별
  else if (el.border === 'all') t = r = b = l = { c: C.blk, w: 0.75 }; // 전체
  else if (el.border === 'h' && ri > 0) b = { c: C.line, w: 0.75 }; // 가로선만
  if (c.bd.t) t = c.bd.t; if (c.bd.r) r = c.bd.r; if (c.bd.b) b = c.bd.b; if (c.bd.l) l = c.bd.l; // 셀 지정 우선
  return [mk(t), mk(r), mk(b), mk(l)]; // 위·오른·아래·왼
}
function addTableEl(pptx, slide, el) { // 표 1개 (PPT 표 개체)
  const rows = el.rows.map((row, ri) => row.map(c => { // 행·셀 변환
    const opt = { valign: { t: 'top', m: 'middle', b: 'bottom' }[c.va] || 'middle', margin: marginPts(c.ins).map(v => Math.max(1, v)), border: cellBorder(el, ri, c), fontFace: FACE }; // 셀 옵션(여백 최소 1pt)
    if (c.fill) opt.fill = { color: c.fill }; // 배경
    if (c.cs > 1) opt.colspan = c.cs; // 가로 병합
    if (c.rs > 1) opt.rowspan = c.rs; // 세로 병합
    return { text: pptRuns(c.paras), options: opt }; // 셀
  }));
  slide.addTable(rows, { x: el.x, y: el.y, colW: el.colW, rowH: el.rowH, autoPage: false, fontFace: FACE, margin: 0 }); // 표 생성(자동 페이지 분할 끔)
}

// ───────────────────────── 4. 차트(틀 생성) ─────────────────────────
function chartFmt(dec) { return dec === 2 ? '#,##0.00' : (dec === 1 ? '#,##0.0' : '#,##0'); } // 라벨 숫자 서식
function addChartEl(pptx, slide, el, specs) { // 차트 틀 생성 + 후처리용 명세 기록
  const bars = el.series.filter(s => s.kind === 'bar'), lines = el.series.filter(s => s.kind === 'line'); // 종류별 계열
  const labelled = el.series.filter(s => s.labels); // 라벨이 있는 계열
  const dec = chartDec(el, labelled.reduce((a, s) => a.concat(s.vals), [])); // 소수 자릿수(화면과 동일 규칙)
  const base = { x: el.x, y: el.y, w: el.w, h: el.h, showLegend: false, valAxisHidden: true, valAxisMinVal: el.min, valAxisMaxVal: el.max, valGridLine: { style: 'none' }, catGridLine: { style: 'none' }, catAxisLabelFontFace: FACE, catAxisLabelFontSize: 8, catAxisLabelColor: '404040', catAxisLabelPos: 'low', catAxisLineShow: true, layout: { x: el.plot.x, y: el.plot.y, w: el.plot.w, h: el.plot.h }, plotArea: { fill: { color: 'FFFFFF', transparency: 100 } }, dataLabelFontFace: FACE }; // 공통 옵션
  const lab = (labelled[0] && labelled[0].labels) || null; // 라벨 서식
  if (lab) Object.assign(base, { showValue: true, dataLabelFontSize: lab.sz, dataLabelFontBold: !!lab.b, dataLabelColor: lab.c, dataLabelFormatCode: chartFmt(dec) }); // 라벨 옵션
  const data = el.series.map(s => ({ name: s.name, labels: el.cats, values: s.vals })); // 데이터(내장 엑셀로 들어감)
  let type; // 차트 종류
  if (bars.length) { // 막대(+선은 후처리에서 이동)
    type = pptx.charts.BAR; // 막대
    Object.assign(base, { barDir: 'col', barGrouping: 'clustered', barGapWidthPct: el.gap || 60, chartColors: bars[0].ptColors || [bars[0].color], dataLabelPosition: 'outEnd' }); // 막대 옵션
    if (bars[0].ptColors) base.chartColors = bars[0].ptColors; // 점별 색
  } else { // 선만
    type = pptx.charts.LINE; // 선
    Object.assign(base, { chartColors: [lines[0].color], lineSize: lines[0].lw, lineDataSymbol: 'circle', lineDataSymbolSize: 10, lineDataSymbolLineSize: 1.75, lineDataSymbolLineColor: lines[0].color, lineSmooth: false, dataLabelPosition: 't' }); // 선 옵션(마커 원형 크기 10)
  }
  slide.addChart(type, data, base); // 차트 틀 생성
  specs.push({ el, firstName: el.series[0].name, hasBars: bars.length > 0, lines: bars.length ? lines : [], ptColors: bars.length ? bars[0].ptColors : null }); // 후처리 명세
}

// ───────────────────────── 5. 쪽 → 슬라이드 ─────────────────────────
function addSlideFromScene(pptx, slideScene, specs) { // 쪽 1장을 슬라이드로
  const s = pptx.addSlide(); // 슬라이드
  s.background = { color: 'FFFFFF' }; // 흰 바탕
  slideScene.els.forEach(el => { // 요소 순서대로(뒤→앞)
    if (el.t === 'text') addTextEl(pptx, s, el); // 글자
    else if (el.t === 'shape') addShapeEl(pptx, s, el); // 도형
    else if (el.t === 'table') addTableEl(pptx, s, el); // 표
    else if (el.t === 'chart') addChartEl(pptx, s, el, specs); // 차트
  });
}

// ───────────────────────── 6. 후처리 ① 차트 XML ─────────────────────────
function esc2(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); } // XML 이스케이프
function lineSerXml(s, idx, srcXml) { // 막대 계열을 선 계열로 다시 쓰는 XML (※보조 6주 평균)
  const tx = (/<c:tx>[\s\S]*?<\/c:tx>/.exec(srcXml) || [''])[0]; // 이름
  const cat = (/<c:cat>[\s\S]*?<\/c:cat>/.exec(srcXml) || [''])[0]; // 범주
  const val = (/<c:val>[\s\S]*?<\/c:val>/.exec(srcXml) || [''])[0]; // 값
  const dash = s.dash === 'dash' ? '<a:prstDash val="dash"/>' : '<a:prstDash val="solid"/>'; // 점선
  return '<c:ser><c:idx val="' + idx + '"/><c:order val="' + idx + '"/>' + tx + '<c:spPr><a:ln w="' + Math.round((s.lw || 1.25) * 12700) + '" cap="rnd"><a:solidFill><a:srgbClr val="' + s.color + '"/></a:solidFill>' + dash + '<a:round/></a:ln></c:spPr><c:marker><c:symbol val="none"/></c:marker>' + cat + val + '<c:smooth val="0"/></c:ser>'; // 계열 XML(스키마 순서 준수)
}
function patchChartXml(xml, spec) { // 차트 XML 하나를 고쳐 쓴다
  let x = xml; // 작업본
  if (spec.hasBars && spec.lines.length) { // 막대 + 보조 선(6주 평균)
    const sers = x.match(/<c:ser>[\s\S]*?<\/c:ser>/g) || []; // 계열 목록
    if (sers.length < 1 + spec.lines.length) throw new Error('차트 계열 수가 맞지 않습니다'); // 검증
    const moved = sers.slice(1); // 막대 뒤 계열은 선으로 이동
    moved.forEach(m => { x = x.replace(m, ''); }); // 막대 차트에서 제거
    const ax = (/<c:barChart>[\s\S]*?(<c:axId val="\d+"\/>\s*<c:axId val="\d+"\/>)[\s\S]*?<\/c:barChart>/.exec(x) || [])[1]; // 축 ID 재사용(보조축 없이)
    if (!ax) throw new Error('차트 축 정보를 찾을 수 없습니다'); // 검증
    const lineChart = '<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>' + moved.map((m, i) => lineSerXml(spec.lines[i], i + 1, m)).join('') + '<c:marker val="1"/>' + ax + '</c:lineChart>'; // 선 차트
    x = x.replace('</c:barChart>', '</c:barChart>' + lineChart); // 막대 차트 바로 뒤에 삽입
    if (spec.ptColors && !/<c:dPt>/.test(x)) { // 계열이 2개 이상이면 PptxGenJS 가 점별 색을 넣지 않으므로 직접 추가
      const dpts = spec.ptColors.map((c, i) => '<c:dPt><c:idx val="' + i + '"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="' + c + '"/></a:solidFill></c:spPr></c:dPt>').join(''); // 점별 색 XML
      x = x.replace(/(<c:barChart>[\s\S]*?)<\/c:ser>/, '$1' + dpts + '</c:ser>'); // 첫 막대 계열 끝에 추가(순서는 뒤에서 재정렬)
    }
  }
  x = x.replace(/<c:marker>([\s\S]*?)<\/c:marker>/g, (all, inner) => { // 마커 채움을 흰색으로(테두리는 선 색 유지)
    if (/c:symbol val="none"/.test(inner)) return all; // 마커 없음은 그대로
    return '<c:marker>' + inner.replace(/(<c:spPr>\s*)<a:solidFill>[\s\S]*?<\/a:solidFill>/, '$1<a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>') + '</c:marker>'; // 흰 채움
  });
  x = x.replace(/<c:dLbls>[\s\S]*?<\/c:dLbls>/g, m => m.replace(/<a:bodyPr\s*\/>/g, '<a:bodyPr rot="0" vert="horz" wrap="none" anchor="ctr" anchorCtr="1"/>')); // 데이터 라벨은 줄바꿈 없이 한 줄로
  return x; // 반환
}
function reorderSeries(xml) { // 계열(ser) 안 요소를 OOXML 스키마 순서로 재정렬하고 선 차트의 invertIfNegative 를 제거
  const NS = 'http://schemas.openxmlformats.org/drawingml/2006/chart'; // 차트 이름공간
  const ORD = { barChart: ['idx', 'order', 'tx', 'spPr', 'invertIfNegative', 'pictureOptions', 'dPt', 'dLbls', 'trendline', 'errBars', 'cat', 'val', 'shape', 'extLst'], lineChart: ['idx', 'order', 'tx', 'spPr', 'marker', 'dPt', 'dLbls', 'trendline', 'errBars', 'cat', 'val', 'smooth', 'extLst'] }; // 종류별 순서
  const doc = new DOMParser().parseFromString(xml, 'application/xml'); // XML 파싱
  if (doc.getElementsByTagName('parsererror').length) throw new Error('차트 XML 을 해석할 수 없습니다'); // 파싱 오류
  ['barChart', 'lineChart'].forEach(kind => { // 종류마다
    Array.from(doc.getElementsByTagNameNS(NS, kind)).forEach(ch => { // 차트마다
      Array.from(ch.childNodes).filter(n => n.localName === 'ser').forEach(ser => { // 계열마다
        let kids = Array.from(ser.childNodes).filter(n => n.nodeType === 1); // 요소 자식
        if (kind === 'lineChart') kids = kids.filter(n => { if (n.localName === 'invertIfNegative') { ser.removeChild(n); return false; } return true; }); // 선 계열에는 없는 요소 제거
        const rank = n => { const i = ORD[kind].indexOf(n.localName); return i < 0 ? 99 : i; }; // 순서 번호
        kids.map((n, i) => ({ n, i })).sort((a, b) => rank(a.n) - rank(b.n) || a.i - b.i).forEach(o => ser.appendChild(o.n)); // 정렬 후 다시 붙이기
      });
    });
  });
  const out = new XMLSerializer().serializeToString(doc); // 문자열로
  return /^<\?xml/.test(out) ? out : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + out; // 선언 보장
}
async function patchCharts(zip, specs) { // 모든 차트 XML 교체 (순서·개수 검증 포함)
  const names = Object.keys(zip.files).filter(n => /^ppt\/charts\/chart\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/(\d+)\.xml/)[1]) - parseInt(b.match(/(\d+)\.xml/)[1])); // 차트 파일(번호순)
  if (names.length !== specs.length) throw new PptxStageError('차트 교체', '차트 개수가 맞지 않습니다 (예상 ' + specs.length + ', 실제 ' + names.length + ')'); // 개수 검증
  for (let i = 0; i < names.length; i++) { // 차트마다
    const xml = await zip.file(names[i]).async('string'); // 원본 XML
    const first = (/<c:ser>[\s\S]*?<c:tx>[\s\S]*?<c:v>([\s\S]*?)<\/c:v>/.exec(xml) || [])[1]; // 첫 시리즈 이름
    if (first === undefined || first.replace(/&amp;/g, '&') !== specs[i].firstName) throw new PptxStageError('차트 교체', '차트 순서 검증에 실패했습니다 (' + (i + 1) + '번째 차트)'); // 순서 검증
    zip.file(names[i], reorderSeries(patchChartXml(xml, specs[i]))); // 교체 + 스키마 순서 정렬 후 저장
  }
}

// ───────────────────────── 7. 후처리 ② 내장 엑셀 ─────────────────────────
async function patchEmbeddedWorkbooks(zip) { // 내장 엑셀의 빈 값 칸(<v></v>) 제거 — "데이터 편집" 정상 동작용
  const names = Object.keys(zip.files).filter(n => /^ppt\/embeddings\/.*\.xlsx$/.test(n)); // 내장 엑셀
  for (const n of names) { // 파일마다
    const inner = await JSZip.loadAsync(await zip.file(n).async('uint8array')); // 엑셀 열기
    const sheets = Object.keys(inner.files).filter(f => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)); // 시트들
    for (const sf of sheets) { // 시트마다
      let sx = await inner.file(sf).async('string'); // 시트 XML
      sx = sx.replace(/<c ([^>]*?)>\s*<v>\s*<\/v>\s*<\/c>/g, '<c $1/>').replace(/<v>\s*<\/v>/g, ''); // 빈 값 제거
      inner.file(sf, sx); // 저장
    }
    zip.file(n, await inner.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })); // 다시 압축
  }
}

// ───────────────────────── 8. 후처리 ③ 슬라이드 마스터 ─────────────────────────
function emuOf(inch) { return Math.round(inch * EMU); } // 인치 → EMU
async function injectMaster(zip) { // slideMaster1.xml 에 구분선 1개 + 장식 그림 3개 삽입
  const mp = 'ppt/slideMasters/slideMaster1.xml', rp = 'ppt/slideMasters/_rels/slideMaster1.xml.rels'; // 경로
  if (!zip.file(mp)) throw new PptxStageError('마스터 삽입', '슬라이드 마스터를 찾을 수 없습니다'); // 한글 오류
  let mx = await zip.file(mp).async('string'); // 마스터 XML
  let rx = zip.file(rp) ? await zip.file(rp).async('string') : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'; // 관계 파일
  const decos = [['diamond', 8.958, '빨강 마름모'], ['circle', 9.231, '남색 원'], ['round', 9.505, '연두 둥근사각형']]; // 장식 3개
  let shapes = '<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="9001" name="마스터 구분선"/><p:cNvCxnSpPr/><p:nvPr userDrawn="1"/></p:nvCxnSpPr><p:spPr><a:xfrm><a:off x="0" y="' + emuOf(0.752) + '"/><a:ext cx="' + emuOf(PAGE_W) + '" cy="0"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="12700"><a:solidFill><a:srgbClr val="0C4270"/></a:solidFill></a:ln></p:spPr></p:cxnSp>'; // 구분선(남색 1pt)
  let rels = ''; // 추가할 관계
  decos.forEach((d, i) => { // 장식마다
    const rid = 'rIdDeco' + (i + 1), file = 'masterDeco' + (i + 1) + '.png'; // 관계 ID·파일명
    zip.file('ppt/media/' + file, DECO[d[0]] || '', { base64: true }); // PNG 저장
    rels += '<Relationship Id="' + rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/' + file + '"/>'; // 관계
    shapes += '<p:pic><p:nvPicPr><p:cNvPr id="' + (9002 + i) + '" name="마스터 장식 ' + d[2] + '"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr userDrawn="1"/></p:nvPicPr><p:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="' + emuOf(d[1]) + '" y="' + emuOf(0.6595 - 0.0925) + '"/><a:ext cx="' + emuOf(0.185) + '" cy="' + emuOf(0.185) + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>'; // 그림
  });
  if (!/<\/p:grpSpPr>/.test(mx)) throw new PptxStageError('마스터 삽입', '슬라이드 마스터를 찾을 수 없습니다'); // 구조 검증
  mx = mx.replace('</p:grpSpPr>', '</p:grpSpPr>' + shapes); // 도형 트리 맨 뒤쪽(아래층)에 삽입
  if (!/xmlns:r=/.test(mx.slice(0, 600))) mx = mx.replace('<p:sldMaster ', '<p:sldMaster xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '); // r 이름공간 보장
  rx = rx.replace('</Relationships>', rels + '</Relationships>'); // 관계 추가
  zip.file(mp, mx); zip.file(rp, rx); // 저장
  let ct = await zip.file('[Content_Types].xml').async('string'); // 콘텐츠 형식
  if (!/Extension="png"/i.test(ct)) { ct = ct.replace('<Types ', '<Types ').replace(/(<Types[^>]*>)/, '$1<Default Extension="png" ContentType="image/png"/>'); zip.file('[Content_Types].xml', ct); } // png 등록 확인
  const lays = Object.keys(zip.files).filter(n => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(n)); // 레이아웃들
  for (const ln of lays) { // 마스터 도형을 숨기지 않는지 확인
    const lx = await zip.file(ln).async('string'); // 레이아웃 XML
    if (/showMasterSp="0"/.test(lx)) zip.file(ln, lx.replace(/showMasterSp="0"/g, 'showMasterSp="1"')); // 숨김 해제
  }
}

// ───────────────────────── 9. 전체 파이프라인 ─────────────────────────
async function buildPptxBlob(slides) { // 쪽 목록 → .pptx Blob
  let stage = '장면 확정'; // 현재 단계(오류 안내용)
  try { // 어느 단계든 실패하면 단계명과 함께 한글 오류
    if (typeof PptxGenJS === 'undefined' || typeof JSZip === 'undefined') throw new PptxStageError(stage, 'PPT 저장 라이브러리를 찾을 수 없습니다'); // 라이브러리 확인
    stage = 'PPT 생성'; // 단계 이동
    const pptx = new PptxGenJS(); // 인스턴스
    pptx.defineLayout({ name: 'CO_USLETTER', width: PAGE_W, height: PAGE_H }); // 25.517 × 19.05cm
    pptx.layout = 'CO_USLETTER'; // 적용
    pptx.author = '6Keys Weekly'; pptx.title = APP_TITLE; // 문서 정보
    pptx.theme = { headFontFace: FACE, bodyFontFace: FACE }; // 글꼴
    const specs = []; // 차트 명세
    slides.forEach(s => addSlideFromScene(pptx, s, specs)); // 쪽마다 슬라이드
    const raw = await pptx.write({ outputType: 'arraybuffer' }); // 바이너리 생성
    stage = '후처리'; // 단계 이동
    const zip = await JSZip.loadAsync(raw); // zip 열기
    await patchCharts(zip, specs); // ① 차트 교체
    await patchEmbeddedWorkbooks(zip); // ② 내장 엑셀 정리
    await injectMaster(zip); // ③ 마스터 삽입
    stage = '파일 만들기'; // 단계 이동
    return await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', compression: 'DEFLATE' }); // Blob
  } catch (e) { // 실패
    console.error(e); // 기록
    const where = e instanceof PptxStageError ? e.stage : stage; // 실패 단계
    throw new Error('PPT 저장 중 [' + where + '] 단계에서 실패했습니다 : ' + (e.message || '알 수 없는 오류')); // 한글 안내
  }
}
function pad2(n) { return String(n).padStart(2, '0'); } // 두 자리 숫자
function pptxFileName(kind, nos) { // 파일명 규칙: 제목_S03 / 제목_S01-S03 / 제목_전체_S01-S07
  const title = APP_TITLE + '_' + weekShort(state.week); // 제목
  const sn = n => 'S' + pad2(n); // 쪽 표기
  if (kind === 'current') return title + '_' + sn(nos[0]) + '.pptx'; // 현재 쪽
  if (kind === 'all') return title + '_전체_' + sn(nos[0]) + '-' + sn(nos[nos.length - 1]) + '.pptx'; // 전체
  return title + '_' + sn(nos[0]) + (nos.length > 1 ? '-' + sn(nos[nos.length - 1]) : '') + '.pptx'; // 선택 쪽
}
function downloadBlob(blob, name) { // Blob 내려받기
  const a = document.createElement('a'); // 링크
  a.href = URL.createObjectURL(blob); a.download = name; // 주소·파일명
  document.body.appendChild(a); a.click(); // 클릭
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); // 정리
}
async function savePptx(kind, selNos, separate) { // 저장 실행. kind: current/selected/all, separate: 쪽별 개별 파일
  const all = state.slides; // 전체 쪽
  let nos; // 대상 쪽 번호(1부터)
  if (kind === 'current') nos = [state.cur + 1]; // 현재 쪽
  else if (kind === 'all') nos = all.map((s, i) => i + 1); // 전체
  else nos = (selNos || []).slice().sort((a, b) => a - b); // 선택 쪽(번호순)
  if (!nos.length) { toast('저장할 쪽을 선택해 주세요'); return; } // 선택 없음
  toast('PPT를 만드는 중입니다…', 4000); // 진행 안내
  try { // 저장
    if (separate) { // 쪽별 개별 파일
      for (const n of nos) { downloadBlob(await buildPptxBlob([all[n - 1]]), pptxFileName('current', [n])); await new Promise(r => setTimeout(r, 400)); } // 한 쪽씩
      toast('PPT ' + nos.length + '개를 저장했습니다'); // 완료
    } else { // 한 파일
      const blob = await buildPptxBlob(nos.map(n => all[n - 1])); // 만들기
      downloadBlob(blob, pptxFileName(kind, nos)); // 내려받기
      toast('PPT를 저장했습니다 (' + nos.length + '장)'); // 완료
    }
  } catch (e) { toast(e.message, 6000); } // 한글 오류 토스트
}
