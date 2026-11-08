// ============================================================================
// 02_scene.js — 장면(scene) 모델: 화면 렌더러와 PPT 변환기가 함께 읽는 "요소 목록"을 만든다
// · 모든 좌표는 인치, 글자 크기는 pt 로 저장한다 (화면에서만 px 로 환산)
// · 요소 종류: text / shape / table / chart
// · 이 파일은 DOM 을 직접 만들지 않는다. (글 넘침 측정만 03_render.js 의 measureH 를 호출)
// ============================================================================

// ───────────────────────── 1. 요소 팩토리 ─────────────────────────
function Rn(t, o) { // 글자 조각(run) 하나를 만드는 함수
  return Object.assign({ t: String(t === undefined || t === null ? '' : t), sz: 8, b: false, c: C.blk }, o || {}); // 기본: 8pt, 보통, 검정
}
function Pa(runs, o) { // 문단(paragraph) 하나를 만드는 함수
  return Object.assign({ runs: Array.isArray(runs) ? runs : [runs], al: 'l', bul: false, sp: 0 }, o || {}); // al: l/c/r, bul: 글머리표, sp: 문단 앞 간격(pt)
}
function Tx(x, y, w, h, paras, o) { // 텍스트 상자 요소
  return Object.assign({ t: 'text', x, y, w, h, paras, va: 't', ins: [0, 0, 0, 0], step: 0 }, o || {}); // va: t/m/b, ins: [왼,위,오,아래] 인치
}
function Sh(shp, x, y, w, h, o) { // 도형 요소 (글자는 같은 도형 안에 넣는다)
  return Object.assign({ t: 'shape', shp, x, y, w, h, fill: null, line: null, rad: 0, paras: null, va: 'm', ins: [0.06, 0.03, 0.06, 0.03], step: 0 }, o || {}); // shp: rect/round/ellipse/diamond/line/bracket
}
function Tb(x, y, colW, rowH, rows, o) { // 표 요소 (셀마다 서식 지정)
  return Object.assign({ t: 'table', x, y, colW, rowH, rows, border: 'h', step: 0 }, o || {}); // border: none/cell/h/all
}
function Ch(x, y, w, h, o) { // 차트 요소
  return Object.assign({ t: 'chart', x, y, w, h, step: 0 }, o || {}); // cats, series, min, max, plot, dec, gap
}
function Cell(paras, o) { // 표 셀 하나
  return Object.assign({ paras, fill: null, va: 'm', ins: [0.05, 0.02, 0.05, 0.02], cs: 1, rs: 1, bd: {} }, o || {}); // bd: {l,r,t,b:{c,w}}
}
function sline(c, w, dash) { return { c, w, dash: dash || 'solid' }; } // 선 서식 객체

// ───────────────────────── 2. 통계(검산 포함) ─────────────────────────
function itemStats(key, win, week) { // 한 품목의 금주 통계·6주 이력을 계산하는 함수
  const meta = ITEM_BY_KEY[key]; // 품목 정의
  const series = []; // 주차별 이력
  win.forEach((w, i) => { // 최근 6주를 차례로
    const it = w.items[key]; // 그 주 품목
    const price = num(it.price); // 그 주 가격
    let prev = num(it.prev_price); // 그 주 전주 가격(저장값)
    if (!isFinite(prev) && i > 0) prev = num(win[i - 1].items[key].price); // 저장값이 없으면 직전 주차 가격
    const d = (isFinite(price) && isFinite(prev)) ? price - prev : NaN; // 전주 대비 증감액
    const p = (isFinite(d) && prev !== 0) ? d / prev * 100 : NaN; // 전주 대비 증감률(%)
    series.push({ week: w.week, label: weekShort(w.week), fri: fridayText(w.week), price, prev, d, p }); // 이력 한 칸
  });
  const cur = series[series.length - 1]; // 금주
  const it = win[win.length - 1].items[key]; // 금주 원본 품목
  const valid = series.filter(s => isFinite(s.price)); // 가격이 있는 주차
  const hi = valid.length ? Math.max.apply(null, valid.map(s => s.price)) : NaN; // 6주 고가
  const lo = valid.length ? Math.min.apply(null, valid.map(s => s.price)) : NaN; // 6주 저가
  const avg = valid.length ? valid.reduce((a, s) => a + s.price, 0) / valid.length : NaN; // 6주 평균
  const vsAvg = (isFinite(cur.price) && isFinite(avg) && avg !== 0) ? (cur.price - avg) / avg * 100 : NaN; // 6주 평균 대비 %
  const daily = (it.daily_prices || []).filter(x => isFinite(x.price)); // 금주 일간 가격
  const dailyD = daily.map((x, i) => { // 일간 전일 대비(첫날은 전주 가격과 비교)
    const base = i === 0 ? cur.prev : daily[i - 1].price; // 비교 기준
    return isFinite(base) ? x.price - base : NaN; // 증감
  });
  const dv = daily.map(x => x.price); // 일간 가격 배열
  const range = dv.length ? Math.max.apply(null, dv) - Math.min.apply(null, dv) : NaN; // 주중 변동폭
  const notes = []; // 검산 주석
  if (it.change_abs !== null && isFinite(it.change_abs) && isFinite(cur.d) && Math.abs(it.change_abs - cur.d) > 0.05) notes.push(meta.code + ' 증감액 원본 ' + fmtNum(it.change_abs, meta.dec) + ' ≠ 계산 ' + fmtNum(cur.d, meta.dec) + ' (확인 필요)'); // 증감액 불일치
  if (it.change_pct !== null && isFinite(it.change_pct) && isFinite(cur.p) && Math.abs(it.change_pct - cur.p) > 0.05) notes.push(meta.code + ' 증감률 원본 ' + it.change_pct + '% ≠ 계산 ' + cur.p.toFixed(2) + '% (확인 필요)'); // 증감률 불일치
  return { meta, it, key, price: cur.price, prev: cur.prev, d: cur.d, p: cur.p, dir: dirOf(cur.d), series, hi, lo, avg, vsAvg, daily, dailyD, range, isDaily: daily.length >= 2, notes }; // 통계 묶음
}
function priceStr(v, meta) { return isFinite(v) ? fmtNum(v, meta.dec) : '–'; } // 가격 문자열
function unitPrice(v, meta) { return isFinite(v) ? '$' + fmtNum(v, meta.dec) + '/' + meta.per : '–'; } // $1,250/MT 표기

