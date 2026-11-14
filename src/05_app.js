// ============================================================================
// 05_app.js — 앱: 쪽 이동 · 전환 효과 · 단계 등장 · 전체화면 발표 · 발표 도구 · 관리자/편집 · 저장 · 초기화
// ============================================================================

// ───────────────────────── 1. 작은 도우미 ─────────────────────────
const $ = id => document.getElementById(id); // id 로 요소 찾기
const TRANS = ['fade', 'push', 'zoom', 'none']; // 전환 효과 목록(T 키 순환)
let lastDir = 1; // 마지막 이동 방향(밀기 전환용)
let numBuf = ''; // 숫자+Enter 이동용 입력 버퍼
let numTimer = 0; // 숫자 입력 시간 제한
let idleTimer = 0; // 마우스 정지 타이머
let coverMode = ''; // 가림 화면 상태('' / 'b' / 'w')
let laserOn = false; // 레이저 포인터 상태
let busy = false; // 불러오는 중 여부
function curSlide() { return state.slides[state.cur]; } // 현재 쪽
function stepNow() { return state.stepMode ? state.stepNo : 999; } // 현재 보여줄 단계(꺼져 있으면 전부)
function isTyping(t) { return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); } // 입력 칸 여부
function anyDirty() { return Object.keys(state.dirty).some(w => state.dirty[w]); } // 저장 안 된 수정 여부

// ───────────────────────── 2. 쪽 그리기·이동 ─────────────────────────
function renderCurrentInto(layer) { // 현재 쪽을 만들어 layer 에 붙인다
  const page = renderPage(curSlide(), { stepNo: stepNow(), edit: state.edit }); // 쪽 생성
  layer.appendChild(page); // 붙이기
  return page; // 반환
}
function updateChrome() { // 칩·진행 막대·쪽 번호·버튼 상태 갱신
  document.querySelectorAll('#pageChips .chip').forEach((b, i) => b.classList.toggle('cur', i === state.cur)); // 현재 칩
  const n = state.slides.length; // 쪽 수
  $('hudBar').style.width = n ? ((state.cur + 1) / n * 100).toFixed(1) + '%' : '0'; // 진행 막대
  $('hudNo').textContent = (state.cur + 1) + ' / ' + n; // 쪽 번호
  $('btnStep').textContent = '단계 등장: ' + (state.stepMode ? '켜짐' : '꺼짐'); // 단계 버튼
  $('btnStep').classList.toggle('on', state.stepMode); // 켜짐 표시
  $('btnEdit').classList.toggle('on', state.edit); // 편집 표시
  $('transSel').value = state.trans; // 전환 선택값
}
function showPage(idx, dir) { // idx 쪽으로 이동(전환 효과 적용). dir: 1 앞으로, -1 뒤로
  if (!state.slides.length) return; // 쪽이 없으면 무시
  idx = Math.max(0, Math.min(state.slides.length - 1, idx)); // 범위 보정
  const layer = $('pageLayer'); // 쪽 층
  const old = Array.from(layer.children); // 기존 쪽들
  const first = old.length === 0; // 처음 그리는지
  state.cur = idx; // 현재 쪽 갱신
  const d = dir || (lastDir || 1); // 방향
  lastDir = d; // 기억
  const page = renderCurrentInto(layer); // 새 쪽
  const tr = state.trans; // 전환 종류
  if (first || tr === 'none') { old.forEach(o => o.remove()); } // 즉시 교체
  else { // 전환 효과
    old.slice(0, -1).forEach(o => o.remove()); // 오래된 잔여 쪽 제거
    const prev = old[old.length - 1]; // 직전 쪽
    page.classList.add('t-' + tr); if (prev) prev.classList.add('t-' + tr); // 전환 클래스
    if (tr === 'fade') { page.style.opacity = '0'; } // 페이드 시작 상태
    if (tr === 'push') { page.style.transform = 'translateX(' + (100 * d) + '%)'; } // 밀기 시작 상태
    if (tr === 'zoom') { page.style.opacity = '0'; page.style.transform = 'scale(0.92)'; } // 확대 시작 상태
    void page.offsetWidth; // 강제 리플로우
    requestAnimationFrame(() => { // 다음 프레임에 도착 상태로
      page.style.opacity = '1'; page.style.transform = 'none'; // 새 쪽 도착
      if (prev) { // 이전 쪽 퇴장
        if (tr === 'fade') prev.style.opacity = '0'; // 사라짐
        if (tr === 'push') prev.style.transform = 'translateX(' + (-100 * d) + '%)'; // 밀려남
        if (tr === 'zoom') { prev.style.opacity = '0'; prev.style.transform = 'scale(1.06)'; } // 커지며 사라짐
      }
    });
    setTimeout(() => { if (prev && prev.parentNode) prev.remove(); }, 600); // 전환 끝나면 제거
  }
  updateChrome(); // 칩·막대 갱신
  const ov = checkTableOverlap(page, curSlide()); // 표 겹침 검사
  if (ov.length) console.warn(ov.join('\n')); // 개발자 도구 기록
}
function reRender() { // 같은 쪽을 전환 없이 다시 그림(편집·단계 변경 후)
  const layer = $('pageLayer'); // 쪽 층
  layer.innerHTML = ''; // 비우기
  const page = renderCurrentInto(layer); // 다시 그리기
  updateChrome(); // 갱신
  return page; // 반환
}
function revealSteps() { // 현재 단계까지 요소를 나타낸다(애니메이션)
  document.querySelectorAll('#pageLayer .el').forEach(d => { d.classList.toggle('step-hide', parseInt(d.dataset.s || '0', 10) > stepNow()); }); // 단계 비교
}
function goNext() { // 다음(단계가 남아 있으면 단계부터)
  const s = curSlide(); if (!s) return; // 쪽 없음
  if (state.stepMode && state.stepNo < s.steps) { state.stepNo++; revealSteps(); return; } // 단계 등장
  if (state.cur < state.slides.length - 1) { state.stepNo = 0; showPage(state.cur + 1, 1); } // 다음 쪽
  else toast('마지막 쪽입니다', 1200); // 끝
}
function goPrev() { // 이전(단계가 켜져 있으면 단계부터 되돌림)
  if (state.stepMode && state.stepNo > 0) { state.stepNo--; revealSteps(); return; } // 단계 되돌리기
  if (state.cur > 0) { state.stepNo = state.stepMode ? state.slides[state.cur - 1].steps : 0; showPage(state.cur - 1, -1); } // 이전 쪽(전부 보이는 상태)
  else toast('첫 쪽입니다', 1200); // 처음
}
function gotoPage(i) { // 특정 쪽으로 이동
  if (i === state.cur) return; // 같은 쪽
  state.stepNo = 0; showPage(i, i > state.cur ? 1 : -1); // 이동
}
function buildChips() { // 쪽 이동 칩 만들기
  const box = $('pageChips'); box.innerHTML = ''; // 비우기
  state.slides.forEach((s, i) => { // 쪽마다
    const b = document.createElement('button'); b.className = 'chip'; b.textContent = String(i + 1); b.title = 'S' + pad2(i + 1) + ' ' + s.name; // 칩
    b.onclick = () => gotoPage(i); // 이동
    box.appendChild(b); // 추가
  });
}
function rebuildSlides(keepCur) { // 자료가 바뀌었을 때 장면을 다시 만들고 현재 쪽 유지
  const wk = state.cache[state.week]; if (!wk) return; // 자료 없음
  const cur = state.cur; // 현재 쪽 기억
  state.slides = buildSlides(state.win.map(w => state.cache[w.week] || w), wk); // 장면 재생성
  state.win = state.win.map(w => state.cache[w.week] || w); // 창 갱신
  buildChips(); // 칩
  state.cur = keepCur ? Math.min(cur, state.slides.length - 1) : 0; // 쪽 유지
  const warns = []; state.slides.forEach(s => s.warn.forEach(w => warns.push(w))); // 경고 모으기
  if (warns.length) { console.warn(warns.join('\n')); toast('주의 : ' + warns[0] + (warns.length > 1 ? ' 외 ' + (warns.length - 1) + '건' : ''), 5000); } // 글 넘침 안내
}

