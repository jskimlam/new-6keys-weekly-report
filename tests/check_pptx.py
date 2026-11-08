# pip install python-pptx lxml  (설치 명령어)
# 저장된 .pptx 를 열어 개체 수·마스터·차트 XML 순서를 검증한다
import sys, zipfile, re
from pptx import Presentation
from pptx.util import Emu
from lxml import etree
f = sys.argv[1]
prs = Presentation(f)
print('슬라이드 크기 cm: %.3f x %.3f' % (prs.slide_width/360000, prs.slide_height/360000))
for i, s in enumerate(prs.slides, 1):
    cnt = {'text':0,'shape':0,'table':0,'chart':0,'pic':0,'line':0}
    for sh in s.shapes:
        t = sh.shape_type
        if sh.has_chart if hasattr(sh,'has_chart') else False: cnt['chart']+=1
        elif sh.has_table if hasattr(sh,'has_table') else False: cnt['table']+=1
        elif t == 13: cnt['pic']+=1
        elif t == 9 or sh.element.tag.endswith('cxnSp'): cnt['line']+=1
        elif sh.has_text_frame and t == 17: cnt['text']+=1
        else: cnt['shape']+=1
    print('S%02d'%i, cnt, '총', len(s.shapes))
m = prs.slide_master
pics = [sh for sh in m.shapes if sh.shape_type == 13]
lines = [sh for sh in m.shapes if sh.element.tag.endswith('cxnSp')]
print('마스터: 그림', len(pics), '선', len(lines))
z = zipfile.ZipFile(f)
# 차트 XML 요소 순서 검증(CT_Ser 순서)
order_bar = ['idx','order','tx','spPr','invertIfNegative','pictureOptions','dPt','dLbls','trendline','errBars','cat','val','shape','extLst']
order_line = ['idx','order','tx','spPr','marker','dPt','dLbls','trendline','errBars','cat','val','smooth','extLst']
ns = {'c':'http://schemas.openxmlformats.org/drawingml/2006/chart'}
viol = 0
for n in sorted(z.namelist()):
    if re.match(r'ppt/charts/chart\d+\.xml', n):
        root = etree.fromstring(z.read(n))
        for ch in root.iter('{%s}barChart' % ns['c'], '{%s}lineChart' % ns['c']):
            order = order_bar if ch.tag.endswith('barChart') else order_line
            for ser in ch.findall('c:ser', ns):
                idxs = [order.index(etree.QName(e).localname) for e in ser if etree.QName(e).localname in order]
                if idxs != sorted(idxs): viol += 1; print('순서 위반', n, [etree.QName(e).localname for e in ser])
        kinds = [etree.QName(e).localname for e in root.find('.//c:plotArea', ns) if etree.QName(e).localname.endswith('Chart')]
        print(n, kinds, 'ser수', len(root.findall('.//c:ser', ns)), 'dPt', len(root.findall('.//c:dPt', ns)), 'marker흰색', len(re.findall(r'<c:marker>.*?FFFFFF.*?</c:marker>', z.read(n).decode(), re.S)))
print('차트 XML 순서 위반:', viol)
xl = [n for n in z.namelist() if n.endswith('.xlsx')]
print('내장 엑셀', len(xl))
import io
for n in xl[:3]:
    zz = zipfile.ZipFile(io.BytesIO(z.read(n)))
    sx = zz.read('xl/worksheets/sheet1.xml').decode()
    print(n, '빈 <v> :', len(re.findall(r'<v>\s*</v>', sx)), '/ 열림 OK')
print('폰트 목록:', sorted(set(re.findall(r'typeface="([^"]+)"', ''.join(z.read(n).decode('utf8','ignore') for n in z.namelist() if re.match(r'ppt/slides/slide\d+\.xml', n))))))