// ───────────────────────── 3. 핵심 메시지(자동 초안) ─────────────────────────
function itemHeadline(st) { // 품목 핵심 메시지 문단 목록(사용자가 headline 을 넣으면 그것을 우선)
  const m = st.meta; // 품목 정의
  if (st.it.headline) return [Pa([Rn('□ ', { sz: 13, b: true }), Rn(st.it.headline, { sz: 13, b: true })])]; // 사용자 지정 문구
  const col = dirColor(st.dir); // 방향 색
  let lead = m.code + ' ' + unitPrice(st.price, m); // 품목 + 가격
  if (isFinite(st.d)) lead += ', 전주 대비 ' + (st.dir === 0 ? '보합' : deltaText(st.d, m) + ' (' + pctText(st.p, 1) + ') ' + dirWord(st.dir)); // 전주 대비
  const fs = lines(st.it.factors); // 변동요인 줄
  let tail = ''; // 뒤에 붙일 변동요인
  fs.slice(0, 2).forEach(f => { // 앞 두 줄까지만, 길이를 넘지 않을 때만
    const cand = tail ? tail + ' / ' + f : ' — ' + f; // 이어붙인 후보
    if ((lead + cand).length <= 92) tail = cand; // 두 줄 안에 들어오면 채택
  });
  return [Pa([Rn('□ ', { sz: 13, b: true }), Rn(lead, { sz: 13, b: true, c: col }), Rn(tail, { sz: 13, b: true })])]; // 강조 구간만 방향 색
}
function summaryHeadline(wk, sts) { // 요약 쪽 핵심 메시지
  if (wk.summary_headline) return [Pa([Rn('□ ', { sz: 13, b: true }), Rn(wk.summary_headline, { sz: 13, b: true })])]; // 사용자 지정 문구
  const up = sts.filter(s => s.dir > 0).length, dn = sts.filter(s => s.dir < 0).length, fl = sts.length - up - dn; // 방향별 개수
  const withP = sts.filter(s => isFinite(s.p) && s.dir !== 0); // 변동이 있는 품목
  const best = withP.filter(s => s.dir > 0).sort((a, b) => b.p - a.p)[0]; // 최대 상승
  const worst = withP.filter(s => s.dir < 0).sort((a, b) => a.p - b.p)[0]; // 최대 하락
  const runs = [Rn('□ ' + weekShort(wk.week) + ' 6개 품목 : ', { sz: 13, b: true }), Rn('상승 ' + up, { sz: 13, b: true, c: C.red }), Rn(' · ', { sz: 13, b: true }), Rn('하락 ' + dn, { sz: 13, b: true, c: C.blue }), Rn(' · 보합 ' + fl, { sz: 13, b: true })]; // 개수
  if (best) runs.push(Rn(' — 최대 상승 ' + best.meta.code + ' ', { sz: 13, b: true }), Rn(pctText(best.p, 1), { sz: 13, b: true, c: C.red })); // 최대 상승
  if (worst) runs.push(Rn(best ? ', 최대 하락 ' : ' — 최대 하락 ', { sz: 13, b: true }), Rn(worst.meta.code + ' ' + pctText(worst.p, 1), { sz: 13, b: true, c: C.blue })); // 최대 하락
  return [Pa(runs)]; // 문단 1개
}

