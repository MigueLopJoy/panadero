const {JSDOM}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync('index.html','utf8').replace(/<script src="[^"]+"><\/script>/g,'').replace(/<link[^>]*>/g,'');
function boot(stored){
  const dom=new JSDOM(html,{runScripts:'outside-only',url:'http://localhost/'});
  const w=dom.window; w.alert=m=>{w.__alert=m};
  if(stored) w.localStorage.setItem('pan_v4',JSON.stringify(stored));
  w.eval(fs.readFileSync('scripts.js','utf8')+ '\n'+fs.readFileSync('production.js','utf8')+'\n'+fs.readFileSync('excel-export.js','utf8')+';window.__x=c=>eval(c);window.__s={get lc(){return lastCalc},set aid(v){activeId=v},load,calcDetail,showDetail,validateElabs,get recipes(){return recipes},calculateVariant,calculateProduction,calculateRecipeFormula,baseFactor,productionIngredients,productionWorkbookData,workbookParts,planFor,importRecipeData}');
  return w;
}
let fails=0;const ok=(n,c,x)=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' -> '+x));if(!c)fails++};
const near=(a,b)=>Math.abs(a-b)<0.01;
const base=()=>({id:'r1',name:'T',notes:'',pieces:1,weight:1920,
 flours:[{id:0,name:'Fuerza',pct:100}],
 ings:[{id:0,name:'Agua',pct:75},{id:1,name:'Semillas',pct:15},{id:2,name:'Sal',pct:2}],
 elabs:[{id:0,name:'Masa madre',ings:[{id:0,type:'flour',flourId:0,pct:20},{id:1,type:'water',pct:100}]}]});
function run(rec,pieces,weight){const w=boot([rec]);const S=w.__s;S.aid='r1';S.showDetail();
 if(pieces){w.document.getElementById('d_pieces').value=pieces;w.document.getElementById('d_weight').value=weight;S.calcDetail();}return {w,S,lc:S.lc,err:w.document.getElementById('d_err')}}