// ───────────────────────── 3. 주차 불러오기 ─────────────────────────
function fillWeekSelect() { // 주차 선택 상자 채우기(최신이 위)
  const sel = $('weekSel'); sel.innerHTML = ''; // 비우기
  state.weeks.slice().reverse().forEach(w => { const o = document.createElement('option'); o.value = w; o.textContent = weekLabel(w) + (state.dirty[w] ? ' *' : ''); sel.appendChild(o); }); // 옵션
  sel.value = state.week; // 선택값
}
async function loadWeek(week, keepPage) { // 주차를 불러와 화면에 표시
  if (busy) return; busy = true; // 중복 방지
  try { // 오류 안내
    state.week = week; // 선택 주차
    state.win = await loadWindow(week, 6); // 최근 6주
    if (!state.win.length || state.win[state.win.length - 1].week !== week) throw new Error('데이터 형식이 올바르지 않습니다 (' + week + ')'); // 검증
    rebuildSlides(!!keepPage); // 장면 생성
    state.stepNo = 0; // 단계 초기화
    $('pageLayer').innerHTML = ''; // 층 비우기
    showPage(state.cur, 1); // 표시
    fillWeekSelect(); // 주차 상자
  } catch (e) { console.error(e); toast(e.message || '데이터를 불러오지 못했습니다', 5000); } // 한글 안내
  busy = false; // 해제
}
async function refreshFromSheet(silent) { // 시트에서 최신 자료를 받아와 병합(백그라운드)
  const weeks = await loadWeekList(); // 주차 목록(시트 + 내장)
  if (weeks.length) { state.weeks = weeks; fillWeekSelect(); } // 목록 갱신
  if (!state.sheetOk) { if (!silent) toast('시트에 연결하지 못해 내장 자료로 표시합니다 (오프라인 가능)', 3500); return false; } // 시트 실패 안내
  const target = state.week; // 현재 주차
  const keep = state.dirty[target]; // 수정 중인지
  if (!keep) { // 수정 중이 아니면 시트 자료로 갱신
    const slice = state.weeks.slice(Math.max(0, state.weeks.indexOf(target) - 5), state.weeks.indexOf(target) + 1); // 6주
    slice.forEach(w => { delete state.cache[w]; }); // 캐시 비우기
    await loadWeek(target, true); // 다시 표시
  }
  if (!silent) toast('시트 자료를 불러왔습니다'); // 완료
  return true; // 성공
}

