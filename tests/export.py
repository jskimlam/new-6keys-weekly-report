# pip install playwright  (설치 명령어)
# PPT·PNG 저장 함수를 실행해 파일로 받는다
import asyncio, base64
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width':1500,'height':1000})
        errs=[]
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: '+str(e)))
        pg.on('console', lambda m: errs.append(m.type+': '+m.text) if m.type=='error' and 'ERR_TUNNEL' not in m.text else None)
        await pg.goto('file:///home/claude/new6k/index.html')
        await pg.wait_for_timeout(2000)
        r = await pg.evaluate('''async()=>{ try{ const b=await __app.buildPptxBlob(__app.state.slides); const buf=new Uint8Array(await b.arrayBuffer()); let s=''; for(let i=0;i<buf.length;i+=8192) s+=String.fromCharCode.apply(null,buf.subarray(i,i+8192)); return {ok:true,b64:btoa(s)}; }catch(e){ return {ok:false,msg:e.message}; } }''')
        if r['ok']:
            open('out/all.pptx','wb').write(base64.b64decode(r['b64'])); print('pptx saved', len(r['b64'])*3//4)
        else: print('FAIL', r['msg'])
        r = await pg.evaluate('''async()=>{ try{ const b=await __app.slideToPngBlob(__app.state.slides[2]); const buf=new Uint8Array(await b.arrayBuffer()); let s=''; for(let i=0;i<buf.length;i+=8192) s+=String.fromCharCode.apply(null,buf.subarray(i,i+8192)); return {ok:true,b64:btoa(s)}; }catch(e){ return {ok:false,msg:e.message}; } }''')
        if r['ok']:
            open('out/s3_export.png','wb').write(base64.b64decode(r['b64'])); print('png saved')
        else: print('PNG FAIL', r['msg'])
        print('\n'.join(errs))
        await b.close()
asyncio.run(main())