// 1 legacy
let t=run(base());
// flourG = 1920/(1+.92)=1000
ok('1 masa madre legacy: harina elab 200, agua 200',near(t.lc.elabCalcs[0].total,400)&&near(t.lc.deductW,200),JSON.stringify(t.lc.deductW));
ok('1 sin error',!t.err.classList.contains('show'));
// 2 semillas 100%
let r=base();r.elabs.push({id:1,name:'Remojo',ings:[{id:2,type:'other',ingId:1,pct:15},{id:3,type:'water',pct:100,baseId:2}]});
t=run(r);
const rem=t.lc.elabCalcs[1];
ok('2 remojo: 150 g semillas + 150 g agua = 300',near(rem.total,300)&&near(rem.ings[0].grams,150)&&near(rem.ings[1].grams,150),JSON.stringify(rem));
const fr=n=>t.lc.finalRows.find(x=>x.name===n);
ok('masa final: harina 800, agua 400, semillas 0, sal 20',near(fr('Fuerza').final,800)&&near(fr('Agua').final,400)&&near(fr('Semillas').final,0)&&near(fr('Sal').final,20),JSON.stringify(t.lc.finalRows));
const tot=t.lc.elabCalcs.reduce((s,e)=>s+e.total,0)+t.lc.finalRows.reduce((s,x)=>s+x.final,0);
ok('12 peso total constante 1920',near(tot,1920),tot);
ok('2 sin error',!t.err.classList.contains('show'),t.err.textContent);
// 3 150% y 200%
r=base();r.elabs=[{id:1,name:'Remojo',ings:[{id:2,type:'other',ingId:1,pct:10},{id:3,type:'water',pct:150,baseId:2}]}];
t=run(r);ok('3 150%: 100 g -> 150 g agua',near(t.lc.deductW,150),t.lc.deductW);
r.elabs[0].ings[1].pct=200;t=run(r);ok('3 200%: 200 g agua',near(t.lc.deductW,200),t.lc.deductW);
// parcial
r=base();r.elabs=[{id:1,name:'Remojo',ings:[{id:2,type:'other',ingId:1,pct:10},{id:3,type:'water',pct:100,baseId:2}]}];
t=run(r);ok('semillas parcial: 100 g al remojo, 50 g masa final',near(t.lc.finalRows.find(x=>x.name==='Semillas').final,50));
// 4,5 validaciones
const S0=boot().__s;
let rr=base();rr.elabs=[{id:1,name:'R',ings:[{id:2,type:'other',ingId:1,pct:20}]}];
ok('4 >total rechazado',!!S0.validateElabs(rr.ings,rr.elabs));
rr.elabs=[{id:1,name:'A',ings:[{id:2,type:'other',ingId:1,pct:8}]},{id:2,name:'B',ings:[{id:3,type:'other',ingId:1,pct:8}]}];
ok('5 acumulado 8+8>15 rechazado',!!S0.validateElabs(rr.ings,rr.elabs));
rr.elabs[1].ings[0].pct=7;ok('5 acumulado 8+7 aceptado',!S0.validateElabs(rr.ings,rr.elabs));
// 6 agua excedida
rr=base();rr.elabs=[{id:1,name:'M',ings:[{id:0,type:'flour',flourId:0,pct:50},{id:1,type:'water',pct:100}]},{id:2,name:'R',ings:[{id:2,type:'other',ingId:1,pct:15},{id:3,type:'water',pct:200,baseId:2}]}];
ok('6 agua 50+30=80>75 rechazada',/agua/i.test(S0.validateElabs(rr.ings,rr.elabs)||''));
rr.elabs[1].ings[1].pct=100;ok('6 agua 50+15=65<=75 ok',!S0.validateElabs(rr.ings,rr.elabs));
// 7 harina + otros en la misma elaboración sin duplicar agua
r=base();r.elabs=[{id:1,name:'Mix',ings:[{id:0,type:'flour',flourId:0,pct:10},{id:1,type:'water',pct:100},{id:2,type:'other',ingId:1,pct:10},{id:3,type:'water',pct:100,baseId:2}]}];
t=run(r);ok('7 agua = 100 + 100 = 200 (una sola vez)',near(t.lc.deductW,200)&&near(t.lc.elabCalcs[0].total,400),JSON.stringify(t.lc.elabCalcs[0]));
// 8 cambio de piezas
t=run(base(),2,1920);ok('8 doble masa => doble agua elab (400)',near(t.lc.deductW,400),t.lc.deductW);
// 10 legacy sin hyd
r=base();r.elabs.push({id:1,name:'X',ings:[{id:2,type:'other',ingId:2,pct:1}]});t=run(r);
ok('10 receta antigua (otro sin hyd) intacta',near(t.lc.elabCalcs[1].total,10)&&near(t.lc.deductW,200),JSON.stringify(t.lc.elabCalcs[1]));
// ingrediente borrado
rr=base();rr.elabs=[{id:1,name:'R',ings:[{id:2,type:'other',ingId:99,pct:5}]}];
ok('ingrediente inexistente señalado',/ya no existe/.test(S0.validateElabs(rr.ings,rr.elabs)||''));
// 9 y 11: editar/guardar/recargar
const w=boot([base()]);const D=w.document;w.__s.aid='r1';w.__x('activeId="r1";editCurrent();rAddElab();rElabs[1].name="Remojo";rAddElabIng(rElabs[1].id,"other");const e=rElabs[1].ings[0];e.ingId=1;e.pct=15;rAddElabIng(rElabs[1].id,"water");const wv=rElabs[1].ings[1];wv.baseId=e.id;wv.pct=100;rRenderElabs();saveRecipe()');
ok('guardado sin alert',!w.__alert,w.__alert);
const saved=JSON.parse(w.localStorage.getItem('pan_v4'))[0];
ok('11 persiste agua base=ingrediente (100%) y pct=15',saved.elabs[1].ings[1].baseId===saved.elabs[1].ings[0].id&&saved.elabs[1].ings[1].pct===100&&saved.elabs[1].ings[0].pct===15&&!('hyd' in saved.elabs[1].ings[0]));
const w2=boot(JSON.parse(w.localStorage.getItem('pan_v4')));w2.__s.aid='r1';w2.__s.showDetail();
ok('11 recarga: mismas cantidades',near(w2.__s.lc.elabCalcs[1].total,w2.__s.lc.flourG*0.30),w2.__s.lc.elabCalcs[1].total);
w.__x('editCurrent();rDelElab(rElabs[1].id);saveRecipe()');
const w3=boot(JSON.parse(w.localStorage.getItem('pan_v4')));w3.__s.aid='r1';w3.__s.showDetail();
ok('9 eliminar elaboración devuelve semillas a masa final (150)',near(w3.__s.lc.finalRows.find(x=>x.name==='Semillas').final,w3.__s.lc.flourG*0.15));
// guardar con exceso desde el editor
const w4=boot([base()]);w4.__x('activeId="r1";editCurrent();rAddElab();rElabs[1].name="R";rAddElabIng(rElabs[1].id,"other");rElabs[1].ings[0].ingId=1;rElabs[1].ings[0].pct=20;saveRecipe()');
ok('4 saveRecipe bloquea exceso',/representa/.test(w4.__alert||''),w4.__alert);
// agua con base eliminada
rr=base();rr.elabs=[{id:1,name:'R',ings:[{id:3,type:'water',pct:100,baseId:77}]}];
ok('agua con base inexistente señalada',/ya no está/.test(S0.validateElabs(rr.ings,rr.elabs)||''));
// agua s/ ingrediente sin tocar el modo harina: ambas bases en la misma elaboración
// migración de hyd intermedio
r=base();r.elabs=[{id:1,name:'Remojo',ings:[{id:2,type:'other',ingId:1,pct:15,hyd:100}]}];
t=run(r);ok('migración hyd->fila de agua: 150 g agua, total 1920',near(t.lc.deductW,150)&&!('hyd' in t.S.recipes[0].elabs[0].ings[0]),t.lc.deductW);

