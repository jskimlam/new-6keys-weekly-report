# pip install playwright  (설치 명령어)
# 모든 주차를 불러 장면 생성·글 넘침 경고·PPT 생성이 되는지 확인한다
import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width':1500,'height':1000})
        errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file:///home/claude/new6k/index.html'); await pg.wait_for_timeout(1500)
        await pg.evaluate('__app.state.offline=true')
        for w in ['2026-W40','2026-W41','2026-W42','2026-W43','2026-W44','2026-W45']:
            r = await pg.evaluate('''async(w)=>{ await __app.loadWeek(w,false); const s=__app.state.slides; const warns=[]; s.forEach(x=>x.warn.forEach(t=>warns.push(t))); let ok=true,msg=''; try{ await __app.buildPptxBlob(s);}catch(e){ok=false;msg=e.message}
              return {n:s.length, warns, ok, msg, win:__app.state.win.length}}''', w)
            print(w, '쪽', r['n'], '창', r['win'], 'PPT', 'OK' if r['ok'] else r['msg'], '경고', r['warns'])
            await pg.evaluate('__app.state.trans="none";__app.gotoPage(1)'); await pg.wait_for_timeout(150)
            await pg.screenshot(path=f'out/w_{w[-3:]}.png')
        print('오류', errs)
        await b.close()
asyncio.run(main())
