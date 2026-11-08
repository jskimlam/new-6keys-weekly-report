// ============================================================================
// 01_core.js — 설정 · 공통 유틸 · 데이터(시트 연동 + 내장 자료)
// 설치 명령어 없음 — 더블클릭으로 실행. 이 파일은 build.py 가 index.html 안으로 합친다.
// ============================================================================
'use strict'; // 엄격 모드: 오타로 생기는 전역 변수 실수를 막는다

// ───────────────────────── 1. 설정값 ─────────────────────────
const GAS_URL = 'https://script.google.com/macros/s/AKfycby5jabEVuz3z0IWccf-ucvbhNUXBdp0c4L9oVDJ2lnFDF9guN1Q3462EBvK3Tlo5fWI/exec'; // 기존 Weekly-Brief-Dashboard 와 공유하는 구글 시트(Apps Script) 주소
const ADMIN_PASSWORD = '678123'; // 관리자 모드 비밀번호(요청에 따라 앱 안에 둠 — 공개 레포이므로 보안 수단이 아님)
const APP_TITLE = '6Keys위클리'; // PPT 파일명 앞부분
const PAGE_W = 10.0461; // 용지 가로(인치) = 25.517cm
const PAGE_H = 7.5; // 용지 세로(인치) = 19.05cm
const PXI = 159.27; // 화면 캔버스 1인치당 픽셀
const PXPT = 2.212; // 화면 캔버스 1pt당 픽셀
const SEED = window.__SEED__ || {}; // 빌드 때 내장한 주차별 자료(오프라인·시트 장애 대비)
const DECO = window.__DECO__ || {}; // 마스터 장식 PNG(base64)
const FORCE_LOCAL = ['2026-W40']; // 내장 자료가 항상 우선인 주차(기존 앱과 동일 규칙)
const VERIFIED = ['2026-W42', '2026-W43', '2026-W44', '2026-W45']; // 가격 검증 완료 주차(시트 가격이 다르면 내장 자료 사용 — 기존 앱과 동일 규칙)

// 회사양식 색상(녹색 계열은 마스터 장식 외에는 쓰지 않는다)
const C = { blk: '000000', red: 'FF0000', blue: '0000FF', gray: '595959', line: 'D9D9D9', soft: 'F2F2F2', hdr2: 'E6E6E6', navy: '0C4270', bar: '213F8F', mid: '5B84C4', lgray: 'BFBFBF', wht: 'FFFFFF' }; // 색상표

// 6대 원료 정의: key 는 시트(GAS)에 저장된 품목 키
const ITEMS = [ // 표시 순서 = 쪽 순서
  { key: 'WTI', code: 'WTI', title: 'WTI Crude Oil', ko: 'WTI 원유', bench: 'NYMEX Light Sweet', basis: 'NYMEX WTI 선물 (Light Sweet Crude)', unit: '$/bbl', per: 'bbl', dec: 2 }, // WTI
  { key: 'Styrene', code: 'SM', title: 'Styrene Monomer (SM)', ko: '스티렌모노머', bench: 'CFR China', basis: 'SM CFR China', unit: '$/MT', per: 'MT', dec: 1 }, // 스티렌모노머
  { key: 'Acrylonitrile', code: 'AN', title: 'Acrylonitrile (AN)', ko: '아크릴로니트릴', bench: 'CFR Far East Asia', basis: 'ACN CFR Far East Asia', unit: '$/MT', per: 'MT', dec: 1 }, // 아크릴로니트릴
  { key: 'Butadiene', code: 'BD', title: 'Butadiene (BD)', ko: '부타디엔', bench: 'CFR China', basis: 'BD CFR China', unit: '$/MT', per: 'MT', dec: 1 }, // 부타디엔
  { key: 'BPA', code: 'BPA', title: 'Bisphenol A (BPA)', ko: '비스페놀A', bench: 'CFR China Spot', basis: 'BPA CFR China Spot', unit: '$/MT', per: 'MT', dec: 1 }, // 비스페놀A
  { key: 'MMA', code: 'MMA', title: 'Methyl Methacrylate (MMA)', ko: '메틸메타크릴레이트', bench: 'CFR South Korea', basis: 'MMA CFR South Korea (500mt 이상)', unit: '$/MT', per: 'MT', dec: 1 } // MMA
];
const ITEM_BY_KEY = {}; // key → 정의
ITEMS.forEach(m => { ITEM_BY_KEY[m.key] = m; }); // 사전 채우기