// ───────────────────────── 4. 전체화면 발표 ─────────────────────────
function enterPresent() { // 발표 시작
  if (state.present) return; // 이미 발표 중
  state.present = true; // 상태
  document.body.classList.add('present'); // 막대 숨김
  const el = document.documentElement; // 전체화면 대상
  const req = el.requestFullscreen || el.webkitRequestFullscreen; // Fullscreen API
  if (req) { Promise.resolve(req.call(el)).catch(() => { toast('창 안에서 발표 모드로 표시합니다. F11 키로 전체화면을 켤 수 있습니다', 4000); }); } // 차단되면 안내 후 창 모드
  else toast('창 안에서 발표 모드로 표시합니다. F11 키로 전체화면을 켤 수 있습니다', 4000); // 미지원
  setTimeout(fitStage, 80); // 배율 맞춤
  toast('→ 다음 · ← 이전 · B 검은 화면 · W 흰 화면 · L 레이저 · O 목차 · S 단계 · T 전환 · Esc 종료', 4500); // 단축키 안내
  resetIdle(); // 커서 숨김 타이머
}
function exitPresent() { // 발표 종료
  if (!state.present) return; // 발표 중 아님
  state.present = false; // 상태
  document.body.classList.remove('present', 'nocursor'); // 복원
  setCover(''); laserOn = false; $('laser').style.display = 'none'; closeOverview(); // 도구 해제
  if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (_) { } } // 전체화면 종료
  setTimeout(fitStage, 80); // 배율 맞춤
}
function togglePresent() { state.present ? exitPresent() : enterPresent(); } // 토글
function resetIdle() { // 마우스가 멈추면 커서 숨김
  document.body.classList.remove('nocursor'); // 보이기
  clearTimeout(idleTimer); // 타이머 초기화
  if (state.present) idleTimer = setTimeout(() => document.body.classList.add('nocursor'), 2000); // 2초 후 숨김
}
function setCover(mode) { // 검은/흰 화면
  coverMode = mode; // 상태
  const c = $('cover'); // 가리개
  c.style.display = mode ? 'block' : 'none'; // 표시
  c.style.background = mode === 'b' ? '#000' : '#fff'; // 색
}
function toggleLaser() { // 레이저 포인터
  laserOn = !laserOn; // 토글
  $('laser').style.display = laserOn ? 'block' : 'none'; // 표시
  toast(laserOn ? '레이저 포인터 켜짐 (L 로 끄기)' : '레이저 포인터 꺼짐', 1200); // 안내
}
function openOverview() { // 목차(쪽 카드)
  const ov = $('overview'); ov.innerHTML = ''; // 비우기
  state.slides.forEach((s, i) => { // 쪽마다 카드
    const card = document.createElement('div'); card.className = 'ovCard' + (i === state.cur ? ' cur' : ''); // 카드
    const th = document.createElement('div'); th.className = 'th'; // 썸네일 틀
    const inner = document.createElement('div'); inner.style.cssText = 'position:absolute;left:0;top:0;width:1600px;height:1194px;transform-origin:0 0;transform:scale(0.2);background:#fff;'; // 축소
    inner.appendChild(renderPage(s, { all: true })); inner.appendChild(masterNode()); // 쪽 + 마스터
    th.appendChild(inner); card.appendChild(th); // 조립
    const cap = document.createElement('div'); cap.textContent = 'S' + pad2(i + 1) + ' · ' + s.name; card.appendChild(cap); // 캡션
    card.onclick = () => { closeOverview(); gotoPage(i); }; // 클릭 이동
    ov.appendChild(card); // 추가
  });
  ov.classList.add('on'); // 표시
}
function closeOverview() { $('overview').classList.remove('on'); } // 목차 닫기
function toggleOverview() { $('overview').classList.contains('on') ? closeOverview() : openOverview(); } // 목차 토글
function toggleStep() { // 단계 등장 켜고 끄기
  state.stepMode = !state.stepMode; state.stepNo = 0; // 토글
  reRender(); // 다시 그리기
  toast('단계 등장 ' + (state.stepMode ? '켜짐 (클릭할 때마다 하나씩)' : '꺼짐'), 1500); // 안내
}
function cycleTrans() { // 전환 효과 순환
  state.trans = TRANS[(TRANS.indexOf(state.trans) + 1) % TRANS.length]; // 다음 효과
  updateChrome(); // 선택 상자 갱신
  toast('전환 효과 : ' + ({ fade: '페이드', push: '밀기', zoom: '확대', none: '없음' })[state.trans], 1200); // 안내
}

// ───────────────────────── 5. 키보드·마우스·터치 ─────────────────────────
function onKey(e) { // 키 입력 처리 (입력 칸에 커서가 있으면 동작하지 않음)
  if (isTyping(e.target)) return; // 입력 중
  if (document.querySelector('#modalRoot .mask')) return; // 모달이 열려 있으면 무시
  const k = e.key; // 키
  if (e.ctrlKey || e.metaKey || e.altKey) return; // 조합키는 브라우저에 맡김
  if (k === 'F5' || k === 'f' || k === 'F') { e.preventDefault(); togglePresent(); return; } // 발표
  if (k === 'Escape') { if ($('overview').classList.contains('on')) closeOverview(); else if (coverMode) setCover(''); else if (state.present) exitPresent(); return; } // Esc
  if (/^[0-9]$/.test(k)) { numBuf += k; clearTimeout(numTimer); numTimer = setTimeout(() => { numBuf = ''; }, 2500); toast('이동 : ' + numBuf + ' (Enter)', 1200); return; } // 숫자 입력
  if (k === 'Enter' && numBuf) { const n = parseInt(numBuf, 10); numBuf = ''; if (n >= 1 && n <= state.slides.length) gotoPage(n - 1); else toast('1~' + state.slides.length + ' 사이의 쪽 번호를 입력해 주세요'); return; } // 번호 이동
  if (coverMode && (k === 'b' || k === 'B' || k === 'w' || k === 'W')) { setCover(coverMode === (k.toLowerCase()) ? '' : k.toLowerCase()); return; } // 가림 토글
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n', 'N'].includes(k)) { e.preventDefault(); if (coverMode) setCover(''); else goNext(); return; } // 다음
  if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p', 'P'].includes(k)) { e.preventDefault(); if (coverMode) setCover(''); else goPrev(); return; } // 이전
  if (k === 'Home') { e.preventDefault(); gotoPage(0); return; } // 처음
  if (k === 'End') { e.preventDefault(); gotoPage(state.slides.length - 1); return; } // 끝
  if (k === 'b' || k === 'B') { setCover('b'); return; } // 검은 화면
  if (k === 'w' || k === 'W') { setCover('w'); return; } // 흰 화면
  if (k === 'l' || k === 'L') { toggleLaser(); return; } // 레이저
  if (k === 'o' || k === 'O') { toggleOverview(); return; } // 목차
  if (k === 's' || k === 'S') { toggleStep(); return; } // 단계 등장
  if (k === 't' || k === 'T') { cycleTrans(); return; } // 전환 효과
  if ((k === 'e' || k === 'E') && state.admin) { toggleEdit(); return; } // 편집(관리자)
}
function onViewportClick(e) { // 클릭 이동 (발표 중에만) + 요약표 행 이동
  const tr = e.target.closest && e.target.closest('tr[data-go]'); // 요약표 행
  if (tr && !state.edit) { gotoPage(parseInt(tr.dataset.go, 10)); return; } // 품목 쪽으로 이동
  if (!state.present || state.edit || coverMode) return; // 발표 중이 아니면 무시
  if (e.target.closest('#overview')) return; // 목차 클릭은 별도 처리
  const r = $('viewport').getBoundingClientRect(); // 영역
  if (e.clientX - r.left < r.width * 0.2) goPrev(); else goNext(); // 왼쪽 20% 이전, 그 외 다음
}
function onMouseMove(e) { // 레이저·커서 숨김 처리
  if (state.present) resetIdle(); // 커서 표시
  if (laserOn) { const r = $('viewport').getBoundingClientRect(); const L = $('laser'); L.style.left = (e.clientX - r.left) + 'px'; L.style.top = (e.clientY - r.top) + 'px'; } // 레이저 위치
}
let touchX = null; // 터치 시작 x
function initInput() { // 입력 이벤트 연결
  document.addEventListener('keydown', onKey); // 키보드
  $('viewport').addEventListener('click', onViewportClick); // 클릭
  $('viewport').addEventListener('contextmenu', e => { if (state.present) { e.preventDefault(); goPrev(); } }); // 오른쪽 클릭 = 이전
  document.addEventListener('mousemove', onMouseMove); // 마우스 이동
  $('viewport').addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true }); // 터치 시작
  $('viewport').addEventListener('touchend', e => { // 터치 끝: 스와이프
    if (touchX === null) return; const dx = e.changedTouches[0].clientX - touchX; touchX = null; // 이동량
    if (Math.abs(dx) > 50) { dx < 0 ? goNext() : goPrev(); } // 왼쪽으로 밀면 다음
  });
  window.addEventListener('resize', fitStage); // 창 크기
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && state.present && !document.body.dataset.winPresent) exitPresent(); setTimeout(fitStage, 80); }); // 전체화면 해제 시 종료
  window.addEventListener('beforeunload', e => { if (anyDirty()) { e.preventDefault(); e.returnValue = ''; } }); // 저장 안 된 수정 경고
}