// ───────────────────────── 4. 공통 조각 ─────────────────────────
function titleEls(title, subLines, pill) { // 제목(21pt) + 우측 보조 문구 + 방향 알약
  const els = []; // 요소 목록
  els.push(Tx(0.2, 0.1, 5.3, 0.58, [Pa(Rn(title, { sz: 21, b: true }))], { va: 'm' })); // 제목
  els.push(Tx(5.55, 0.12, 1.9, 0.52, subLines.map(s => Pa(Rn(s, { sz: 7.5, c: C.gray }), { al: 'r' })), { va: 'm' })); // 기준·기간 문구
  if (pill) els.push(Sh('round', 7.52, 0.2, 1.3, 0.32, { fill: C.wht, line: sline(pill.c, 1), rad: 0.16, paras: [Pa(Rn(pill.t, { sz: 9, b: true, c: pill.c }), { al: 'c' })], ins: [0.02, 0.01, 0.02, 0.01] })); // 방향 알약
  return els; // 반환
}
function messageBox(paras, y, h, bind) { // F2F2F2 메시지 상자 + 군청 막대
  const box = Sh('rect', 0.2, y, 9.65, h, { fill: C.soft, paras, va: 'm', ins: [0.18, 0.02, 0.1, 0.02], bind }); // 글자가 들어 있는 상자
  const bar = Sh('rect', 0.2, y, 0.06, h, { fill: C.navy }); // 왼쪽 군청 막대
  return [box, bar]; // 두 요소
}
function addStep(els, step) { els.forEach(e => { e.step = step; }); return els; } // 요소들에 등장 단계 지정
function cardEls(o) { // 카드(컨테이너 + 번호 원 + 제목 + 보조문구 + 구분선) 요소들
  const els = []; // 요소 목록
  els.push(Sh('round', o.x, o.y, o.w, o.h, { fill: o.fill || C.wht, line: sline(C.line, 0.75), rad: 0.08 })); // 카드 컨테이너
  els.push(Sh('ellipse', o.x + 0.1, o.y + 0.085, 0.2, 0.2, { fill: C.navy, paras: [Pa(Rn(String(o.no), { sz: 8, b: true, c: C.wht }), { al: 'c' })], ins: [0, 0, 0, 0] })); // 번호 원(군청)
  const subW = o.subW || 0; // 보조문구 폭
  els.push(Tx(o.x + 0.36, o.y + 0.06, o.w - 0.46 - subW, 0.26, [Pa(Rn(o.title, { sz: 10, b: true }))], { va: 'm' })); // 카드 제목
  if (o.sub) els.push(Tx(o.x + o.w - 0.1 - subW, o.y + 0.06, subW, 0.26, [Pa(Rn(o.sub, { sz: 8, c: C.gray }), { al: 'r' })], { va: 'm' })); // 보조문구
  if (o.pill) els.push(Sh('round', o.x + o.w - 1.12, o.y + 0.08, 1.02, 0.22, { fill: C.wht, line: sline(o.pill.c, 1), rad: 0.11, paras: [Pa(Rn(o.pill.t, { sz: 8, b: true, c: o.pill.c }), { al: 'c' })], ins: [0.02, 0, 0.02, 0] })); // 전망 알약
  els.push(Sh('line', o.x + 0.1, o.y + 0.34, o.w - 0.2, 0, { line: sline(C.navy, 0.75) })); // 머리글 아래 군청선
  return addStep(els, o.step || 0); // 단계 지정 후 반환
}

// ───────────────────────── 5. 본문 글(자동 맞춤) ─────────────────────────
function bodyParas(ls, bul, sz, empty) { // 줄 목록 → 문단 목록
  if (!ls.length) return [Pa(Rn('(내용 없음)', { sz, c: 'A6A6A6' }))]; // 비었을 때 안내
  return ls.map((l, i) => Pa(Rn(l, { sz }), { bul, sp: i === 0 ? 0 : (bul ? 1.5 : 3) })); // 줄마다 문단
}
function fitBody(ls, bul, w, h, ins, sizes) { // 칸에 들어가는 가장 큰 글자 크기를 찾는 함수
  const list = sizes || [8, 7.5, 7, 6.5]; // 시도할 크기(pt)
  let paras = null, sz = list[0], over = false; // 결과
  for (let i = 0; i < list.length; i++) { // 큰 것부터
    sz = list[i]; // 후보 크기
    paras = bodyParas(ls, bul, sz); // 문단 생성
    if (measureH(paras, w, ins) <= h + 0.001) { over = false; break; } // 들어가면 확정
    over = true; // 못 들어가면 계속
  }
  return { paras, sz, over }; // 결과
}
function needH(ls, bul, wIn) { // 글 분량으로 필요한 카드 높이를 어림하는 함수(칸 나누기용)
  const cpl = Math.max(8, Math.floor((wIn - (bul ? 0.13 : 0)) / 0.098)); // 한 줄 글자 수 어림
  let n = 0; // 줄 수
  (ls.length ? ls : ['']).forEach(l => { n += Math.max(1, Math.ceil(l.length / cpl)); }); // 문단별 줄 수
  return 0.5 + n * 0.127; // 머리글 0.42 + 여백 + 줄 높이
}
function splitHeights(total, gap, needs, min) { // 한 열의 카드 2개 높이를 분량에 맞춰 나누는 함수
  const avail = total - gap * (needs.length - 1); // 가용 높이
  const sum = needs.reduce((a, b) => a + b, 0); // 필요 합계
  let hs; // 결과
  if (sum <= avail) hs = needs.map(n => n + (avail - sum) / needs.length); // 여유는 균등 분배
  else hs = needs.map(n => Math.max(min, avail * n / sum)); // 부족하면 비례 축소
  const s2 = hs.reduce((a, b) => a + b, 0); // 합계 재계산
  return hs.map(h => h * avail / s2); // 합이 정확히 avail 이 되게 보정
}
function textCard(o) { // 글 카드(번호·제목·본문) 요소들과 본문 자동 맞춤 결과
  const els = cardEls({ x: o.x, y: o.y, w: o.w, h: o.h, no: o.no, title: o.title, fill: o.fill, pill: o.pill, step: o.step }); // 카드 틀
  const bx = o.x + 0.1, by = o.y + 0.42, bw = o.w - 0.2, bh = o.h - 0.48; // 본문 영역
  const ls = o.lines; // 본문 줄
  const fit = fitBody(ls, o.bul, bw, bh, [0, 0, 0, 0], o.sz ? [o.sz] : null); // 자동 맞춤(공통 글자 크기가 정해졌으면 그 크기로)
  const body = Tx(bx, by, bw, bh, fit.paras, { step: o.step || 0, bind: o.bind, over: fit.over }); // 본문 상자
  els.push(body); // 추가
  return { els, over: fit.over, name: o.title }; // 반환
}
function outlookPill(txt) { // AI 전망 첫머리의 상승/하락/보합을 알약으로 만드는 함수
  const m = /^\s*(상승|하락|보합)/.exec(txt || ''); // 첫 낱말 검사
  if (!m) return null; // 없으면 알약 없음
  const d = m[1] === '상승' ? 1 : (m[1] === '하락' ? -1 : 0); // 방향
  return { t: '전망 : ' + m[1], c: dirColor(d) }; // 알약 정보
}