// 앱 전체 상태
const state = { // 모든 화면 상태를 한곳에 모은다
  weeks: [], // 주차 목록(오름차순)
  cache: {}, // 주차 → 정규화된 자료
  dirty: {}, // 주차 → 화면에서 수정됨(시트 저장 전)
  week: '', // 선택된 주차
  win: [], // 선택 주차 기준 최근 6주 자료
  slides: [], // 장면(scene) 쪽 목록
  cur: 0, // 현재 쪽 번호(0부터)
  admin: false, // 관리자 모드 여부
  edit: false, // 편집(E) 모드 여부
  stepMode: false, // 단계 등장 여부
  stepNo: 0, // 현재까지 나타난 단계
  trans: 'fade', // 전환 효과
  sheetOk: false, // 시트 연결 성공 여부
  offline: false, // true 이면 시트를 부르지 않고 내장 자료만 사용(첫 화면을 즉시 띄우기 위함)
  present: false // 전체화면 발표 여부
};

// ───────────────────────── 2. 공통 유틸 ─────────────────────────
function esc(s) { // HTML 특수문자를 안전하게 바꾸는 함수
  return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); // 문자 치환
}
function num(v) { // 문자·숫자를 숫자로 바꾸고 비었으면 NaN 을 돌려주는 함수
  if (v === null || v === undefined || v === '') return NaN; // 빈 값은 NaN
  const n = parseFloat(String(v).replace(/,/g, '')); // 쉼표 제거 후 숫자 변환
  return isNaN(n) ? NaN : n; // 변환 실패는 NaN
}
function clone(o) { return JSON.parse(JSON.stringify(o)); } // 깊은 복사
function fmtNum(v, dec) { // 가격 표기: WTI 는 소수 2자리 고정, 나머지는 소수가 있을 때만 1자리
  if (!isFinite(v)) return '–'; // 값이 없으면 대시
  const d = dec === 2 ? 2 : (Math.abs(v % 1) > 1e-9 ? 1 : 0); // 소수 자릿수 결정
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); // 천 단위 쉼표
}
function dirOf(v) { // 증감 방향: 1 상승, -1 하락, 0 보합
  if (!isFinite(v)) return 0; // 값이 없으면 보합 취급
  return Math.abs(v) < 1e-9 ? 0 : (v > 0 ? 1 : -1); // 부호 판정
}
function dirColor(d) { return d > 0 ? C.red : (d < 0 ? C.blue : C.blk); } // 상승 원색 빨강, 하락 원색 파랑, 보합 검정
function dirArrow(d) { return d > 0 ? '▲' : (d < 0 ? '▼' : '–'); } // 방향 기호
function dirWord(d) { return d > 0 ? '상승' : (d < 0 ? '하락' : '보합'); } // 방향 낱말
function deltaText(v, meta) { // 증감 금액 표기(▲190 / ▼175.5 / –)
  const d = dirOf(v); // 방향
  return d === 0 ? '–' : dirArrow(d) + fmtNum(Math.abs(v), meta.dec); // 보합이면 대시
}
function pctText(p, digits) { // 증감률 표기(▲11.80% / ▼12.76% / 0.00%)
  const d = dirOf(p); // 방향
  if (d === 0) return (0).toFixed(digits) + '%'; // 보합은 0.00%
  return dirArrow(d) + Math.abs(p).toFixed(digits) + '%'; // 기호 + 절대값
}
function weekParts(w) { // 'YYYY-Wnn' 을 연·주로 나누는 함수
  const m = /^(\d{4})-W(\d{2})$/i.exec(String(w || '')); // 형식 검사
  return m ? { y: +m[1], n: +m[2] } : null; // 연·주 반환
}
function isoFriday(w, offsetWeeks) { // 해당 주차(+오프셋)의 금요일 날짜(UTC)
  const p = weekParts(w); // 연·주
  if (!p) return null; // 형식 오류
  const jan4 = new Date(Date.UTC(p.y, 0, 4)); // 1월 4일은 항상 1주차
  const day = jan4.getUTCDay() || 7; // 월=1 … 일=7
  const mon = new Date(jan4); // 월요일 계산용 복사
  mon.setUTCDate(jan4.getUTCDate() - day + 1 + (p.n - 1 + (offsetWeeks || 0)) * 7); // 해당 주 월요일
  const fri = new Date(mon); // 금요일 계산용 복사
  fri.setUTCDate(mon.getUTCDate() + 4); // 월 + 4일
  return fri; // 금요일
}
function mdText(d) { return d ? (d.getUTCMonth() + 1) + '/' + d.getUTCDate() : ''; } // 날짜 → 'M/D'
function weekShort(w) { const p = weekParts(w); return p ? 'W' + String(p.n).padStart(2, '0') : String(w); } // 'W45'
function fridayText(w, off) { return mdText(isoFriday(w, off || 0)); } // 금요일 'M/D'
function weekLabel(w) { return weekShort(w) + ' (' + fridayText(w) + ')'; } // 'W45 (11/6)'
function weekRangeText(w) { // 'M/D~M/D' 월~금 범위
  const f = isoFriday(w, 0); // 금요일
  if (!f) return ''; // 형식 오류
  const m = new Date(f); m.setUTCDate(f.getUTCDate() - 4); // 월요일
  return mdText(m) + '~' + mdText(f); // 범위 문자열
}
let toastTimer = 0; // 토스트 타이머
function toast(msg, ms) { // 화면 아래 한글 안내문을 잠깐 보여주는 함수
  const t = document.getElementById('toast'); // 토스트 요소
  if (!t) return; // 아직 화면이 없으면 무시
  t.textContent = msg; // 문구 넣기
  t.classList.add('on'); // 보이기
  clearTimeout(toastTimer); // 이전 타이머 취소
  toastTimer = setTimeout(() => t.classList.remove('on'), ms || 2600); // 잠시 후 숨기기
}
function lines(s) { // 여러 줄 문자열을 글머리표 제거한 줄 배열로 바꾸는 함수
  return String(s || '').split(/\n+/).map(x => x.replace(/^\s*[-•·▪]\s*/, '').trim()).filter(Boolean); // 줄 정리
}