// ───────────────────────── 6. 모달(공통) ─────────────────────────
function openModal(html, onReady) { // 모달 창 열기
  const root = $('modalRoot'); root.innerHTML = '<div class="mask"><div class="dlg">' + html + '</div></div>'; // 내용
  const mask = root.firstChild; // 바탕
  mask.addEventListener('mousedown', e => { if (e.target === mask) closeModal(); }); // 바깥 클릭 닫기
  if (onReady) onReady(root.querySelector('.dlg')); // 준비 콜백
  const f = root.querySelector('input,textarea,select'); if (f) setTimeout(() => f.focus(), 30); // 첫 입력 포커스
}
function closeModal() { $('modalRoot').innerHTML = ''; } // 모달 닫기

// ───────────────────────── 7. 저장 대화상자 (PNG / PPT) ─────────────────────────
function exportDialog(kind) { // 현재 쪽 / 선택 쪽 / 전체 선택 창
  const isPpt = kind === 'pptx'; // PPT 여부
  const chips = state.slides.map((s, i) => '<label><input type="checkbox" class="selpg" value="' + (i + 1) + '"> S' + pad2(i + 1) + ' ' + esc(s.name) + '</label>').join(''); // 쪽 체크 목록
  openModal('<h3>' + (isPpt ? 'PPT 저장' : '이미지(PNG) 저장') + '</h3>' +
    '<label><input type="radio" name="scope" value="current" checked> 현재 쪽 (S' + pad2(state.cur + 1) + ')</label>' +
    '<label><input type="radio" name="scope" value="selected"> 선택한 쪽</label><div class="chk">' + chips + '</div>' +
    '<label><input type="radio" name="scope" value="all"> 전체 ' + state.slides.length + '장</label>' +
    (isPpt ? '<label style="margin-top:10px"><input type="checkbox" id="optSep"> 쪽별 개별 파일 N개로 저장</label>' : '') +
    '<div class="hint">' + (isPpt ? '파일명 : ' + APP_TITLE + '_' + weekShort(state.week) + '_S03.pptx / _S01-S03.pptx / _전체_S01-S07.pptx' : 'PNG 3060×2284px (25.517×19.05cm 비율, 마스터 포함)') + '</div>' +
    '<div class="btns"><button id="exCancel">취소</button><button class="pri" id="exOk">저장</button></div>', dlg => {
    dlg.querySelector('#exCancel').onclick = closeModal; // 취소
    dlg.querySelector('#exOk').onclick = async () => { // 저장
      const scope = dlg.querySelector('input[name=scope]:checked').value; // 범위
      const sel = Array.from(dlg.querySelectorAll('.selpg:checked')).map(c => parseInt(c.value, 10)); // 선택 쪽
      const sep = !!(dlg.querySelector('#optSep') && dlg.querySelector('#optSep').checked); // 개별 파일
      closeModal(); // 닫기
      if (isPpt) await savePptx(scope, sel, sep); // PPT 저장
      else await savePngs(scope, sel); // PNG 저장
    };
  });
}
// ───────────────────────── 7-2. PDF 전체 저장 (회사 용지, 한 파일) ─────────────────────────
// 쪽을 2400×1791px 그림(JPEG)으로 찍어 PDF 한 페이지씩에 넣는다. 외부 라이브러리 없이 PDF 를 직접 조립한다.
// 그림 방식이라 PDF 안의 글자는 선택·검색되지 않는다(편집이 필요하면 PPT 저장을 사용).
function pdfBuild(pages, pw, ph) { // pages:[{bytes,w,h}] → PDF Uint8Array (pw/ph 는 pt)
  const enc = new TextEncoder(), parts = [], offs = []; // 글자 변환기, 조각 목록, 개체별 시작 위치
  let pos = 0; // 지금까지 쓴 바이트 수
  const put = u8 => { parts.push(u8); pos += u8.length; }; // 바이트 추가
  const txt = t => put(enc.encode(t)); // 글자 추가
  const obj = (n, head, body) => { // 개체 1개 기록(body 가 있으면 stream 으로)
    offs[n] = pos; txt(n + ' 0 obj\n' + head);
    if (body) { txt('\nstream\n'); put(body); txt('\nendstream'); }
    txt('\nendobj\n');
  };
  txt('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n'); // 머리말
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>'); // 문서 루트
  obj(2, '<< /Type /Pages /Count ' + pages.length + ' /Kids [' + pages.map((_, i) => (3 + i * 3) + ' 0 R').join(' ') + '] >>'); // 쪽 목록
  pages.forEach((g, i) => {
    const pg = 3 + i * 3, ct = pg + 1, im = pg + 2; // 쪽 / 내용 / 그림 개체 번호
    obj(pg, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pw.toFixed(2) + ' ' + ph.toFixed(2) + '] /Resources << /XObject << /Im0 ' + im + ' 0 R >> >> /Contents ' + ct + ' 0 R >>');
    const draw = enc.encode('q ' + pw.toFixed(2) + ' 0 0 ' + ph.toFixed(2) + ' 0 0 cm /Im0 Do Q'); // 그림을 쪽 전체에 맞춰 그림
    obj(ct, '<< /Length ' + draw.length + ' >>', draw);
    obj(im, '<< /Type /XObject /Subtype /Image /Width ' + g.w + ' /Height ' + g.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + g.bytes.length + ' >>', g.bytes);
  });
  const n = 3 + pages.length * 3, xr = pos; // 개체 수, xref 시작 위치
  let x = 'xref\n0 ' + n + '\n0000000000 65535 f \n';
  for (let k = 1; k < n; k++) x += String(offs[k]).padStart(10, '0') + ' 00000 n \n';
  txt(x + 'trailer\n<< /Size ' + n + ' /Root 1 0 R >>\nstartxref\n' + xr + '\n%%EOF\n');
  const out = new Uint8Array(pos); let o = 0; // 한 덩어리로 합치기
  parts.forEach(u => { out.set(u, o); o += u.length; });
  return out;
}
async function savePdfAll() { // 전체 쪽 → PDF 1개
  const all = state.slides; // 전체 쪽
  let stage = '준비'; // 실패 단계 안내용
  try {
    const pages = []; // 쪽별 JPEG
    for (let i = 0; i < all.length; i++) {
      stage = '쪽 그림 만들기 ' + (i + 1) + '/' + all.length;
      toast('PDF 만드는 중 ' + (i + 1) + '/' + all.length + ' …', 4000);
      const b = await slideToPngBlob(all[i], 2400, 1791, 'image/jpeg', 0.92); // 회사 용지 비율 JPEG
      pages.push({ bytes: new Uint8Array(await b.arrayBuffer()), w: 2400, h: 1791 });
    }
    stage = 'PDF 조립';
    const pdf = pdfBuild(pages, PAGE_W * 72, PAGE_H * 72); // 1in = 72pt
    stage = '다운로드';
    downloadBlob(new Blob([pdf], { type: 'application/pdf' }), pptxFileName('all', all.map((s, i) => i + 1)).replace(/\.pptx$/, '.pdf'));
    toast('PDF를 저장했습니다 (' + all.length + '쪽)');
  } catch (e) { toast('PDF 저장 중 [' + stage + '] 단계에서 실패했습니다 : ' + (e.message || '알 수 없는 오류'), 6000); } // 한글 오류
}
async function savePngs(scope, sel) { // PNG 저장(현재/선택/전체)
  const nos = scope === 'current' ? [state.cur + 1] : (scope === 'all' ? state.slides.map((s, i) => i + 1) : sel.slice().sort((a, b) => a - b)); // 대상 쪽
  if (!nos.length) { toast('저장할 쪽을 선택해 주세요'); return; } // 선택 없음
  toast('이미지를 만드는 중입니다…', 3000); // 진행 안내
  try { // 변환
    for (const n of nos) { const b = await slideToPngBlob(state.slides[n - 1]); downloadBlob(b, APP_TITLE + '_' + weekShort(state.week) + '_S' + pad2(n) + '.png'); await new Promise(r => setTimeout(r, 350)); } // 한 장씩
    toast('PNG ' + nos.length + '장을 저장했습니다'); // 완료
  } catch (e) { toast(e.message, 5000); } // 한글 오류
}
async function copyImage() { // 현재 쪽 이미지를 클립보드로 복사
  try { // 복사
    const blob = await slideToPngBlob(curSlide(), 1530, 1142); // 가벼운 크기
    if (!navigator.clipboard || !window.ClipboardItem) throw new Error('이 브라우저는 이미지 복사를 지원하지 않습니다. PNG 저장을 이용해 주세요'); // 미지원
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); // 쓰기
    toast('현재 쪽 이미지를 복사했습니다'); // 완료
  } catch (e) { toast(e.message || '이미지 복사에 실패했습니다', 5000); } // 한글 오류
}

