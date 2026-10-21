from pathlib import Path
import json, re
from playwright.sync_api import sync_playwright
root=Path(__file__).parent
html=(root/'index.html').read_text()
html=re.sub(r'<link[^>]*>', '',html)
html=html.replace('<script src="scripts.js"></script>', '<script>'+(root/'scripts.js').read_text()+'</script>')
for name in ('production.js','global-planner.js','excel-export.js'):
    html=html.replace(f'<script src="{name}"></script>','<script>'+(root/name).read_text()+'</script>')
recipes=json.loads((root/'ejemplo_focaccias_multinivel.json').read_text())['recipes']
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    context=browser.new_context(accept_downloads=True)
    page=context.new_page()
    page.set_content(html,wait_until='load')
    page.evaluate('''({data})=>{recipes=data;save();renderList();const p=activeGlobalPlan();
      p.name='Producción de focaccias multinivel';
      p.rows={'demo-aceitunas':{pieces:1,weight:2030,mode:'base'},
        'demo-queso':{pieces:1,weight:1980,mode:'base'},
        'demo-chorizo':{pieces:1,weight:2030,mode:'base'},
        'demo-focaccia':{pieces:1,weight:1830,mode:'base'},
        'demo-chapata':{pieces:1,weight:1780,mode:'base'}};
      p.extras={};saveGlobalPlans();
      const c=calculateGlobalProduction(p);
      window.__demo={mass:c.productMass,purchased:c.purchasedMass,
        groups:c.groups.map(g=>({name:g.base.name,total:g.totalBase})),
        sheets:globalProductionWorkbookData(c).map(x=>x.name)};
      renderGlobalPlanner();
    }''',{'data':recipes})
    demo=page.evaluate('window.__demo')
    print('RESULTADOS',demo)
    assert abs(demo['mass']-9650)<1e-5, demo
    assert abs(demo['purchased']-9650)<1e-5, demo
    with page.expect_download() as d:
      page.evaluate('exportGlobalProductionExcel()')
    d.value.save_as(root/'ejemplo_produccion_focaccias.xlsx')
    print('XLSX',root/'ejemplo_produccion_focaccias.xlsx',(root/'ejemplo_produccion_focaccias.xlsx').stat().st_size)
    browser.close()