function aiGist(txt) { // 요약 표용: AI 전망에서 방향 말머리를 빼고 첫 문장만 줄여 돌려주는 함수
  let t = String(txt || '').replace(/\s+/g, ' ').trim(); // 공백 정리
  t = t.replace(/^(상승|하락|보합)\s*(전망)?\s*[.,:·-]?\s*/, ''); // 맨 앞 "하락 전망." 말머리 제거(알약이 따로 보여 줌)
  const k = t.search(/[.。]\s/); // 첫 문장 끝 위치
  if (k > 0) t = t.slice(0, k + 1); // 첫 문장만 사용
  if (t.length > 120) { // 너무 길면
    const cut = t.lastIndexOf(' ', 118); // 120자 안쪽의 마지막 띄어쓰기
    t = t.slice(0, cut > 60 ? cut : 118) + '…'; // 줄임표로 마무리
  }
  return t; // 반환
}

// ───────────────────────── 6. 차트·델타 행 ─────────────────────────
const PLOT = { x: 0.04, y: 0.2, w: 0.92, h: 0.6 }; // 차트 플롯 영역 비율(좌·상·폭·높이)
function lineScale(vals) { // 선 차트 축 범위
  const hi = Math.max.apply(null, vals), lo = Math.min.apply(null, vals); // 최대·최소
  const r = (hi - lo) || Math.abs(hi) * 0.02 || 1; // 변동폭(없으면 2%)
  return { min: lo - r * 0.6, max: hi + r * 0.55 }; // 위쪽 라벨 공간 확보
}
function barScale(vals) { // 막대 차트 축 범위(0에서 시작하지 않음 — 주석에 명시)
  const hi = Math.max.apply(null, vals), lo = Math.min.apply(null, vals); // 최대·최소
  const r = hi - lo; // 변동폭
  if (r <= 0) return { min: lo * 0.85, max: hi * 1.08 }; // 모두 같으면 비율로
  return { min: Math.max(0, lo - r * 1.0), max: hi + r * 0.35 }; // 라벨 공간 포함
}
function deltaRow(chart, texts, colors) { // 차트 아래 증감 행(차트 플롯 폭에 맞춘 1행 표)
  const n = texts.length; // 칸 수
  const px = chart.x + PLOT.x * chart.w, pw = PLOT.w * chart.w; // 플롯 좌측·폭
  const cw = []; for (let i = 0; i < n; i++) cw.push(pw / n); // 열 너비 균등
  const row = texts.map((t, i) => Cell([Pa(Rn(t, { sz: 8, b: true, c: colors[i] }), { al: 'c' })], { fill: C.soft, ins: [0.01, 0.01, 0.01, 0.01] })); // 증감 셀
  return Tb(px, chart.y + chart.h, cw, [0.2], [row], { border: 'none' }); // 표 요소
}
function dailyChartEls(st, card) { // 일간 선 차트 + 전일 대비 행
  const m = st.meta; // 품목
  const vals = st.daily.map(x => x.price); // 값
  const sc = lineScale(vals); // 축 범위
  const ch = Ch(card.x + 0.08, card.y + 0.38, card.w - 0.16, 1.2, { cats: st.daily.map(x => x.date), plot: PLOT, min: sc.min, max: sc.max, dec: m.dec, gap: 0, series: [{ name: '일간 가격 (' + m.unit + ')', kind: 'line', vals, color: C.bar, lw: 2.25, marker: true, labels: { pos: 't', sz: 8, b: true, c: C.bar } }] }); // 선 차트
  const dr = deltaRow(ch, st.dailyD.map(d => deltaText(d, m)), st.dailyD.map(d => dirColor(dirOf(d)))); // 전일 대비 행
  return [ch, dr]; // 두 요소
}
function weeklyChartEls(st, card, withDelta, withAvg) { // 6주 막대 차트(+전주 대비 행 / 6주 평균 점선)
  const m = st.meta; // 품목
  const ss = st.series.filter(s => isFinite(s.price)); // 가격이 있는 주차만
  const vals = ss.map(s => s.price); // 값
  const sc = barScale(vals); // 축 범위
  const series = [{ name: '주간 가격 (' + m.unit + ')', kind: 'bar', vals, color: C.lgray, ptColors: ss.map((s, i) => i === ss.length - 1 ? C.bar : C.lgray), labels: { pos: 'outEnd', sz: 8, b: true, c: C.blk } }]; // 막대 계열
  if (withAvg && isFinite(st.avg)) series.push({ name: '※보조 6주 평균', kind: 'line', vals: vals.map(() => st.avg), color: C.gray, lw: 1.25, dash: 'dash', marker: false, labels: null }); // 6주 평균 점선
  const h = withDelta ? 1.2 : 1.4; // 차트 높이
  const ch = Ch(card.x + 0.08, card.y + 0.38, card.w - 0.16, h, { cats: ss.map(s => s.label + '(' + s.fri + ')'), plot: PLOT, min: sc.min, max: sc.max, dec: m.dec, gap: 55, series }); // 차트
  const out = [ch]; // 요소 목록
  if (withDelta) out.push(deltaRow(ch, ss.map(s => deltaText(s.d, m)), ss.map(s => dirColor(dirOf(s.d))))); // 전주 대비 행
  return out; // 반환
}
function weekTableEl(st, card) { // 주차 표(구분/가격/증감/등락률, 금주 열 E6E6E6)
  const m = st.meta; // 품목
  const ss = st.series; // 이력
  const n = ss.length; // 열 수
  const lw = 0.77, cw = (card.w - 0.16 - lw) / n; // 열 너비
  const colW = [lw]; for (let i = 0; i < n; i++) colW.push(cw); // 열 너비 목록
  const wb = { l: sline(C.wht, 0.75), r: sline(C.wht, 0.75) }; // 머리글 흰 구분선
  const head = [Cell([Pa(Rn('구분', { sz: 8, b: true, c: C.wht }), { al: 'c' })], { fill: C.blk, bd: wb })]; // 머리글 첫 칸
  ss.forEach((s, i) => { // 주차 머리글
    const cur = i === n - 1; // 금주 여부
    head.push(Cell([Pa(Rn(s.label, { sz: 8, b: true, c: C.wht }), { al: 'c' }), Pa(Rn(s.fri, { sz: 7, c: C.wht }), { al: 'c' })], { fill: cur ? C.navy : C.blk, bd: wb, ins: [0.01, 0.01, 0.01, 0.01] })); // 금주는 군청
  });
  const mk = (label, fn) => { // 데이터 행 생성
    const r = [Cell([Pa(Rn(label, { sz: 8, b: true }), { al: 'c' })], {})]; // 행 머리글
    ss.forEach((s, i) => { const o = fn(s); r.push(Cell([Pa(Rn(o.t, { sz: 8, b: i === n - 1 || o.b, c: o.c }), { al: 'c' })], { fill: i === n - 1 ? C.hdr2 : null, ins: [0.01, 0.01, 0.01, 0.01] })); }); // 금주 열 회색
    return r; // 행
  };
  const rows = [head, mk('가격', s => ({ t: priceStr(s.price, m), c: C.blk, b: true })), mk('증감', s => ({ t: deltaText(s.d, m), c: dirColor(dirOf(s.d)) })), mk('등락률', s => ({ t: isFinite(s.p) ? pctText(s.p, 2) : '–', c: dirColor(dirOf(s.d)) }))]; // 4행
  return Tb(card.x + 0.08, card.y + 0.44, colW, [0.36, 0.32, 0.32, 0.32], rows, { border: 'h' }); // 표 요소
}

