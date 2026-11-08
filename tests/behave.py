# pip install playwright  (설치 명령어)
# 발표·전환·단계·키·관리자·편집·PPT 반영을 자동 입력으로 확인한다
import asyncio, base64, zipfile, io, re
from playwright.async_api import async_playwright
res = []
def ok(name, cond, extra=''):
    res.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ')+name, extra)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width':1500,'height':1000})
        pg = await ctx.new_page()
        errs=[]
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: '+str(e)))
        pg.on('console', lambda m: errs.append(m.type+': '+m.text) if m.type=='error' and 'ERR_' not in m.text and 'Failed to load' not in m.text else None)
        await pg.goto('file:///home/claude/new6k/index.html'); await pg.wait_for_timeout(1500)
        S = lambda e: pg.evaluate(e)
        ok('시작 즉시 슬라이드 7장', await S('__app.state.slides.length')==7)
        ok('관리자 도구 처음에는 숨김', await S("document.getElementById('adminGrp').hidden"))
        # 발표
        await pg.click('#btnPresent'); await pg.wait_for_timeout(500)
        ok('발표 모드(막대 숨김)', await S("document.body.classList.contains('present') && getComputedStyle(document.getElementById('bar')).display==='none'"))
        fs = await S('!!document.fullscreenElement'); print('  전체화면 API 진입:', fs)
        # 전환 4종
        for tr in ['fade','push','zoom','none']:
            await S(f"__app.state.trans='{tr}'"); c0 = await S('__app.state.cur')
            await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(150)
            mid = await S("document.querySelectorAll('#pageLayer .page').length")
            await pg.wait_for_timeout(750)
            n = await S("document.querySelectorAll('#pageLayer .page').length")
            ok(f'전환 {tr}: 이동·잔여쪽 정리', await S('__app.state.cur')==c0+1 and n==1, f'(전환중 {mid}장)')
        ok('마스터는 전환과 무관하게 고정(masterLayer 1개)', await S("document.getElementById('masterLayer').children.length")==1)
        await pg.keyboard.press('Home'); await pg.wait_for_timeout(100); ok('Home', await S('__app.state.cur')==0)
        await pg.keyboard.press('End'); await pg.wait_for_timeout(100); ok('End', await S('__app.state.cur')==6)
        await pg.keyboard.press('3'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300); ok('숫자+Enter → 3쪽', await S('__app.state.cur')==2)
        await pg.keyboard.press('PageUp'); await pg.wait_for_timeout(100); ok('PageUp 이전', await S('__app.state.cur')==1)
        await pg.keyboard.press('Space'); await pg.wait_for_timeout(100); ok('Space 다음', await S('__app.state.cur')==2)
        await pg.keyboard.press('Backspace'); await pg.wait_for_timeout(100); ok('Backspace 이전', await S('__app.state.cur')==1)
        # 클릭 이동(왼쪽 20% 이전, 그 외 다음)
        await pg.mouse.click(1400, 500); await pg.wait_for_timeout(100); ok('오른쪽 클릭 영역 → 다음', await S('__app.state.cur')==2)
        await pg.mouse.click(60, 500); await pg.wait_for_timeout(100); ok('왼쪽 20% 클릭 → 이전', await S('__app.state.cur')==1)
        await pg.mouse.click(1400, 500, button='right'); await pg.wait_for_timeout(100); ok('오른쪽 버튼 → 이전', await S('__app.state.cur')==0)
        # 검은/흰 화면, 레이저, 목차
        await pg.keyboard.press('b'); ok('B 검은 화면', await S("getComputedStyle(document.getElementById('cover')).display==='block' && getComputedStyle(document.getElementById('cover')).backgroundColor==='rgb(0, 0, 0)'"))
        await pg.keyboard.press('b'); ok('B 다시 → 해제', await S("getComputedStyle(document.getElementById('cover')).display==='none'"))
        await pg.keyboard.press('w'); ok('W 흰 화면', await S("getComputedStyle(document.getElementById('cover')).backgroundColor==='rgb(255, 255, 255)' && getComputedStyle(document.getElementById('cover')).display==='block'"))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(100)
        await pg.keyboard.press('l'); await pg.mouse.move(500,400); ok('L 레이저 표시', await S("document.getElementById('laser').style.display==='block'"))
        await pg.keyboard.press('l')
        await pg.keyboard.press('o'); await pg.wait_for_timeout(300); ok('O 목차(7장 카드)', await S("document.querySelectorAll('#overview .ovCard').length")==7)
        await pg.screenshot(path='out/overview.png')
        await pg.keyboard.press('o')
        # 단계 등장
        await pg.keyboard.press('Home'); await pg.keyboard.press('2'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(200)
        await pg.keyboard.press('s'); await pg.wait_for_timeout(200)
        hid = await S("document.querySelectorAll('#pageLayer .step-hide').length"); ok('S 단계 등장 켬 → 요소 숨김', hid>20, f'(숨김 {hid})')
        st = await S('__app.state.slides[__app.state.cur].steps'); seen=[]
        for i in range(st):
            await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(60); seen.append(await S("document.querySelectorAll('#pageLayer .step-hide').length"))
        ok('클릭마다 하나씩 나타남(단조 감소)', seen==sorted(seen,reverse=True) and seen[-1]==0, str(seen))
        c = await S('__app.state.cur'); await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(700)
        ok('마지막 단계 뒤 다음 쪽', await S('__app.state.cur')==c+1)
        await pg.keyboard.press('ArrowLeft'); await pg.wait_for_timeout(700); ok('이전 쪽으로 돌아가면 전부 보임', await S("document.querySelectorAll('#pageLayer .step-hide').length")==0)
        await pg.keyboard.press('ArrowLeft'); await pg.wait_for_timeout(100); ok('이전: 단계부터 되돌림', await S("document.querySelectorAll('#pageLayer .step-hide').length")>0)
        await pg.keyboard.press('s'); await pg.wait_for_timeout(200)
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        ok('Esc 발표 종료', not await S("document.body.classList.contains('present')"))
        # 관리자
        await pg.click('#btnAdmin'); await pg.fill('#pw','000000'); await pg.press('#pw','Enter'); await pg.wait_for_timeout(200)
        ok('틀린 비밀번호 → 한글 안내', '올바르지 않습니다' in await S("document.querySelector('#pwMsg').textContent"))
        await pg.fill('#pw','678123'); await pg.press('#pw','Enter'); await pg.wait_for_timeout(300)
        ok('비밀번호 678123 → 관리자 도구 표시', not await S("document.getElementById('adminGrp').hidden"))
        # 편집: 2쪽(WTI) 코멘터리
        await pg.evaluate('__app.state.trans="none";__app.gotoPage(1)'); await pg.wait_for_timeout(200)
        await pg.click('#btnEdit'); await pg.wait_for_timeout(300)
        ok('편집 모드 점선 칸', await S("document.querySelectorAll('#pageLayer .editable').length")>5)
        # 숫자 칸: 문자 입력 거부
        await pg.evaluate("document.querySelectorAll('#pageLayer .p.editable')[0].click()")
        kp = pg.locator('#pageLayer .p.editable').first
        await kp.click(); await pg.keyboard.type('abc'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        t = await S("document.getElementById('toast').textContent")
        ok('숫자 칸에 문자 → 안내 + 원래 값', '0 이상의 숫자만' in t and await S("__app.state.cache['2026-W45'].items.WTI.price")==90.83, t)
        await pg.click('#btnEdit'); await pg.click('#btnEdit'); await pg.wait_for_timeout(200)
        kp = pg.locator('#pageLayer .p.editable').first
        await kp.click(); await pg.keyboard.type('95.5'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        ok('숫자 수정 → 가격 반영', await S("__app.state.cache['2026-W45'].items.WTI.price")==95.5)
        ok('전주 대비 자동 갱신(95.5-104.12=-8.62)', await S("__app.state.slides[1].els.some(e=>e.paras&&e.paras.some(p=>p.runs.some(r=>r.t.includes('8.62'))))"))
        ok('요약쪽 가격도 갱신', await S("__app.state.slides[0].els.find(e=>e.t==='table').rows[1][1].paras[0].runs[0].t")=='95.50')
        # 텍스트 수정
        await pg.evaluate('__app.gotoPage(1)'); await pg.wait_for_timeout(200)
        el = pg.locator('#pageLayer .el.editable').filter(has_text='코멘터리').first
        n = await pg.locator('#pageLayer .el.editable').count(); print('  편집 가능 요소', n)
        # 코멘터리 본문: bind.field=commentary 인 요소
        idx = await S("Array.from(document.querySelectorAll('#pageLayer .el.editable')).findIndex(d=>d._bind&&d._bind.field==='commentary')")
        box = pg.locator('#pageLayer .el.editable').nth(idx)
        await box.click(); await pg.keyboard.press('Control+A'); await pg.keyboard.type('테스트 코멘터리 수정문'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        ok('문구 수정 반영', await S("__app.state.cache['2026-W45'].items.WTI.commentary")=='테스트 코멘터리 수정문')
        # PPT 반영
        r = await pg.evaluate('''async()=>{const b=await __app.buildPptxBlob(__app.state.slides);const u=new Uint8Array(await b.arrayBuffer());let s='';for(let i=0;i<u.length;i+=8192)s+=String.fromCharCode.apply(null,u.subarray(i,i+8192));return btoa(s)}''')
        z = zipfile.ZipFile(io.BytesIO(base64.b64decode(r)))
        allx = ''.join(z.read(n).decode('utf8') for n in z.namelist() if re.match(r'ppt/slides/slide\d+\.xml', n))
        ok('PPT에 수정 문구 반영', '테스트 코멘터리 수정문' in allx)
        ok('PPT에 수정 가격(95.50) 반영', '95.50' in allx)
        # 개별 파일 / 선택 / 파일명
        names = await pg.evaluate("[__app.state.week]")
        print('콘솔 오류:', errs)
        await pg.screenshot(path='out/after_edit.png')
        await b.close()
    print('\n통과 %d / %d' % (sum(1 for _,c in res if c), len(res)))
asyncio.run(main())
