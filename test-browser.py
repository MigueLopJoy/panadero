"""Pruebas de regresión en Chromium sin dependencia de jsdom (requiere Playwright)."""
from pathlib import Path
import re, json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent
html=(ROOT/'index.html').read_text()
html=re.sub(r'<link[^>]*>', '',html)
html=html.replace('</head>', '<style>'+(ROOT/'styles.css').read_text()+'</style></head>')
html=html.replace('<script src="scripts.js"></script>', '''<script>
Object.defineProperty(window,'localStorage',{value:{_d:{},getItem(k){return this._d[k]??null},setItem(k,v){this._d[k]=String(v)},removeItem(k){delete this._d[k]}}});
</script><script>'''+(ROOT/'scripts.js').read_text()+'</script>')
for filename in ('production.js','global-planner.js','excel-export.js'):
 html=html.replace(f'<script src="{filename}"></script>','<script>'+(ROOT/filename).read_text()+'</script>')

WHITE={"id":"base","name":"Masa blanca","flours":[{"id":0,"name":"Trigo","pct":100}],"ings":[{"id":0,"name":"Agua","pct":65},{"id":1,"name":"Sal","pct":2},{"id":2,"name":"Levadura","pct":1}],"elabs":[]}
VAR={"id":"semillas","baseId":"base","name":"Semillas","additions":[{"id":"s","name":"Semillas","pct":20},{"id":"a","name":"Agua","pct":20}],"elabs":[{"id":"e","name":"Escaldado","ings":[{"id":"w","type":"water","baseId":"all","pct":100},{"id":"ss","type":"other","ingId":"addition:s","pct":20}]}]}