// ───────────────────────── 8. 관리자 모드 ─────────────────────────
function setAdmin(on) { // 관리자 도구 표시/숨김
  state.admin = on; // 상태
  $('adminGrp').hidden = !on; // 도구 묶음
  $('btnAdmin').textContent = on ? '🔓 관리자 종료' : '🔒 관리자'; // 버튼 문구
  if (!on && state.edit) toggleEdit(); // 편집 해제
  try { sessionStorage.setItem('k6admin', on ? '1' : ''); } catch (_) { } // 탭 안에서만 기억
}
function adminClick() { // 관리자 버튼
  if (state.admin) { if (anyDirty() && !confirm('시트에 저장하지 않은 수정이 있습니다. 관리자 모드를 종료할까요?')) return; setAdmin(false); toast('관리자 모드를 종료했습니다'); return; } // 종료
  openModal('<h3>관리자 모드</h3><label>비밀번호</label><input type="password" id="pw" autocomplete="off"><div class="hint" id="pwMsg"></div><div class="btns"><button id="pwCancel">취소</button><button class="pri" id="pwOk">확인</button></div>', dlg => {
    const ok = () => { if (dlg.querySelector('#pw').value === ADMIN_PASSWORD) { closeModal(); setAdmin(true); toast('관리자 모드가 켜졌습니다. 편집(E)·품목 입력·시트 저장을 사용할 수 있습니다'); } else { dlg.querySelector('#pwMsg').textContent = '비밀번호가 올바르지 않습니다'; dlg.querySelector('#pwMsg').style.color = '#E3262E'; } }; // 확인
    dlg.querySelector('#pwOk').onclick = ok; dlg.querySelector('#pwCancel').onclick = closeModal; // 버튼
    dlg.querySelector('#pw').addEventListener('keydown', e => { if (e.key === 'Enter') ok(); }); // Enter
  });
}