// ── TESTS V2: VARIANTES, PLANIFICADOR, PERSISTENCIA Y EXCEL ──
const white=()=>({id:'b',name:'Trigo blanco',flours:[{id:0,name:'Trigo',pct:100}],
  ings:[{id:0,name:'Agua',pct:65},{id:1,name:'Sal',pct:2},{id:2,name:'Levadura',pct:1}],elabs:[]});
const variant=(id,name,add)=>({id,name,baseId:'b',additions:add.map(([n,p],i)=>({id:'a'+i,name:n,pct:p})),pieces:1,weight:1000});
const hv=variant('h','Hogaza',[['Agua',5]]);
const cv=variant('c','Chapata',[['Agua',10]]);
const sv=variant('s','Semillas',[['Semillas',20]]);
const pv=variant('p','Pasas y nueces',[['Miel',5],['Pasas',15],['Nueces',15]]);
const vwin=boot([white(),hv,cv,sv,pv]);
const VS=vwin.__s;
let c=VS.calculateVariant(sv,1880);
ok('V2 semillas: 1680 g base + 200 g extra = 1880 g',near(c.baseMass,1680)&&near(c.added[0].grams,200)&&near(c.totalMass,1880));
ok('V2 fórmula total de semillas',near(c.fullCalc.summaryRows.find(r=>r.name==='Semillas').grams,200));
c=VS.calculateVariant(hv,1730);
ok('V2 hogaza hidratación 70%',near(c.baseMass,1680)&&near(c.added[0].grams,50)&&near(c.fullCalc.summaryRows.find(r=>r.name==='Agua').grams,700));
c=VS.calculateVariant(cv,1780);
ok('V2 chapata hidratación 75%',near(c.baseMass,1680)&&near(c.added[0].grams,100));
c=VS.calculateVariant(pv,2030);
ok('V2 pan de nueces fórmula y peso',near(c.baseMass,1680)&&near(c.added[0].grams,50)&&near(c.added[1].grams,150)&&near(c.added[2].grams,150));
VS.recipes[0].ings[0].pct=67;
c=VS.calculateVariant(hv,1750);
ok('V2 cambios en base heredados: 72% agua',near(c.fullCalc.summaryRows.find(r=>r.name==='Agua').grams/c.flourG*100,72));
VS.recipes[0].ings[0].pct=65;
const prod={extra:0,rows:{h:{enabled:true,pieces:2,weight:1000},c:{enabled:true,pieces:2,weight:700},s:{enabled:true,pieces:4,weight:1000}}};
const plan=VS.calculateProduction('b',prod);
ok('V2 plan peso final de tres variantes: 7400',near(plan.productMass,7400));
ok('V2 plan masa base requerida 6838,01',near(plan.required,6838.012931505032));
ok('V2 tres variantes y desglose individual',plan.items.length===3&&near(plan.items.find(x=>x.variant.id==='s').baseMass,3574.468085106383));
const more=VS.calculateProduction('b',{...prod,extra:500});
ok('V2 excedente sin alterar productos',near(more.totalBase,plan.required+500)&&near(more.productMass,plan.productMass));
const list=VS.productionIngredients(plan);
ok('V2 compra global sin duplicación de ingredientes',near(list.reduce((s,x)=>s+x.grams,0),plan.productMass));
const sheets=VS.productionWorkbookData(plan);
ok('V2 Excel 7 pestañas',sheets.length===7&&sheets.some(s=>s.name==='Elaboraciones')&&sheets.some(s=>s.name==='Ingredientes totales'));
const files=VS.workbookParts(sheets);
ok('V2 contenido OpenXML con fórmulas',files.some(([p,t])=>p==='xl/worksheets/sheet1.xml'&&t.includes('<f>B3*C3</f>')));
VS.recipes[0].elabs=[{id:0,name:'Poolish',ings:[{id:0,type:'flour',flourId:0,pct:20},{id:1,type:'water',pct:100}]}];
const prefer=VS.calculateProduction('b',prod);
ok('V2 prefermento agregado único al escalar',prefer.baseCalc.elabCalcs.length===1&&near(prefer.baseCalc.elabCalcs[0].total,prefer.baseCalc.flourG*.4));
ok('V2 prefermento no duplica masa',near(prefer.baseCalc.finalRows.reduce((s,x)=>s+x.final,0)+prefer.baseCalc.elabCalcs[0].total,prefer.totalBase));
const sc=VS.calculateVariant(sv,1880);
ok('V2 preelaboración heredada de variante',sc.fullCalc.elabCalcs.length===1&&near(sc.baseCalc.elabCalcs[0].total,400));
VS.recipes[0].elabs=[];
VS.recipes.find(x=>x.id==='c').additions=[{id:'w',name:'Agua',pct:-5}];
let blocked=false;try{VS.calculateVariant(VS.recipes.find(x=>x.id==='c'),1000);}catch(e){blocked=true;}
ok('V2 rechaza porcentaje negativo',blocked);
VS.recipes.find(x=>x.id==='c').additions=[{id:'w',name:'Agua',pct:10}];
const nb=JSON.parse(JSON.stringify(white()));
const imported={format:'pan-agua-family-v1',recipes:[nb,sv],production:prod};
const count=VS.importRecipeData(imported);
ok('V2 importación familiar con remapeo y sin sobrescritura',count===2&&VS.recipes.length===7&&VS.recipes[5].id!=='b'&&VS.recipes[6].baseId===VS.recipes[5].id);
let missing=false;const before=VS.recipes.length;
try{VS.importRecipeData([{...variant('missing','Huérfana',[]),baseId:'ausente'}]);}catch(e){missing=true;}
ok('V2 no importa variante huérfana',missing&&VS.recipes.length===before);
const normal=boot([white(),hv]);normal.__s.aid='b';normal.__s.showDetail();normal.__x('showDeleteConfirm();deleteCurrent()');
ok('V2 protege masa base con variantes',normal.__s.recipes.length===2&&/variante/i.test(normal.__alert||''));
const loaded=boot([white(),sv]);loaded.__s.aid='s';loaded.__s.showDetail();
loaded.__x('setResTab(1)');
ok('V2 detalle desde masa base muestra solo base y adiciones',/Masa base/.test(loaded.document.getElementById('d_res_body').textContent)&&/Semillas/.test(loaded.document.getElementById('d_res_body').textContent)&&!/Levadura/.test(loaded.document.getElementById('d_res_body').textContent));
loaded.__x("changeVariantMode('scratch');setResTab(1)");
ok('V2 modo desde cero muestra ingredientes individuales',/Levadura/.test(loaded.document.getElementById('d_res_body').textContent));
const origBase=VS.recipes[0];
const bad={...origBase,ings:[...origBase.ings],elabs:[{id:1,name:'Exceso',ings:[{id:1,type:'flour',flourId:0,pct:110}]}]};
blocked=false;try{VS.baseFactor(bad);}catch(e){blocked=true;}
ok('V2 bloquea exceso de harina en elaboraciones',blocked);

console.log(fails?fails+' FALLOS':'TODO OK');
