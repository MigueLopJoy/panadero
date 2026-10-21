"""Regresión V8: guía por familias, masa final con descuentos, preelaboraciones y accesibilidad."""
from pathlib import Path
import re, json, math
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).parent
html=(ROOT/'index.html').read_text()
html=re.sub(r'<link[^>]*>','',html)
html=html.replace('</head>','<style>'+(ROOT/'styles.css').read_text()+'</style></head>')
for file in ('scripts.js','production.js','global-planner.js','planner-ui.js','excel-export.js'):
    html=html.replace(f'<script src="{file}"></script>', '<script>'+(ROOT/file).read_text()+'</script>')
base=json.loads((ROOT/'ejemplo_focaccias_multinivel.json').read_text())['recipes']
rye={'id':'centeno','name':'Pan de centeno','flours':[{'id':0,'name':'Harina centeno','pct':100}],
     'ings':[{'id':0,'name':'Agua','pct':70},{'id':1,'name':'Sal','pct':2}],
     'elabs':[{'id':'rye-mm','name':'Masa madre de centeno','ings':[{'id':'f','type':'flour','flourId':0,'pct':30},
       {'id':'w','type':'water','pct':100}]}]}
checks=0
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(html,wait_until='load')
 def js(x,arg=None):return page.evaluate(x,arg)
 def ok(yes,desc):
  global checks
  assert yes,desc
  checks+=1
  print('PASS',checks,desc)
 js('(data)=>{recipes=data;renderList()}',base+[rye]);
 plan={'id':'v8','name':'Producción de prueba','rows':{
   'demo-chapata':{'pieces':2,'weight':890,'mode':'base'},
   'demo-aceitunas':{'pieces':1,'weight':2030,'mode':'base'},
   'demo-queso':{'pieces':2,'weight':990,'mode':'base'},
   'centeno':{'pieces':1,'weight':1720,'mode':'scratch'},
   'demo-chorizo':{'pieces':1,'weight':2030,'mode':'scratch'}},
   'extras':{'demo-trigo':100,'demo-focaccia':75}}
 js('''(plan)=>{globalPlans={v8:plan};currentGlobalPlanId='v8';switchTab('produccion');}''',plan)
 d=js('''()=>{const c=calculateGlobalProduction(activeGlobalPlan());const fam=buildPlanPresentation(c);return {
   fam:fam.map(f=>({name:f.name,stages:f.stages.map(s=>({name:s.name,id:s.id,grams:s.grams,
     elabs:s.elabs.map(e=>e.name),actual:s.inherited.reduce((n,r)=>n+r.grams,0)+s.pending.reduce((n,r)=>n+r.final,0)+s.elabs.reduce((n,e)=>n+e.total,0),
     allocations:s.allocations.reduce((n,r)=>n+r.grams,0)}))})),productMass:c.productMass,
   bought:c.purchasedMass,extra:c.extraMass};}''')
 ok(len(d['fam'])==2,'Dos familias: chapatas/focaccias y centeno')
 ok(page.locator('.plan-family-tab').count()==3,'Pestañas de dos familias y compras globales')
 ok(page.locator('.plan-stage-tab').count()==6,'Masa original, chapata, focaccia, aceitunas, queso y chorizo desde cero en familia blanca')
 ok(page.locator('#global_plan_results .plan-stage-header').count()==1,'Solo una etapa visible, no lista vertical interminable')
 ok(page.locator('.plan-pane-tab').count()==4,'Cuatro vistas por etapa')
 ok(all(abs(s['actual']-s['grams'])<1e-5 and abs(s['allocations']-s['grams'])<1e-5
         for f in d['fam'] for s in f['stages']), 'Conservación y reparto exactos en todas las etapas')
 ok(abs(d['bought']-(d['productMass']+d['extra']))<1e-5,'Producción y excedentes coinciden con las compras')
 root=d['fam'][0]['stages'][0]
 ok(root['elabs']==['Poolish'],'La masa original tiene solo su Poolish')
 ok('Elaboración previa: Poolish' in page.locator('.plan-step-content').inner_text(),'Masa final original incorpora el Poolish como preparado')
 ok('empleado en elaboraciones' in page.locator('.plan-step-content').inner_text(),'Descuentos visibles de harina y agua del Poolish')
 page.get_by_role('tab',name='Elaboraciones',exact=True).click()
 ok('Poolish' in page.locator('.plan-step-content').inner_text() and 'harina' in page.locator('.plan-step-content').inner_text().lower(), 'Desglose de ingredientes de Poolish')
 ok(page.locator('.plan-elab-card').count()==1,'Cada elaboración previa tiene su tarjeta')
 page.get_by_role('tab',name='Ingredientes',exact=True).click()
 ok('Harina de trigo' in page.locator('.plan-step-content').inner_text() and 'Levadura' in page.locator('.plan-step-content').inner_text(), 'Resumen de ingredientes completos de la masa original')
 page.get_by_role('tab',name='Reparto',exact=True).click()
 ok('Masa de chapata' in page.locator('.plan-step-content').inner_text() and 'Masa sobrante' in page.locator('.plan-step-content').inner_text(), 'Distribución visible a chapata y excedente')
 page.locator('.plan-stage-tab[data-id="stage:demo-aceitunas"]').click()
 ok('Masa anterior: Focaccia básica' in page.locator('.plan-step-content').inner_text(),'Variante usa masa anterior, no ingredientes de origen duplicados')
 ok('Elaboración previa: Escaldado de aceitunas' in page.locator('.plan-step-content').inner_text(),'Masa final de aceitunas incorpora el escaldado propio')
 ok('Poolish' not in page.locator('.plan-step-content').inner_text(), 'Poolish heredado no se vuelve a pesar en aceitunas')
 page.get_by_role('tab',name='Elaboraciones',exact=True).click()
 ok('Escaldado de aceitunas' in page.locator('.plan-step-content').inner_text() and 'Poolish' not in page.locator('.plan-step-content').inner_text(),'Solo escaldado exclusivo de la variante en elaboración compartida')
 page.get_by_role('tab',name='Ingredientes',exact=True).click()
 ok('Consultar la fórmula completa' in page.locator('.plan-step-content').inner_text(),'Composición global disponible sin confundir con pesadas nuevas')
 page.locator('.plan-formula-details summary').click()
 ok('Harina de trigo' in page.locator('.plan-formula-details').inner_text(),'Fórmula total desplegable de la variante')
 page.locator('.plan-stage-tab[data-id="scratch:demo-chorizo"]').click()
 page.get_by_role('tab',name='Elaboraciones',exact=True).click()
 ok('Poolish' in page.locator('.plan-step-content').inner_text(),'Desde cero presenta elaboraciones heredadas')
 page.locator('.plan-family-tab[data-id="centeno"]').click()
 ok(page.locator('.plan-stage-tab').count()==1 and 'centeno' in page.locator('.plan-stage-header').inner_text().lower(), 'Cambio de familia muestra solo el centeno')
 ok('Masa madre de centeno' in page.locator('.plan-step-content').inner_text(), 'Masa final de centeno incorpora su masa madre')
 page.get_by_role('tab',name='Elaboraciones',exact=True).click()
 ok('Masa madre de centeno' in page.locator('.plan-step-content').inner_text(),'Ficha independiente con su masa madre')
 page.get_by_role('tab',name='Ingredientes totales').click()
 ok(page.locator('.plan-stage-tab').count()==0,'Compras consolidadas en una vista propia')
 ok('Harina de trigo' in page.locator('.plan-display-panel').inner_text() and 'Harina centeno' in page.locator('.plan-display-panel').inner_text(), 'Compras unificadas sin mezclar procesos')
 x=js('''()=>{const c=calculateGlobalProduction(activeGlobalPlan());return {sheets:globalProductionWorkbookData(c).map(s=>s.name),
   elaborations:globalProductionWorkbookData(c).find(s=>s.name==='Elaboraciones').rows.filter(r=>r.includes('Poolish')),
   planJson:JSON.stringify(activeGlobalPlan())}}''')
 ok(len(x['sheets'])==7,'Exportación Excel conserva siete hojas')
 ok(len(x['elaborations'])>=2,'Exportación Excel conserva poolish')
 ok(json.loads(x['planJson'])==plan,'La navegación no modifica ni los planes ni cantidades persistidas')
 # Los planes solamente desde cero no necesitan crear masas compartidas ficticias.
 only=js("""()=>{const c=calculateGlobalProduction({id:'solo',rows:{'demo-chorizo':{pieces:1,weight:2030,mode:'scratch'}},extras:{}});
 const model=buildPlanPresentation(c);return {groups:c.groups.length,stages:model[0].stages.map(x=>({kind:x.kind,elabs:x.elabs.map(e=>e.name)}))};}""")
 ok(only['groups']==0 and only['stages'][0]['kind']=='scratch','Solo desde cero: sin grupos compartidos ficticios')
 ok('Poolish' in only['stages'][0]['elabs'],'Desde cero exclusivamente: muestra el Poolish heredado')
 single=js("""()=>{const c=calculateGlobalProduction({id:'single',rows:{'centeno':{pieces:1,weight:1720,mode:'scratch'}},extras:{}});
 const model=buildPlanPresentation(c);return {stages:model.length&&model[0].stages.length,grams:model[0].stages[0].grams,
 allocations:model[0].stages[0].allocations.reduce((s,x)=>s+x.grams,0)};}""")
 ok(single['stages']==1 and abs(single['grams']-single['allocations'])<1e-5,'Pan independiente: etapa y reparto completos')
 noelab=js("""()=>{const root=recipeById('demo-trigo'),before=root.elabs;root.elabs=[];
 try{const c=calculateGlobalProduction({rows:{'demo-trigo':{pieces:1,weight:1680}},extras:{}});
 return buildPlanPresentation(c)[0].stages[0].elabs.length===0;}
 finally{root.elabs=before;}}""")
 ok(noelab,'Masa original sin preelaboraciones no genera paneles ficticios')
 # Configuración plegable sin perder los campos ni el plan.
 page.evaluate('openPlanGuide()')
 ok(not page.locator('#global_plan_editor').evaluate('(e)=>e.open'),'Ver guía repliega los ajustes')
 page.locator('#global_plan_editor summary').click()
 ok(page.locator('#global_plan_editor').evaluate('(e)=>e.open') and page.locator('#global_plan_rows .plan-item').count()==5,
    'La configuración se recupera íntegra al desplegarla')
 # Exportar un libro Excel real mediante el navegador.
 with page.expect_download() as info:
  page.locator('#global_plan_excel').click()
 down=info.value
 down.save_as(str(ROOT/'ejemplo_plan_v8.xlsx'))
 ok((ROOT/'ejemplo_plan_v8.xlsx').stat().st_size>1000,'Descarga real del libro Excel desde Chromium')
 ok(not errors,'Sin excepciones JS: '+str(errors))
 page.get_by_role('tab',name='Masa blanca para chapatas').click()
 page.locator('.plan-stage-tab[data-id="stage:demo-aceitunas"]').click()
 page.evaluate("document.querySelector('.nav').style.display='none'")
 page.locator('#global_plan_results').screenshot(path=str(ROOT/'vista_guia_produccion_v8.png'))
 page.locator('.plan-stage-tab[data-id="stage:demo-trigo"]').click()
 page.locator('#global_plan_results').screenshot(path=str(ROOT/'vista_masa_base_v8.png'))
 print(f'\n{checks} PRUEBAS V8 PASADAS')
 browser.close()
