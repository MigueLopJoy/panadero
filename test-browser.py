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
 # V5: la masa madre heredada solo figura en la variante elaborada desde cero.
 mother=dict(WHITE)
 mother['elabs']=[{"id":8,"name":"Masa madre","ings":[
   {"id":80,"type":"flour","flourId":0,"pct":20},
   {"id":81,"type":"water","pct":100}]}]
 own=dict(VAR)
 own['productionMode']='base'
 js('closeVariantEditor()')
 js('(data)=>{recipes=data;activeId="semillas";resTab=0;save();renderList();showDetail();}',[mother,own])
 ok(page.locator('#d_res_nav .res-tab').all_text_contents()==['Resumen','Escaldado','Masa final'],
    'V5 desde masa base solo pestaña de elaboración exclusiva')
 page.locator('#d_res_nav .res-tab').nth(1).click()
 ok('Masa madre' not in page.locator('#d_res_body').inner_text(),
    'V5 no aparece la masa madre heredada en pestaña exclusiva')
 page.locator('#d_res_nav .res-tab').nth(2).click()
 ok('Masa madre' not in page.locator('#d_res_body').inner_text() and
    'Masa base:' in page.locator('#d_res_body').inner_text(),
    'V5 masa final desde base muestra masa preparada, no masa madre')
 js("openVariantEditor('semillas')")
 ok('Masa madre' not in page.locator('#variant_inherited').inner_text(),
    'V5 editor desde base oculta las elaboraciones heredadas')
 js("closeVariantEditor();changeVariantMode('scratch')")
 ok(page.locator('#d_res_nav .res-tab').all_text_contents()==['Resumen','Masa madre','Escaldado','Masa final'],
    'V5 desde cero recupera las elaboraciones heredadas y propias')
 page.locator('#d_res_nav .res-tab').nth(1).click()
 ok('Trigo' in page.locator('#d_res_body').inner_text(),
    'V5 detalle de masa madre se muestra desde cero')
 js("openVariantEditor('semillas')")
 ok('Masa madre' in page.locator('#variant_inherited').inner_text(),
    'V5 editor desde cero muestra herencia')
 js("closeVariantEditor();changeVariantMode('base')")
 ok(page.locator('#d_res_nav .res-tab').all_text_contents()==['Resumen','Escaldado','Masa final'] and
    page.locator('#d_res_nav .res-tab.active').inner_text()=='Resumen',
    'V5 cambiar a base elimina pestaña anterior y restablece resumen')
 # Verificar planificador y Excel sin modificar los cálculos.
 plans=js("""()=>{const mk=mode=>calculateGlobalProduction({id:'v5',name:'Prueba',
    rows:{semillas:{pieces:2,weight:1040,mode}},extras:{}});
   const b=mk('base'),s=mk('scratch');
   const be=globalProductionWorkbookData(b).find(x=>x.name==='Elaboraciones').rows;
   const se=globalProductionWorkbookData(s).find(x=>x.name==='Elaboraciones').rows;
   return {bm:b.productMass,sm:s.productMass,bp:b.purchasedMass,sp:s.purchasedMass,be,se};} """)
 ok(abs(plans['bm']-plans['sm'])<1e-5 and abs(plans['bp']-plans['sp'])<1e-5,
    'V5 conservación de cantidades al cambiar modo')
 ok(any(r[0]=='Amasado común' and r[2]=='Masa madre' for r in plans['be']) and
    not any(r[0]=='Exclusiva de variante' and r[2]=='Masa madre' for r in plans['be']),
    'V5 Excel desde base presenta masa madre solo en amasado común')
 ok(any(r[0]=='Desde cero' and r[2]=='Masa madre' for r in plans['se']),
    'V5 Excel desde cero presenta masa madre dentro de la variante')
 # Sin elaboraciones propias: solo deben quedar Resumen y Masa final en modo base.
 js("""()=>{const v=recipes.find(x=>x.id==='semillas');v.elabs=[];v.productionMode='base';
      activeId='semillas';resTab=0;renderFamilyActions();calcDetail();}""")
 ok(page.locator('#d_res_nav .res-tab').all_text_contents()==['Resumen','Masa final'],
    'V5 sin elaboraciones propias no quedan pestañas heredadas en modo base')
 js("changeVariantMode('scratch')")
 ok(page.locator('#d_res_nav .res-tab').all_text_contents()==['Resumen','Masa madre','Masa final'],
    'V5 sin elaboraciones propias recupera Masa madre desde cero')
 # ── V6: dos niveles adicionales de variantes, producción escalonada ──
 js('''()=>{
   const root={id:'trigo',name:'Masa original',flours:[{id:0,name:'Trigo',pct:100}],
      ings:[{id:0,name:'Agua',pct:65},{id:1,name:'Sal',pct:2},{id:2,name:'Levadura',pct:1}],
      elabs:[{id:'pref',name:'Poolish',ings:[{id:'pf',type:'flour',flourId:0,pct:20},{id:'pw',type:'water',pct:100}]}]};
   const variant=(id,name,parent,add,elabs=[])=>({id,name,baseId:parent,additions:add.map(([n,p],j)=>({id:'a'+j,name:n,pct:p})),elabs,pieces:1,weight:1000});
   const ch=variant('ch','Chapata','trigo',[['Agua',10]]);
   const f=variant('fo','Focaccia básica','ch',[['Aceite',5]]);
   const olives=variant('ol','Focaccia de aceitunas','fo',[['Aceitunas',10],['Agua',10]],
     [{id:'soak',name:'Escaldado de aceitunas',ings:[{id:'os',type:'other',ingId:'addition:a0',pct:10},{id:'ow',type:'water',baseId:'all',pct:100}]}]);
   const cheese=variant('qu','Focaccia de queso','fo',[['Queso',15]]);
   recipes=[root,ch,f,olives,cheese];activeId='ol';save();renderList();showDetail();
 }''')
 hierarchy=js('''()=>{
   const leaf=recipeById('ol'),c=calculateVariant(leaf,2030);
   return {depth:recipeDepth(leaf),ancestry:recipeChain(leaf).map(x=>x.name),
     parent:c.base.name,parentMass:c.baseMass,full:c.fullCalc.summaryRows,stage:c.stage,
     grams:c.flourG,depthRoot:recipeDepth(recipeById('trigo'))};}''')
 ok(hierarchy['depth']==3 and len(hierarchy['ancestry'])==4 and hierarchy['depthRoot']==0,
   'V6 permite masa original → chapata → focaccia → sabores')
 ok(abs(hierarchy['parentMass']-1830)<1e-5 and abs(hierarchy['grams']-1000)<1e-5,
   'V6 focaccia de aceitunas necesita 1830 g de focaccia básica')
 ok(abs(next(x['grams'] for x in hierarchy['full'] if x['name']=='Agua')-850)<1e-5 and
    abs(next(x['grams'] for x in hierarchy['full'] if x['name']=='Aceite')-50)<1e-5,
   'V6 herencia de agua desde chapata y aceite desde focaccia')
 ok(abs(hierarchy['stage']['elabCalcs'][0]['total']-200)<1e-5 and
   abs(hierarchy['stage']['waterRemaining'])<1e-5,
   'V6 escaldado exclusivo de la variante final sin duplicar agua')
 ok(page.locator('#d_res_nav .res-tab').all_text_contents()==['Resumen','Escaldado de aceitunas','Masa final'],
   'V6 modo masa anterior oculta las preelaboraciones heredadas')
 js("changeVariantMode('scratch')")
 ok(page.locator('#d_res_nav .res-tab').all_text_contents()==['Resumen','Poolish','Escaldado de aceitunas','Masa final'],
   'V6 desde cero recupera el poolish original y escaldado final')
 js("changeVariantMode('base');activeId='fo';renderFamilyActions()")
 ok(page.locator('#det_family_actions').get_by_text('+ Nueva variante de este pan').count()==1,
   'V6 crear derivadas desde otra variante con botón específico')
 js("openVariantEditor(null,'fo')")
 ok(page.locator('#variant_base_label').inner_text().casefold()=='focaccia básica' and
    'Aceite' in page.locator('#variant_inherited').inner_text(),
   'V6 editor hereda ingredientes de todos los ancestros')
 js('closeVariantEditor()')
 js("activeId='ol';renderFamilyActions()")
 ok(page.locator('#det_family_actions').get_by_text('+ Nueva variante de este pan').count()==0,
    'V6 se impide crear un cuarto nivel de derivación')
 rows={'ol':{'pieces':1,'weight':2030,'mode':'base'},'qu':{'pieces':1,'weight':1980,'mode':'base'},
       'fo':{'pieces':1,'weight':1830,'mode':'base'},'ch':{'pieces':1,'weight':1780,'mode':'base'}}
 plan=js('''(rows)=>{
   const p=calculateGlobalProduction({name:'Focaccias',rows,extras:{}});
   return {mass:p.productMass,bought:p.purchasedMass,
     groups:p.groups.map(g=>({name:g.base.name,required:g.required,total:g.totalBase,add:g.added,
         parent:g.parent&&g.parent.name})),ingredientRows:p.ingredientRows,
     sheets:globalProductionWorkbookData(p).map(s=>({name:s.name,rows:s.rows}))};
 }''',rows)
 groups={g['name']:g for g in plan['groups']}
 ok(abs(plan['mass']-7620)<1e-5 and abs(plan['bought']-7620)<1e-5,
    'V6 cuatro productos con un único árbol de amasados conservan 7620 g')
 ok(len(plan['groups'])==5 and abs(groups['Focaccia básica']['required']-5490)<1e-5 and
    abs(groups['Chapata']['required']-7120)<1e-5 and abs(groups['Masa original']['required']-6720)<1e-5,
    'V6 agrupa focaccia, chapata y masa original sin doble contabilidad')
 ok(abs(sum(x['grams'] for x in plan['ingredientRows'])-7620)<1e-5 and
    abs(next(x['grams'] for x in plan['ingredientRows'] if x['name']=='Aceite')-150)<1e-5,
    'V6 aprovisionamiento: aceite se añade una vez al nivel focaccia')
 workbook={s['name']:s['rows'] for s in plan['sheets']}
 ok(len(workbook)==7 and sum(1 for r in workbook['Elaboraciones'] if len(r)>2 and r[2]=='Poolish')==2 and
    sum(1 for r in workbook['Elaboraciones'] if len(r)>2 and r[2]=='Escaldado de aceitunas')==2,
    'V6 Excel documenta cada preelaboración una sola vez (filas de ingredientes)')
 groupExtra=js('''(rows)=>{const p=calculateGlobalProduction({name:'Extra focaccia',rows,
    extras:{fo:100}});return {mass:p.productMass,bought:p.purchasedMass,extra:p.extraMass,
    parts:p.groups.map(g=>[g.base.id,g.totalBase])};}''',rows)
 ok(abs(groupExtra['mass']-7620)<1e-5 and abs(groupExtra['bought']-7720)<1e-5 and
    abs(groupExtra['extra']-100)<1e-5,
    'V6 excedente en masa intermedia propaga sus necesidades a todos los ancestros')
 scratch=js('''()=>{const p=calculateGlobalProduction({name:'Desde cero',rows:{ol:{pieces:1,weight:2030,mode:'scratch'}},extras:{}});
 return {groups:p.groups.length,bought:p.purchasedMass,calc:p.items[0].calc.elabCalcs.map(e=>e.name)};}''')
 ok(scratch['groups']==0 and abs(scratch['bought']-2030)<1e-5 and scratch['calc']==['Poolish','Escaldado de aceitunas'],
    'V6 desde cero no genera amasados compartidos, sí todas las preelaboraciones')
 cycle=js('''()=>{const r=recipeById('ch'),old=r.baseId;r.baseId='ol';
 try{calculateVariant(r,1780);return 'NO ERROR'}catch(e){return e.message}finally{r.baseId=old}}''')
 ok('circular' in cycle.lower(),'V6 bloquea herencia circular')
 too_deep=js('''()=>{const a={id:'d4',name:'Nivel prohibido',baseId:'ol',additions:[],elabs:[]};
 try{calculateVariant(a,2030);return 'NO ERROR'}catch(e){return e.message}}''')
 ok('niveles' in too_deep.lower() or 'derivaciones' in too_deep.lower(),'V6 limita la profundidad')
 # Receta base cambiada -> derivaciones dinámicas.
 new_water=js('''()=>{const r=recipeById('trigo');r.ings[0].pct=67;
 const c=calculateVariant(recipeById('ol'),2050);
 r.ings[0].pct=65;
 return c.fullCalc.summaryRows.find(x=>x.name==='Agua').grams/c.flourG*100;}''')
 ok(abs(new_water-87)<1e-5,'V6 cambios en origen actualizan la hidratación de todos los descendientes')
 # Importación autocontenida y referencias remapeadas si ya existe la familia.
 importResult=js('''()=>{
    const current=recipes.slice();const format={format:'pan-agua-family-v1',recipes:JSON.parse(JSON.stringify(current))};
    const count=importRecipeData(format);return {count,added:recipes.slice(current.length).map(x=>({id:x.id,baseId:x.baseId,name:x.name}))};
 }''')
 ok(importResult['count']==5 and len(importResult['added'])==5 and
    all(x['id'] not in ['trigo','ch','fo','ol','qu'] for x in importResult['added']),
    'V6 importación de familias de cuatro generaciones remapea IDs')
 imported=js('''()=>{const v=recipes[recipes.length-2];
  const c=calculateVariant(v,2030);return {root:getFamilyRoot(v).name,depth:recipeDepth(v),weight:c.totalMass};}''')
 ok(imported['root']=='Masa original' and imported['depth']==3 and abs(imported['weight']-2030)<1e-5,
   'V6 familia importada conserva vínculos y cálculos entre generaciones')
 ok(not errors,'sin errores JavaScript de navegador: '+str(errors))
 print(f'\n{checks} COMPROBACIONES CORRECTAS')
 browser.close()