// ───────────────────────── 7. 품목 쪽 ─────────────────────────
function kpiEl(i, label, runs, step, bind) { // KPI 상자(둥근 사각형 + 글자 일체)
  const xs = [0.2, 2.15, 4.1, 6.05, 8.0]; // 5칸 x 좌표
  return Sh('round', xs[i], 1.38, 1.85, 0.66, { fill: C.wht, line: sline(C.blk, 1), rad: 0.08, paras: [Pa(Rn(label, { sz: 8, c: C.gray }), { al: 'c' }), Pa(runs, { al: 'c' })], va: 'm', ins: [0.05, 0.03, 0.05, 0.03], step, bind }); // KPI
}
function buildItemSlide(key, win, wk) { // 품목 1장(일간형/주간형 자동 선택)
  const st = itemStats(key, win, wk.week); // 통계
  const m = st.meta; // 품목 정의
  const it = st.it; // 금주 원본
  const els = []; // 요소 목록
  const warn = []; // 경고
  const dc = dirColor(st.dir); // 방향 색
  // (1) 제목·보조문구·방향 알약
  const pillT = dirArrow(st.dir) + ' ' + dirWord(st.dir) + (isFinite(st.p) && st.dir !== 0 ? ' ' + Math.abs(st.p).toFixed(1) + '%' : ''); // 알약 문구
  titleEls(m.title, [m.basis, weekShort(wk.week) + ' (' + weekRangeText(wk.week) + ') · ' + m.unit], { t: pillT, c: dc }).forEach(e => els.push(e)); // 상단
  // (2) 핵심 메시지
  messageBox(itemHeadline(st), 0.82, 0.5, { kind: 'item', key, field: 'headline' }).forEach(e => els.push(e)); // 메시지 상자
  // (3) KPI 5개
  const unitRun = Rn(' ' + m.unit, { sz: 8, c: C.gray }); // 단위 조각
  const k = []; // KPI 목록
  k.push(kpiEl(0, '현재가', [Rn(priceStr(st.price, m), { sz: 14, b: true }), unitRun], 1, { kind: 'item', key, field: 'price', numeric: true, para: 1 })); // 현재가
  k.push(kpiEl(1, '전주 대비', [Rn(st.dir === 0 ? '–' : deltaText(st.d, m), { sz: 12, b: true, c: dc }), Rn(isFinite(st.p) ? ' (' + pctText(st.p, 1) + ')' : '', { sz: 12, b: true, c: dc })], 1)); // 전주 대비
  k.push(kpiEl(2, '전주 가격', [Rn(priceStr(st.prev, m), { sz: 14, b: true }), unitRun], 1, { kind: 'item', key, field: 'prev_price', numeric: true, para: 1 })); // 전주 가격
  k.push(kpiEl(3, (st.series.filter(s => isFinite(s.price)).length) + '주 고·저', [Rn(priceStr(st.hi, m) + ' / ' + priceStr(st.lo, m), { sz: 14, b: true })], 1)); // 고·저
  if (st.isDaily) k.push(kpiEl(4, '주중 변동폭', [Rn(priceStr(st.range, m), { sz: 14, b: true }), unitRun], 1)); // 일간형: 주중 변동폭
  else k.push(kpiEl(4, '6주 평균 대비', [Rn(isFinite(st.vsAvg) ? pctText(st.vsAvg, 1) : '–', { sz: 14, b: true, c: dirColor(dirOf(st.vsAvg)) })], 1)); // 주간형: 평균 대비
  k.forEach(e => els.push(e)); // 추가
  // (4) 차트 카드 2개
  const cy = 2.12, chh = 1.82; // 카드 y, 높이
  if (st.isDaily) { // 일간형
    const c1 = { x: 0.2, y: cy, w: 4.765, h: chh }, c2 = { x: 5.085, y: cy, w: 4.765, h: chh }; // 카드 좌표
    const d0 = st.daily[0].date, d1 = st.daily[st.daily.length - 1].date; // 일간 시작·끝
    cardEls({ x: c1.x, y: c1.y, w: c1.w, h: c1.h, no: 1, title: '일간 가격 추이', sub: d0 + '~' + d1 + ' · 하단 = 전일 대비 · ' + m.unit, subW: 2.75, step: 2 }).forEach(e => els.push(e)); // 카드 ①
    addStep(dailyChartEls(st, c1), 2).forEach(e => els.push(e)); // 일간 차트
    cardEls({ x: c2.x, y: c2.y, w: c2.w, h: c2.h, no: 2, title: '주간 가격 추이 (6주)', sub: '하단 = 전주 대비 · ' + m.unit, subW: 2.0, step: 3 }).forEach(e => els.push(e)); // 카드 ②
    addStep(weeklyChartEls(st, c2, true, false), 3).forEach(e => els.push(e)); // 주간 차트
  } else { // 주간형
    const c1 = { x: 0.2, y: cy, w: 4.875, h: chh }, c2 = { x: 5.2, y: cy, w: 4.65, h: chh }; // 카드 좌표
    cardEls({ x: c1.x, y: c1.y, w: c1.w, h: c1.h, no: 1, title: '주간 가격 추이 (6주)', sub: '점선 = 6주 평균 ' + priceStr(st.avg, m) + ' · ' + m.unit, subW: 2.6, step: 2 }).forEach(e => els.push(e)); // 카드 ①
    addStep(weeklyChartEls(st, c1, false, true), 2).forEach(e => els.push(e)); // 막대 + 평균선
    cardEls({ x: c2.x, y: c2.y, w: c2.w, h: c2.h, no: 2, title: '주차별 가격 표', sub: '단위 : ' + m.unit, subW: 1.3, step: 3 }).forEach(e => els.push(e)); // 카드 ②
    addStep([weekTableEl(st, c2)], 3).forEach(e => els.push(e)); // 주차 표
  }
  // (5) 글 카드 5개
  const top = 4.02, bot = 7.12, gapY = 0.06; // 글 영역 세로 범위
  const lComm = lines(it.commentary), lFact = lines(it.factors), lAdd = lines(it.additional_info), lOut = lines(it.outlook), lAi = lines(it.ai_outlook); // 줄 목록
  const avail = bot - top - gapY; // 한 열에서 카드 2개가 나눠 쓸 높이
  const layouts = [[3.137, 3.137, 3.137], [3.0, 2.66, 3.75], [2.9, 2.3, 4.21]]; // 열 폭 후보(합 9.411 + 간격 0.24 = 9.65) — 글이 많으면 오른쪽 열을 넓힌다
  const sizes = [8, 7.5, 7, 6.5]; // 글자 크기 후보
  const need = (ls, bul, sz, w) => 0.48 + measureH(bodyParas(ls, bul, sz), w - 0.2, [0, 0, 0, 0]); // 카드 1개가 필요한 높이(머리글 0.42 + 아래 여백 0.06 + 본문)
  let csz = sizes[sizes.length - 1], lay = layouts[0], found = false; // 선택 결과
  for (let i = 0; i < sizes.length && !found; i++) { // 큰 글자부터
    for (let j = 0; j < layouts.length && !found; j++) { // 열 폭 후보
      const L = layouts[j], z = sizes[i]; // 후보
      const okA = need(lComm, false, z, L[0]) + need(lFact, true, z, L[0]) <= avail; // A열
      const okB = need(lAdd, true, z, L[1]) <= bot - top; // B열
      const okC = need(lOut, false, z, L[2]) + need(lAi, false, z, L[2]) <= avail; // C열
      if (okA && okB && okC) { csz = z; lay = L; found = true; } // 모두 들어가면 확정
    }
  }
  const wA = lay[0], wB = lay[1], wC = lay[2]; // 열 폭
  const xA = 0.2, xB = xA + wA + 0.12, xC = xB + wB + 0.12; // 열 x 좌표
  const split = (a, b) => { const sum = a + b; const ha = sum <= avail ? a + (avail - sum) / 2 : avail * a / sum; return [ha, avail - ha]; }; // 필요 높이에 맞춰 두 카드 높이 나누기(여유는 균등 분배)
  const hA = split(need(lComm, false, csz, wA), need(lFact, true, csz, wA)); // A열 높이
  const hC = split(need(lOut, false, csz, wC), need(lAi, false, csz, wC)); // C열 높이
  const tcs = []; // 글 카드 결과
  tcs.push(textCard({ x: xA, y: top, w: wA, h: hA[0], no: 3, title: '코멘터리', lines: lComm, bul: false, sz: csz, step: 4, bind: { kind: 'item', key, field: 'commentary' } })); // ③
  tcs.push(textCard({ x: xA, y: top + hA[0] + gapY, w: wA, h: hA[1], no: 4, title: '변동요인', lines: lFact, bul: true, sz: csz, step: 5, bind: { kind: 'item', key, field: 'factors', list: true } })); // ④
  tcs.push(textCard({ x: xB, y: top, w: wB, h: bot - top, no: 5, title: '추가정보', lines: lAdd, bul: true, sz: csz, step: 6, bind: { kind: 'item', key, field: 'additional_info', list: true } })); // ⑤
  tcs.push(textCard({ x: xC, y: top, w: wC, h: hC[0], no: 6, title: '결론 및 전망', lines: lOut, bul: false, sz: csz, fill: C.soft, step: 7, bind: { kind: 'item', key, field: 'outlook' } })); // ⑥
  tcs.push(textCard({ x: xC, y: top + hC[0] + gapY, w: wC, h: hC[1], no: 7, title: 'AI 전망', lines: lAi, bul: false, sz: csz, fill: C.soft, pill: outlookPill(it.ai_outlook), step: 8, bind: { kind: 'item', key, field: 'ai_outlook' } })); // ⑦
  tcs.forEach(tc => { tc.els.forEach(e => els.push(e)); if (tc.over) warn.push(m.code + ' [' + tc.name + '] 글이 칸을 넘칩니다 (최소 글자 크기 적용)'); }); // 추가 + 경고
  // (6) 하단 주석
  const fn = []; // 주석 조각
  fn.push('※ 기준 : ' + m.basis + ', 단위 ' + m.unit + '. 전주 대비 = 금주 − 전주 가격' + (st.isDaily ? '(일간 하단은 전일 대비, 첫날은 전주 가격 대비)' : '') + '.'); // 기준
  fn.push('막대 축은 변동 확인을 위해 0에서 시작하지 않음.'); // 축 주석
  if (wk.source) fn.push('출처 : ' + (String(wk.source).length > 90 ? String(wk.source).slice(0, 90) + '…' : String(wk.source))); // 출처(길면 줄임)
  st.notes.forEach(n => fn.push(n)); // 검산 주석
  els.push(Tx(0.2, 7.15, 9.65, 0.3, [Pa(Rn(fn.join(' '), { sz: 7.5, c: C.gray }))], { va: 't' })); // 주석 상자
  return { id: 'item-' + key, kind: 'item', key, title: m.code, name: m.code, els, warn, notes: st.notes }; // 쪽 객체
}