// ───────────────────────── 9. 편집 ─────────────────────────
function syncStored(it) { // 가격이 바뀌면 저장용 증감값도 다시 계산
  const p = num(it.price), q = num(it.prev_price); // 현재가·전주가
  if (isFinite(p) && isFinite(q)) { it.change_abs = Math.round((p - q) * 100) / 100; it.change_pct = q !== 0 ? Math.round((p - q) / q * 10000) / 100 : 0; } // 재계산
}
function rawOf(bind, el) { // 편집창에 보여줄 원문
  if (bind.kind === 'week') { const wk = state.cache[state.week]; return wk.summary_headline || plainHeadline(el); } // 요약 메시지
  const it = state.cache[state.week].items[bind.key]; // 품목
  if (bind.field === 'headline') return it.headline || plainHeadline(el); // 핵심 메시지
  const v = it[bind.field]; // 필드 값
  if (bind.list) return lines(v).map(l => '- ' + l).join('\n'); // 목록은 "- " 로 시작
  return v === undefined || v === null ? '' : String(v); // 문자열
}
function plainHeadline(el) { // 자동 핵심 메시지에서 "□ " 를 뺀 평문
  if (!el || !el.paras) return ''; // 없으면 빈 문자열
  return el.paras[0].runs.map(r => r.t).join('').replace(/^□\s*/, ''); // 연결
}
function commitEdit(bind, text) { // 편집 확정: 검증 → 자료 반영 → 합계/그래프 자동 갱신
  const wk = state.cache[state.week]; // 주차 자료
  if (bind.kind === 'week') { wk.summary_headline = text.trim(); } // 요약 메시지
  else { // 품목 필드
    const it = wk.items[bind.key]; // 품목
    if (bind.numeric) { // 숫자 칸
      const t = text.trim().replace(/,/g, ''); // 쉼표 제거
      if (t !== '' && (!/^\d+(\.\d+)?$/.test(t))) { toast('0 이상의 숫자만 입력할 수 있습니다', 3000); return false; } // 문자·음수 거부
      it[bind.field] = t === '' ? '' : parseFloat(t); // 숫자 저장
      syncStored(it); // 증감값 재계산
    } else if (bind.list) { // 목록 칸
      it[bind.field] = text.split(/\n+/).map(l => l.replace(/^\s*[-•·▪]\s*/, '').trim()).filter(Boolean).map(l => '- ' + l).join('\n'); // "- " 형식 저장
    } else { it[bind.field] = text.trim() === '(내용 없음)' ? '' : text.trim(); } // 문자열
  }
  state.dirty[state.week] = true; // 수정 표시
  fillWeekSelect(); // 주차 상자에 * 표시
  return true; // 성공
}
function editTargetOf(node) { // 실제로 편집할 DOM 요소
  if (node.classList.contains('p') || node.tagName === 'TD') return node; // 문단·셀
  return node.querySelector('.in') || node; // 요소 전체
}
function onEditClick(e) { // 편집 모드에서 점선 칸 클릭
  if (!state.edit) return; // 편집 모드 아님
  const node = e.target.closest('.editable'); // 점선 칸
  if (!node || node._editing) return; // 없거나 이미 편집 중
  const bind = node._bind; if (!bind) return; // 연결 정보 없음
  const host = node.closest('.el'); const el = host ? host._el : null; // 장면 요소
  const tgt = editTargetOf(node); // 편집 대상
  const raw = rawOf(bind, el); // 원문
  node._editing = true; tgt.textContent = raw; tgt.contentEditable = 'true'; tgt.style.whiteSpace = 'pre-wrap'; tgt.focus(); // 편집 시작
  const sel = window.getSelection(); const rg = document.createRange(); rg.selectNodeContents(tgt); sel.removeAllRanges(); sel.addRange(rg); // 전체 선택
  let done = false; // 중복 방지
  const finish = (save) => { // 편집 종료
    if (done) return; done = true; // 한 번만
    const text = tgt.innerText.replace(/​/g, ''); // 입력 내용
    tgt.contentEditable = 'false'; node._editing = false; // 편집 해제
    if (save) { const ok = commitEdit(bind, text); rebuildSlides(true); reRender(); if (ok) toast('수정 내용을 반영했습니다 (합계·그래프 자동 갱신)', 1800); } // 반영
    else { rebuildSlides(true); reRender(); } // 취소/오류 시 원래 값으로 되돌림
  };
  tgt.addEventListener('keydown', ev => { // Enter 확정 / Shift+Enter 줄바꿈 / Esc 취소
    ev.stopPropagation(); // 발표 단축키와 분리
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); finish(true); } // 확정
    else if (ev.key === 'Escape') { ev.preventDefault(); finish(false); } // 취소
  });
  tgt.addEventListener('blur', () => finish(true)); // 포커스를 잃으면 확정
}
function toggleEdit() { // 편집 모드 켜고 끄기
  if (!state.admin) { toast('관리자 모드에서만 편집할 수 있습니다'); return; } // 권한
  state.edit = !state.edit; // 토글
  reRender(); // 다시 그리기
  toast(state.edit ? '편집 모드 : 점선 칸을 눌러 수정 · Enter 확정 · Shift+Enter 줄바꿈 · Esc 취소' : '편집 모드 종료', 2800); // 안내
}

