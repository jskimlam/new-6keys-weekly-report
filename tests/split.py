# pip install playwright  (설치 명령어)
# 시트에서 "추가정보"에 섞여 들어온 데일리가격·ai 전망을 분리하는 로직 검증
import asyncio, json
from playwright.async_api import async_playwright
CASES = {
 'BPA_섞임': {'additional_info': '- CFR China 평가범위 $1,520-1,620/mt\n- 동중국 가격 상승\n- 데일리가격\n- 일별 가격 자료 없음.\n- ai 전망\n- 공급 제약과 원료 비용은 오퍼를 지지하겠지만 고가 수용이 약해 한계가 있다. 4분기에는 보합 또는 조정 위험이 커질 전망이다.', 'ai_outlook': '', 'daily_prices': []},
 'WTI_일별포함': {'additional_info': '추가 정보\n- 재고 감소\n\n데일리가격\n9/7: $80.1\n9/8: $81.5\n9/9, 82.2\n\nai 전망\n상승 전망. 공급 불안이 지속된다.', 'ai_outlook': '', 'daily_prices': []},
 'AI칸있음': {'additional_info': '- 재고 감소\n- ai 전망\n- 섞인 문장', 'ai_outlook': '하락 전망. 원래 값', 'daily_prices': [['9/7', 80]]},
 '정상': {'additional_info': '- 재고 감소\n- 공급 제약', 'ai_outlook': '보합 전망. 정상', 'daily_prices': []},
}
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        pg = await b.new_page()
        await pg.goto('file:///home/claude/new6k/index.html'); await pg.wait_for_timeout(1500)
        res = await pg.evaluate('''(cases)=>{const o={};for(const k in cases){const w=normalizeWeek({week:'2026-W37',items:{BPA:cases[k]}});o[k]=w.items.BPA;}return o;}''', CASES)
        for k,v in res.items():
            print('==',k); print(' 추가정보:',repr(v['additional_info'])); print(' AI:',repr(v['ai_outlook'])); print(' 일별:',v['daily_prices'])
        ok = ('데일리가격' not in res['BPA_섞임']['additional_info'] and 'ai 전망' not in res['BPA_섞임']['additional_info']
              and res['BPA_섞임']['ai_outlook'].startswith('공급 제약') and res['BPA_섞임']['daily_prices']==[]
              and len(res['WTI_일별포함']['daily_prices'])==3 and res['WTI_일별포함']['ai_outlook'].startswith('상승 전망')
              and res['AI칸있음']['ai_outlook']=='하락 전망. 원래 값' and 'ai 전망' not in res['AI칸있음']['additional_info']
              and res['정상']['additional_info']=='- 재고 감소\n- 공급 제약' and res['정상']['ai_outlook']=='보합 전망. 정상')
        print('PASS' if ok else 'FAIL')
        await b.close()
asyncio.run(main())