// ───────────────────────── 8. 요약 쪽 ─────────────────────────
function buildSummarySlide(win, wk) { // 첫 장: 품목 세로 나열, 가격 · 전주비 · 코멘터리
  const sts = ITEMS.map(m => itemStats(m.key, win, wk.week)); // 6개 품목 통계
  const els = []; // 요소 목록
  const warn = []; // 경고
  titleEls('6Keys 주간 가격 요약', [weekShort(wk.week) + ' (' + weekRangeText(wk.week) + ')', '전주 대비 · 단위 $/bbl, $/MT'], null).forEach(e => els.push(e)); // 상단
  messageBox(summaryHeadline(wk, sts), 0.82, 0.46, { kind: 'week', field: 'summary_headline' }).forEach(e => els.push(e)); // 핵심 메시지
  const colW = [1.4, 0.95, 1.0, 3.85, 2.45]; // 열 너비(합 9.65)
  const rowH = [0.3, 0.91, 0.91, 0.91, 0.91, 0.91, 0.91]; // 행 높이(머리글 + 6행)
  const wb = { l: sline(C.wht, 0.75), r: sline(C.wht, 0.75) }; // 머리글 흰 구분선
  const hd = ['품목', '가격', '전주비', '코멘터리', 'AI 전망'].map((t, i) => Cell([Pa(Rn(t, { sz: 9, b: true, c: C.wht }), { al: i >= 3 ? 'l' : 'c' })], { fill: C.blk, bd: wb, ins: [i >= 3 ? 0.1 : 0.04, 0.02, 0.04, 0.02] })); // 머리글 행
  const rows = [hd]; // 표 행 목록
  // 코멘터리·AI 전망 글자 크기: 6행 모두 들어가는 가장 큰 크기를 공통으로 사용
  const cw = colW[3] - 0.2, aw = colW[4] - 0.2, chMax = rowH[1] - 0.08; // 셀 안 가용 폭·높이
  const aiParas = (s, sz) => { // AI 전망 칸 문단(방향 한 줄 + 요약 문장)
    const pl = outlookPill(s.it.ai_outlook); // 방향 알약 정보
    if (!pl) return [Pa(Rn(s.it.ai_outlook ? aiGist(s.it.ai_outlook) : '(내용 없음)', { sz: sz, c: s.it.ai_outlook ? C.blk : 'A6A6A6' }))]; // 방향 없음
    return [Pa(Rn(pl.t, { sz: sz + 0.5, b: true, c: pl.c })), Pa(Rn(aiGist(s.it.ai_outlook), { sz: sz }))]; // 방향 + 요약
  };
  let csz = 8; // 시작 크기
  const sizes = [8, 7.5, 7, 6.5]; // 후보 크기
  for (let i = 0; i < sizes.length; i++) { // 큰 것부터
    csz = sizes[i]; // 후보
    const okAll = sts.every(s => measureH([Pa(Rn(s.it.commentary || '(내용 없음)', { sz: csz }))], cw, [0, 0, 0, 0]) <= chMax && measureH(aiParas(s, csz), aw, [0, 0, 0, 0]) <= chMax); // 두 칸 모두 들어가는지
    if (okAll) break; // 확정
    if (i === sizes.length - 1) warn.push('요약 코멘터리·AI 전망이 칸을 넘칩니다 (최소 글자 크기 적용)'); // 마지막까지 안 맞으면 경고
  }
  sts.forEach((s, ri) => { // 품목 행
    const m = s.meta; // 품목
    const dc = dirColor(s.dir); // 방향 색
    const bar = { l: sline(dc, 4) }; // 왼쪽 방향 막대(굵은 왼쪽 테두리)
    const c0 = Cell([Pa(Rn(m.code, { sz: 12, b: true })), Pa(Rn(m.ko, { sz: 8 })), Pa(Rn(m.bench, { sz: 7.5, c: C.gray }))], { bd: bar, ins: [0.12, 0.04, 0.04, 0.04] }); // 품목 칸
    const c1 = Cell([Pa(Rn(priceStr(s.price, m), { sz: 14, b: true }), { al: 'c' }), Pa(Rn(m.unit, { sz: 7.5, c: C.gray }), { al: 'c' })], {}); // 가격 칸
    const c2 = Cell([Pa(Rn(s.dir === 0 ? '–' : deltaText(s.d, m), { sz: 11, b: true, c: dc }), { al: 'c' }), Pa(Rn(isFinite(s.p) ? pctText(s.p, 2) : '–', { sz: 8, c: dc }), { al: 'c' })], {}); // 전주비 칸
    const c3 = Cell([Pa(Rn(s.it.commentary || '(내용 없음)', { sz: csz, c: s.it.commentary ? C.blk : 'A6A6A6' }))], { va: 'm', ins: [0.1, 0.04, 0.1, 0.04], bind: { kind: 'item', key: m.key, field: 'commentary' } }); // 코멘터리 칸
    const c4 = Cell(aiParas(s, csz), { va: 'm', ins: [0.1, 0.04, 0.1, 0.04] }); // AI 전망 칸(요약 표시 전용 — 전문은 각 품목 쪽에서 수정)
    rows.push([c0, c1, c2, c3, c4]); // 행 추가
    rows[rows.length - 1].go = ri + 1; // 클릭 시 이동할 쪽 번호(0부터, 요약이 0)
  });
  const tb = Tb(0.2, 1.36, colW, rowH, rows, { border: 'h', step: 1 }); // 요약 표
  els.push(tb); // 추가
  const fn = []; // 주석
  fn.push('※ 전주 대비 = 금주 − 전주 가격 (▲ 상승 빨강 · ▼ 하락 파랑 · – 보합 검정). 행을 누르면 해당 품목 쪽으로 이동. AI 전망은 첫 문장 요약이며 전문은 각 품목 쪽 ⑦ 참조.'); // 안내
  fn.push('기준 : ' + ITEMS.map(m => m.code + ' ' + m.bench).join(' / ') + '.'); // 기준
  sts.forEach(s => s.notes.forEach(n => fn.push(n))); // 검산 주석
  els.push(Tx(0.2, 7.2, 9.65, 0.26, [Pa(Rn(fn.join(' '), { sz: 7.5, c: C.gray }))], { va: 't' })); // 주석 상자
  return { id: 'summary', kind: 'summary', key: '', title: '요약', name: '요약', els, warn, notes: [] }; // 쪽 객체
}

// ───────────────────────── 9. 전체 쪽 목록 ─────────────────────────
function buildSlides(win, wk) { // 선택 주차의 전체 쪽 목록(요약 + 6개 품목)을 만드는 함수
  const out = [buildSummarySlide(win, wk)]; // 첫 장 요약
  ITEMS.forEach(m => out.push(buildItemSlide(m.key, win, wk))); // 품목별 1장
  out.forEach((s, i) => { s.no = i + 1; s.steps = s.els.reduce((a, e) => Math.max(a, e.step || 0), 0); }); // 번호·단계 수
  return out; // 쪽 목록
}