// ───────────────────────── 10. 품목 입력 창 · 새 주차 · 저장 · JSON ─────────────────────────
function dailyToText(arr) { return (arr || []).map(x => x.date + ', ' + x.price).join('\n'); } // 일간 가격 → 텍스트
function itemModal() { // 선택 품목 입력 창
  const slide = curSlide(); const key0 = slide && slide.kind === 'item' ? slide.key : ITEMS[0].key; // 기본 품목
  const wk = state.cache[state.week]; // 주차 자료
  const opts = ITEMS.map(m => '<option value="' + m.key + '"' + (m.key === key0 ? ' selected' : '') + '>' + m.code + ' · ' + m.ko + '</option>').join(''); // 품목 목록
  openModal('<h3>품목 입력 — ' + weekLabel(state.week) + '</h3><label>품목</label><select id="imKey">' + opts + '</select>' +
    '<div class="row"><div><label>현재가</label><input id="imPrice"></div><div><label>전주 가격</label><input id="imPrev"></div></div>' +
    '<label>핵심 메시지 (비우면 자동 초안)</label><input id="imHead">' +
    '<label>코멘터리</label><textarea id="imComm"></textarea><label>변동요인 (줄마다 "- ")</label><textarea id="imFact"></textarea>' +
    '<label>결론 및 전망</label><textarea id="imOut"></textarea><label>추가정보 (줄마다 "- ")</label><textarea id="imAdd"></textarea>' +
    '<label>AI 전망 (첫머리: 상승/하락/보합)</label><textarea id="imAi"></textarea>' +
    '<label>일간 가격 (줄마다 "날짜, 가격" — 예 11/2, 1412)</label><textarea id="imDaily"></textarea>' +
    '<div class="hint">저장 시 증감액·증감률은 현재가·전주 가격으로 자동 계산됩니다. 숫자 칸에는 0 이상의 숫자만 입력할 수 있습니다.</div>' +
    '<div class="btns"><button id="imCancel">취소</button><button class="pri" id="imOk">적용</button></div>', dlg => {
    const fill = () => { // 선택 품목 값 채우기
      const it = wk.items[dlg.querySelector('#imKey').value]; // 품목
      dlg.querySelector('#imPrice').value = it.price; dlg.querySelector('#imPrev').value = it.prev_price; dlg.querySelector('#imHead').value = it.headline || ''; // 숫자·메시지
      dlg.querySelector('#imComm').value = it.commentary; dlg.querySelector('#imFact').value = it.factors; dlg.querySelector('#imOut').value = it.outlook; // 글
      dlg.querySelector('#imAdd').value = it.additional_info; dlg.querySelector('#imAi').value = it.ai_outlook; dlg.querySelector('#imDaily').value = dailyToText(it.daily_prices); // 글
    };
    fill(); dlg.querySelector('#imKey').onchange = fill; dlg.querySelector('#imCancel').onclick = closeModal; // 초기 채움
    dlg.querySelector('#imOk').onclick = () => { // 적용
      const it = wk.items[dlg.querySelector('#imKey').value]; // 품목
      const price = dlg.querySelector('#imPrice').value.trim().replace(/,/g, ''), prev = dlg.querySelector('#imPrev').value.trim().replace(/,/g, ''); // 숫자 칸
      if ((price !== '' && !/^\d+(\.\d+)?$/.test(price)) || (prev !== '' && !/^\d+(\.\d+)?$/.test(prev))) { toast('0 이상의 숫자만 입력할 수 있습니다', 3000); return; } // 검증
      const daily = normalizeDaily(dlg.querySelector('#imDaily').value); // 일간 가격
      it.price = price === '' ? '' : parseFloat(price); it.prev_price = prev === '' ? '' : parseFloat(prev); // 숫자
      it.headline = dlg.querySelector('#imHead').value.trim(); it.commentary = dlg.querySelector('#imComm').value.trim(); // 글
      it.factors = dlg.querySelector('#imFact').value.trim(); it.outlook = dlg.querySelector('#imOut').value.trim(); // 글
      it.additional_info = dlg.querySelector('#imAdd').value.trim(); it.ai_outlook = dlg.querySelector('#imAi').value.trim(); it.daily_prices = daily; // 글
      syncStored(it); state.dirty[state.week] = true; closeModal(); fillWeekSelect(); rebuildSlides(true); reRender(); toast('품목 내용을 반영했습니다'); // 반영
    };
  });
}
function newWeekModal() { // 새 주차 만들기
  const last = state.weeks[state.weeks.length - 1]; const p = weekParts(last); // 마지막 주차
  const next = p ? p.y + '-W' + pad2(p.n + 1) : ''; // 다음 주차 제안
  openModal('<h3>새 주차 추가</h3><label>주차 (예 2026-W46)</label><input id="nwWeek" value="' + next + '"><div class="hint">직전 주차의 가격이 "전주 가격"으로 복사되고 나머지는 비어 있습니다. 추가 후 편집(E) 또는 품목 입력으로 채우세요.</div><div class="btns"><button id="nwCancel">취소</button><button class="pri" id="nwOk">추가</button></div>', dlg => {
    dlg.querySelector('#nwCancel').onclick = closeModal; // 취소
    dlg.querySelector('#nwOk').onclick = async () => { // 추가
      const w = dlg.querySelector('#nwWeek').value.trim().toUpperCase(); // 입력
      if (!weekParts(w)) { toast('주차 형식이 올바르지 않습니다 (예 2026-W46)'); return; } // 형식 검사
      if (state.weeks.includes(w)) { toast('이미 있는 주차입니다'); return; } // 중복
      const prevWk = state.cache[last] || await fetchWeek(last); // 직전 주차 자료
      const items = {}; ITEMS.forEach(m => { items[m.key] = { price: '', prev_price: prevWk ? prevWk.items[m.key].price : '', commentary: '', factors: '', outlook: '', additional_info: '', ai_outlook: '', daily_prices: [] }; }); // 빈 품목
      state.cache[w] = normalizeWeek({ week: w, as_of: '', source: '', items }); state.dirty[w] = true; // 등록
      state.weeks.push(w); state.weeks.sort(); closeModal(); await loadWeek(w); toast('새 주차를 추가했습니다. 내용을 입력해 주세요'); // 이동
    };
  });
}
async function saveToSheet() { // 시트 저장 (saveEntry)
  const w = state.week; const wk = state.cache[w]; // 주차 자료
  if (!wk) return; // 없음
  if (!confirm(weekLabel(w) + ' 자료를 구글 시트에 저장할까요?\n(기존 앱과 같은 시트를 공유합니다)')) return; // 확인
  ITEMS.forEach(m => syncStored(wk.items[m.key])); // 증감값 동기화
  toast('시트에 저장하는 중입니다…', 4000); // 진행 안내
  const ok = await saveWeekToSheet(w); // 저장
  if (ok) { state.dirty[w] = false; fillWeekSelect(); toast('시트에 저장했습니다'); } // 성공
  else toast('시트 저장에 실패했습니다. 네트워크·권한을 확인하거나 [JSON]으로 내려받아 보관해 주세요', 6000); // 한글 안내
}
function downloadJson() { // 현재 주차 JSON 내려받기
  const wk = state.cache[state.week]; if (!wk) return; // 없음
  ITEMS.forEach(m => syncStored(wk.items[m.key])); // 동기화
  downloadBlob(new Blob([JSON.stringify(wk, null, 2)], { type: 'application/json' }), 'w' + pad2(weekParts(state.week).n) + '-' + state.week + '.json'); // 내려받기
  toast('JSON 파일을 내려받았습니다'); // 완료
}
async function reloadFromSheet() { // 시트에서 다시 불러오기
  if (anyDirty() && !confirm('저장하지 않은 수정이 사라집니다. 시트에서 다시 불러올까요?')) return; // 확인
  state.dirty = {}; state.cache = {}; // 초기화
  await refreshFromSheet(false); await loadWeek(state.week, true); // 다시 표시
}

