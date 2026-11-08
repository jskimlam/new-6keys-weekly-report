# pip install playwright  (설치 명령어)
# 화면 캡처 + 콘솔 오류 확인
import asyncio, sys, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width':1500,'height':1000})
        errs=[]
        pg.on('console', lambda m: errs.append(m.type+': '+m.text) if m.type in ('error','warning') else None)
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: '+str(e)))
        await pg.goto('file:///home/claude/new6k/index.html')
        await pg.wait_for_timeout(2500)
        n = await pg.evaluate('__app.state.slides.length')
        print('slides', n)
        for i in range(n):
            await pg.evaluate(f'__app.state.trans="none";__app.gotoPage({i})')
            await pg.wait_for_timeout(300)
            await pg.screenshot(path=f'out/s{i+1}.png')
        print('\n'.join(errs[:30]))
        await b.close()
asyncio.run(main())