with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={"width":390,"height":844})
 errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
 page.set_content(html,wait_until='load')
 checks=0
 def ok(cond,desc):
  global checks
  if not cond: raise AssertionError(desc)
  checks+=1;print(f'OK {checks}: {desc}')
 def js(expr,arg=None):return page.evaluate(expr,arg)
 js('window.__alerts=[]; void (window.alert=s=>window.__alerts.push(s))')
 js('(data)=>{recipes=data;save();renderList()}',[WHITE,VAR])
 # Caso de agua previa a las semillas (debe resolverse independiente del orden)
 c=js('calculateVariant(recipes[1],2080)')
 ok(abs(c['baseMass']-1680)<1e-5,'masa base: 1680 g')
 ok(abs(c['stage']['elabCalcs'][0]['total']-400)<1e-5,'escaldado de 400 g con 200 g de agua')
 ok(abs(c['stage']['waterRemaining'])<1e-5,'agua consumida del 20 % adicional')
 ok(abs(sum(r['final'] for r in c['stage']['finalRows']))<1e-5,'nada duplicado en la masa final')
 # Interfaz al añadir Agua: se pinta Agua, no selector de ingrediente
 js("openVariantEditor('semillas')")
 page.locator('#variant_elabs .eeb').first.get_by_role('button',name='+ Agua').click()
 ok(page.locator('.variant-water-row').count()==2,'botón + Agua crea fila específica')
 ok(page.locator('.variant-water-row .variant-water-label').all_text_contents()==['💧 Agua','💧 Agua'],'Agua visible como etiqueta fija')
 ok(page.locator('.variant-water-row select').first.input_value()=='all','hidratación por defecto sobre todos los ingredientes')
 ok('Agua' not in page.locator('.variant-solid-row select').first.locator('option').all_text_contents(),'Agua no aparece como sólido a incorporar')
 # Eliminar agua duplicada en prueba UI
 js("delVariantElabRow('e',variantElabs[0].ings[variantElabs[0].ings.length-1].id)")
 ok(page.locator('.variant-water-row').count()==1,'eliminar una fila no afecta las demás')
 # Cambiar base al ingrediente concreto (20 % de semillas)
 src=js("variantElabs[0].ings.find(x=>x.type==='other').id")
 page.locator('.variant-water-basis').select_option(src)
 ok(js("variantElabs[0].ings.find(x=>x.type==='water').baseId")==src,'selección específica de la base de hidratación')
 # Restaurar 'all' y persistir
 page.locator('.variant-water-basis').select_option('all')
 js('saveVariant()')
 ok(js("recipes.find(r=>r.id==='semillas').elabs[0].ings[0].baseId")=='all','guardado conserva nueva opción de hidratación')
 ok(not js('window.__alerts'),'guardado de elaboración válida no produce alertas')
 # Varios ingredientes, incluyendo harina adicional como ingrediente, unidos como base de hidratación
 val=js('''()=>{
    const v=JSON.parse(JSON.stringify(recipes.find(r=>r.id==='semillas')));
    v.additions=[{id:'s',name:'Semillas',pct:20},{id:'f',name:'Harina de fuerza',pct:10},{id:'a',name:'Agua',pct:30}];
    v.elabs=[{id:'e',name:'Escaldado de semillas y harina',ings:[
      {id:'w',type:'water',baseId:'all',pct:100},
      {id:'s1',type:'other',ingId:'addition:s',pct:20},
      {id:'f1',type:'other',ingId:'addition:f',pct:10}]}];
    const c=calculateVariant(v,2280);
    return {v,stage:c.stage,baseMass:c.baseMass,summary:c.fullCalc.summaryRows};
 }''')
 ok(abs(val['stage']['elabCalcs'][0]['total']-600)<1e-5,'100 % sobre semillas y harina juntas (300 g sólidos + 300 g agua)')
 ok(abs(val['stage']['waterInElabs']-300)<1e-5,'300 g de agua deducidos de ingredientes adicionales')
 ok(abs(val['baseMass']-1680)<1e-5,'masa base intacta con harina adicional en el escaldado')
 # Si agua < necesidad, detener cálculo
 out=js('''()=>{const v=JSON.parse(JSON.stringify(recipes.find(r=>r.id==='semillas')));
 v.additions[1].pct=19;
 try{calculateVariant(v,2070);return 'NO ERROR'}catch(e){return e.message}}
 ''')
 ok('agua' in out.lower() and '19.00%' in out,'bloqueo del exceso de agua en variante')
 # Reparto del agua entre dos pre-elaboraciones no debe exceder el total
 out=js('''()=>{const v=JSON.parse(JSON.stringify(recipes.find(r=>r.id==='semillas')));
 v.elabs=[{id:'a',name:'Escaldado A',ings:[{id:'sa',type:'other',ingId:'addition:s',pct:10},{id:'wa',type:'water',baseId:'all',pct:100}]},
          {id:'b',name:'Escaldado B',ings:[{id:'sb',type:'other',ingId:'addition:s',pct:10},{id:'wb',type:'water',baseId:'all',pct:100}]}];
 return {ok:calculateVariant(v,2080).stage.waterRemaining, over:(()=>{v.elabs[1].ings[1].pct=110;
 try{calculateVariant(v,2080);return 'NO ERROR'}catch(e){return e.message}})()};}''')
 ok(abs(out['ok'])<1e-5,'dos elaboraciones consumen exactamente el agua adicional disponible')
 ok('agua' in out['over'].lower(),'bloquea la suma de aguas superiores al total')
 # Agua sin ingredientes: no se debe convertir en ingrediente vacío
 js("openVariantEditor('semillas');addVariantElab();addVariantElabRow(variantElabs[1].id,'water')")
 ok(page.locator('.variant-water-row').count()==2,'puede pulsarse + Agua antes de definir sólidos')
 out=js('''()=>{const v=JSON.parse(JSON.stringify(recipes.find(r=>r.id==='semillas')));v.elabs=[{id:'e2',name:'Agua sin sólidos',ings:[{id:'w2',type:'water',baseId:'all',pct:100}]}];
 try{calculateVariant(v,2080);return 'NO ERROR'}catch(e){return e.message}}''')
 ok('Añade harina' in out,'agua sin referencia a sólido presenta error claro')
 # La variante anterior con referencia individual sigue siendo válida
 legacy=js('''()=>{const v=JSON.parse(JSON.stringify(recipes.find(r=>r.id==='semillas')));v.elabs[0].ings[0].baseId='ss';return calculateVariant(v,2080).stage.waterInElabs}''')
 ok(abs(legacy-200)<1e-5,'compatibilidad con bases individuales de V3')
 # Receta independiente conserva agua respecto de harina, incluso en orden invertido
 normal=js('''()=>{const r=JSON.parse(JSON.stringify(recipes[0]));r.elabs=[{id:0,name:'Poolish',ings:[{id:1,type:'water',pct:100},{id:2,type:'flour',flourId:0,pct:20}]}];return calculateRecipeFormula(r,1680)}''')
 ok(abs(normal['deductW']-200)<1e-5,'receta clásica: 100 % agua sobre 20 % harina en elaboración')
 # Nuevo modo también funciona con receta independiente
 both=js('''()=>{const r=JSON.parse(JSON.stringify(recipes[0]));r.ings.push({id:4,name:'Semillas',pct:10});r.ings[0].pct=95;
 r.elabs=[{id:3,name:'Mixto',ings:[{id:1,type:'water',pct:100,baseId:'all'},{id:2,type:'flour',flourId:0,pct:20},{id:3,type:'other',ingId:4,pct:10}]}];return calculateRecipeFormula(r,2080)}''')
 ok(abs(both['deductW']-300)<1e-5,'receta clásica: nueva opción sobre harina y semillas')
 # Migración de registros V3 donde el usuario añadió agua mediante + Ingrediente.
 legacyRow=js('''()=>{
   const v=JSON.parse(JSON.stringify(recipes.find(r=>r.id==='semillas')));
   v.elabs[0].ings=[{id:'ss',type:'other',ingId:'addition:s',pct:20},
                    {id:'old-water',type:'other',ingId:'addition:a',pct:20}];
   const before=calculateVariant(v,2080);
   const didChange=migrateVariantWaterRows(v);
   const after=calculateVariant(v,2080);
   return {changed:didChange,before:before.stage.elabCalcs[0].total,after:after.stage.elabCalcs[0].total,
     row:v.elabs[0].ings[1],stage:after.stage};}''')
 ok(legacyRow['changed'] and legacyRow['row']['type']=='water' and legacyRow['row']['baseId']=='all',
    'migración automática de agua guardada como otro ingrediente en V3')
 ok(abs(legacyRow['before']-legacyRow['after'])<1e-5 and abs(legacyRow['after']-400)<1e-5,
    'migración mantiene exactamente los gramos originales de agua y escaldado')
 # Si hay varias variantes antiguas, se migran todas.
 out=js('''()=>{const records=[];
   for(let i=0;i<2;i++)records.push({id:'old'+i,baseId:'base',name:'Vieja '+i,
     additions:[{id:'s',name:'Semillas',pct:20},{id:'w',name:'Agua',pct:20}],
     elabs:[{id:'e',name:'Escaldado',ings:[{id:'ss',type:'other',ingId:'addition:s',pct:20},{id:'ww',type:'other',ingId:'addition:w',pct:20}]}]});
   recipes.push(...records);migrateStoredVariantWaterRows();
   return records.map(x=>x.elabs[0].ings[1].type)}''')
 ok(out==['water','water'],'migración recorre todas las variantes guardadas')
 # Planificador y Excel sin cambios en el escaldado propio
 output=js('''()=>{const plan={id:'g',name:'Producción',rows:{semillas:{pieces:2,weight:1040,mode:'base'}},extras:{base:0}};
 const c=calculateGlobalProduction(plan),s=globalProductionWorkbookData(c);
 return {mass:c.productMass,elab:s.find(x=>x.name==='Elaboraciones').rows.some(row=>row.includes('Escaldado')),count:s.length};}''')
 ok(output['mass']==2080 and output['elab'] and output['count']==7,'plan y Excel incluyen el escaldado y siete hojas')
 ok(not errors,'sin errores JavaScript de navegador: '+str(errors))
 print(f'\n{checks} COMPROBACIONES CORRECTAS')
 browser.close()