// ───────────────────────── 11. 초기화 ─────────────────────────
function bindButtons() { // 버튼 연결
  $('btnPrev').onclick = goPrev; $('btnNext').onclick = goNext; // 이전·다음
  $('btnPresent').onclick = togglePresent; // 발표
  $('transSel').onchange = e => { state.trans = e.target.value; }; // 전환 효과
  $('btnStep').onclick = toggleStep; // 단계 등장
  $('btnOv').onclick = toggleOverview; // 목차
  $('btnPng').onclick = () => exportDialog('png'); // PNG
  $('btnCopy').onclick = copyImage; // 이미지 복사
  $('btnPptx').onclick = () => exportDialog('pptx'); // PPT
  $('btnPdf').onclick = savePdfAll; // PDF 전체 저장
  $('weekSel').onchange = e => { state.stepNo = 0; loadWeek(e.target.value, false); }; // 주차 변경
  $('btnAdmin').onclick = adminClick; // 관리자
  $('btnEdit').onclick = toggleEdit; // 편집
  $('btnItem').onclick = itemModal; // 품목 입력
  $('btnSave').onclick = saveToSheet; // 시트 저장
  $('btnNewWeek').onclick = newWeekModal; // 새 주차
  $('btnJson').onclick = downloadJson; // JSON
  $('btnReload').onclick = reloadFromSheet; // 새로고침
  $('overview').addEventListener('click', e => { if (e.target === $('overview')) closeOverview(); }); // 목차 바깥 클릭
  $('pageLayer').addEventListener('click', onEditClick); // 편집 클릭
}
async function init() { // 앱 시작: 내장 자료로 즉시 표시 → 백그라운드로 시트 병합
  try { // 오류 안내
    drawMaster(); fitStage(); bindButtons(); initInput(); // 화면 준비
    state.weeks = Object.keys(SEED).filter(w => weekParts(w)).sort(); // 내장 주차 목록
    if (!state.weeks.length) throw new Error('내장 데이터를 찾을 수 없습니다'); // 검증
    state.week = state.weeks[state.weeks.length - 1]; // 가장 최근 주차
    fillWeekSelect(); // 주차 상자
    state.offline = true; await loadWeek(state.week, false); state.offline = false; // 내장 자료로 바로 슬라이드 화면(시트 대기 없음)
    try { if (sessionStorage.getItem('k6admin') === '1') setAdmin(true); } catch (_) { } // 같은 탭이면 관리자 유지
    refreshFromSheet(true).then(ok => { if (ok) toast('구글 시트와 연결되었습니다', 1800); }); // 백그라운드 시트 병합
  } catch (e) { console.error(e); toast(e.message || '앱을 시작하지 못했습니다', 6000); } // 한글 안내
}
window.__app = { state, init, showPage, gotoPage, goNext, goPrev, loadWeek, rebuildSlides, reRender, renderPage, buildSlides, buildPptxBlob, savePptx, slideToPngBlob, enterPresent, exitPresent, toggleStep, toggleEdit, setAdmin, commitEdit, setCover, cycleTrans, openOverview, closeOverview, onKey, measureH, itemStats }; // 검증용 공개 함수
window.addEventListener('DOMContentLoaded', init); // 문서가 준비되면 시작