// ───────────────────────── 3. 시트(GAS) 연동 ─────────────────────────
async function callGAS(action, payload) { // 기존 앱과 같은 방식으로 Apps Script 를 호출하는 함수
  try { // 네트워크 오류를 잡기 위함
    const body = Object.assign({ action }, payload || {}); // 요청 본문
    const isPost = ['saveEntry', 'updateItemData'].includes(action); // 저장 계열은 POST
    const url = isPost ? GAS_URL : GAS_URL + '?data=' + encodeURIComponent(JSON.stringify(body)); // 읽기는 GET 쿼리
    const ctl = new AbortController(); // 시간 제한용
    const tm = setTimeout(() => ctl.abort(), 20000); // 20초 후 중단
    const res = await fetch(url, { method: isPost ? 'POST' : 'GET', headers: { 'Content-Type': 'text/plain' }, body: isPost ? JSON.stringify(body) : null, redirect: 'follow', signal: ctl.signal }); // 호출
    clearTimeout(tm); // 타이머 해제
    return await res.json(); // JSON 응답
  } catch (e) { // 실패 시
    console.warn('시트 연결 실패', e); // 개발자 도구용 기록
    return { success: false, error: String(e) }; // 실패 객체
  }
}
function normalizeDaily(raw) { // 일간 가격을 [{date, price}] 형태로 맞추는 함수
  if (!raw) return []; // 없으면 빈 배열
  if (typeof raw === 'string') { // 문자열이면
    try { raw = JSON.parse(raw); } catch (_) { // JSON 이 아니면 줄 단위로 해석
      return raw.split(/\n+/).map(l => l.trim()).filter(Boolean).map(l => { // 한 줄씩
        const p = l.split(/[,:|]/).map(v => v.trim()); // 날짜,가격
        return (p.length >= 2 && isFinite(num(p[1]))) ? { date: p[0], price: num(p[1]) } : null; // 변환
      }).filter(Boolean); // 실패 제거
    }
  }
  if (!Array.isArray(raw)) return []; // 배열이 아니면 빈 배열
  return raw.map(x => { // 항목별 정리
    if (Array.isArray(x) && x.length >= 2) return { date: String(x[0]), price: num(x[1]) }; // [날짜,가격]
    if (x && typeof x === 'object') return { date: String(x.date ?? x.day ?? x.label ?? ''), price: num(x.price ?? x.value ?? x.close) }; // 객체
    return null; // 그 밖은 무시
  }).filter(x => x && isFinite(x.price)); // 숫자 아닌 것 제거
}
function normalizeWeek(data) { // 시트·내장 자료를 앱 내부 표준 형태로 맞추는 함수
  const out = { week: data.week, as_of: data.as_of || '', source: data.source || '', summary_headline: data.summary_headline || '', items: {} }; // 뼈대
  ITEMS.forEach(m => { // 6개 품목 모두
    const d = (data.items || {})[m.key] || {}; // 원본 품목
    const stored = v => (v === undefined || v === null || v === '') ? null : num(v); // 저장된 증감값(없으면 null)
    out.items[m.key] = { // 표준 필드
      price: d.price ?? '', // 현재가
      prev_price: d.prev_price ?? d.previous_price ?? '', // 전주 가격
      change_abs: stored(d.change_abs), // 저장된 증감액(검산용)
      change_pct: stored(d.change_pct), // 저장된 증감률(검산용)
      commentary: d.commentary ?? d.comment ?? '', // 코멘터리
      factors: d.factors ?? d['변동요인'] ?? '', // 변동요인
      outlook: d.outlook ?? d['결론및전망'] ?? d['결론 및 전망'] ?? '', // 결론 및 전망
      ai_outlook: d.ai_outlook ?? d['ai 전망'] ?? d['AI 전망'] ?? '', // AI 전망
      additional_info: d.additional_info ?? d['추가정보'] ?? '', // 추가정보
      daily_prices: normalizeDaily(d.daily_prices ?? d.dailyPrice ?? d.daily_data ?? []), // 일간 가격
      headline: d.headline ?? '' // 핵심 메시지(비우면 자동 초안)
    };
  });
  return out; // 표준화된 주차 자료
}
function mergeNonempty(localItems, remoteItems) { // 시트의 비어 있지 않은 값이 내장 자료를 덮어쓰는 병합(기존 앱과 동일)
  const merged = Object.assign({}, localItems || {}); // 내장 자료에서 시작
  Object.keys(remoteItems || {}).forEach(name => { // 시트 품목마다
    const fields = remoteItems[name]; // 시트 필드
    if (!fields || typeof fields !== 'object') return; // 형식 오류는 무시
    const chosen = Object.assign({}, merged[name] || {}); // 기존 값 복사
    Object.keys(fields).forEach(k => { // 필드마다
      const v = fields[k]; // 값
      if (v === null || v === undefined || v === '') return; // 빈 값은 건너뜀
      if (Array.isArray(v) && v.length === 0) return; // 빈 배열도 건너뜀
      chosen[k] = v; // 시트 값 채택
    });
    merged[name] = chosen; // 병합 결과 저장
  });
  return merged; // 병합된 품목들
}
function mergeWeek(week, local, remote) { // 내장 자료와 시트 응답을 주차별 규칙대로 합치는 함수
  const rOk = !!(remote && remote.success && remote.items); // 시트 응답 유효 여부
  const rItems = rOk ? remote.items : {}; // 시트 품목
  if (!local) return rOk ? normalizeWeek(Object.assign({}, remote, { week })) : null; // 내장 자료가 없으면 시트만 사용
  let items; // 최종 품목
  if (FORCE_LOCAL.includes(week)) { // W40: 내장 자료 고정
    items = local.items; // 내장 자료 사용
  } else if (VERIFIED.includes(week)) { // W42~W45: 가격은 검증된 내장 자료 우선
    items = mergeNonempty(local.items, rItems); // 문구는 시트 우선 병합
    Object.keys(local.items).forEach(name => { // 품목마다 가격 검증
      const live = rItems[name] || {}; // 시트 품목
      const ver = local.items[name]; // 검증된 내장 품목
      if (Number(live.price) !== Number(ver.price)) { // 시트 가격이 다르면
        items[name] = Object.assign({}, ver); // 내장 자료 전체로 복원
      } else { // 가격이 같으면 숫자 필드는 내장값 고정
        ['price', 'prev_price', 'change_abs', 'change_pct', 'daily_prices'].forEach(k => { items[name][k] = ver[k]; }); // 숫자 필드 복사
      }
    });
  } else { // 그 밖의 내장 주차(W41 등): 시트 우선 병합
    items = mergeNonempty(local.items, rItems); // 병합
  }
  return normalizeWeek(Object.assign({}, local, { items, week })); // 표준화
}
async function loadWeekList() { // 시트와 내장 자료의 주차 목록을 합치는 함수
  const res = await callGAS('getWeekList', {}); // 시트 주차 목록
  state.sheetOk = !!(res && res.success); // 연결 성공 여부 기록
  let weeks = (res && res.success && Array.isArray(res.weeks)) ? res.weeks.slice() : []; // 시트 주차
  Object.keys(SEED).forEach(w => { if (!weeks.includes(w)) weeks.push(w); }); // 내장 주차 추가
  weeks = weeks.filter(w => weekParts(w)); // 형식이 맞는 것만
  weeks = Array.from(new Set(weeks)).sort(); // 중복 제거 후 오름차순
  return weeks; // 주차 목록
}
async function fetchWeek(week, force) { // 한 주차 자료를 시트+내장 자료로 불러오는 함수
  if (!force && state.cache[week]) return state.cache[week]; // 캐시 사용
  if (state.dirty[week] && state.cache[week]) return state.cache[week]; // 수정 중인 주차는 덮어쓰지 않음
  const remote = state.offline ? null : await callGAS('getData', { week }); // 시트 호출(첫 화면 때는 건너뜀)
  const merged = mergeWeek(week, SEED[week] || null, remote); // 병합
  if (merged) state.cache[week] = merged; // 캐시에 저장
  return merged; // 결과(없으면 null)
}
async function loadWindow(week, n) { // 선택 주차 기준 최근 n주(기본 6주) 자료를 불러오는 함수
  const i = state.weeks.indexOf(week); // 선택 주차 위치
  const slice = state.weeks.slice(Math.max(0, i - ((n || 6) - 1)), i + 1); // 최근 n개 기록 주차
  const list = await Promise.all(slice.map(w => fetchWeek(w))); // 병렬 로드
  return list.filter(Boolean); // 불러온 것만
}
function itemPayload(week, key) { // 시트에 저장할 품목 페이로드를 만드는 함수(기존 앱 필드 + 추가 필드)
  const it = state.cache[week].items[key]; // 화면 자료
  return { week, item: key, price: it.price, commentary: it.commentary, factors: it.factors, outlook: it.outlook, additional_info: it.additional_info, daily_prices: it.daily_prices, ai_outlook: it.ai_outlook, prev_price: it.prev_price, headline: it.headline }; // 페이로드
}
async function saveItemToSheet(week, key) { // 품목 1개를 시트에 저장하는 함수(updateItemData)
  const res = await callGAS('updateItemData', itemPayload(week, key)); // 호출
  return !!(res && res.success); // 성공 여부
}
async function saveWeekToSheet(week) { // 주차 전체를 시트에 저장하는 함수(saveEntry)
  const items = {}; // 품목 모음
  ITEMS.forEach(m => { const p = itemPayload(week, m.key); delete p.week; delete p.item; items[m.key] = p; }); // 품목별 페이로드
  const res = await callGAS('saveEntry', { data: { week, items } }); // 호출
  return !!(res && res.success); // 성공 여부
}
