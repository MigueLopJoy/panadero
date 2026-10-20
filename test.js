const {JSDOM}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync('index.html','utf8').replace(/<script src="scripts.js"><\/script>/,'').replace(/<link[^>]*>/g,'');
function boot(stored){
  const dom=new JSDOM(html,{runScripts:'outside-only',url:'http://localhost/'});
  const w=dom.window; w.alert=m=>{w.__alert=m};
  if(stored) w.localStorage.setItem('pan_v4',JSON.stringify(stored));
  w.eval(fs.readFileSync('scripts.js','utf8')+';window.__x=c=>eval(c);window.__s={get lc(){return lastCalc},set aid(v){activeId=v},load,calcDetail,showDetail,validateElabs,get recipes(){return recipes}}');
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
console.log(fails?fails+' FALLOS':'TODO OK');
