// ═════════════════════════════════════════════════════════════════════
// PLANIFICADOR TRANSVERSAL · V3
// Planes independientes del recetario; las familias comparten amasado.
// No duplica fórmulas ni modifica las cantidades guardadas en recetas.
// ═════════════════════════════════════════════════════════════════════
const GLOBAL_PLANS_KEY='pan_global_plans_v1';
let globalPlans={};
let currentGlobalPlanId=null;
function loadGlobalPlans(){
  try{
    const store=JSON.parse(localStorage.getItem(GLOBAL_PLANS_KEY)||'null');
    if(store&&store.plans&&typeof store.plans==='object'&&Object.keys(store.plans).length){
      globalPlans=store.plans;currentGlobalPlanId=store.currentId;
    }
  }catch(e){globalPlans={};}
  if(!Object.keys(globalPlans).length){
    const id=uid(),p={id,name:'Producción actual',rows:{},extras:{}};
    // Migración no destructiva desde planes familiares de la versión anterior.
    for(const [baseId,old] of Object.entries(productionPlans||{})){
      if(!recipes.some(r=>r.id===baseId&&!r.baseId))continue;
      for(const [recipeId,row] of Object.entries(old.rows||{})){
        if(row.enabled&&recipes.some(r=>r.id===recipeId&&r.baseId===baseId))
          p.rows[recipeId]={pieces:row.pieces,weight:row.weight,mode:'base'};
      }
      if(Number(old.extra)>0)p.extras[baseId]=old.extra;
    }
    globalPlans[id]=p;currentGlobalPlanId=id;saveGlobalPlans();
  }
  if(!globalPlans[currentGlobalPlanId])currentGlobalPlanId=Object.keys(globalPlans)[0];
}
function saveGlobalPlans(){
  try{localStorage.setItem(GLOBAL_PLANS_KEY,JSON.stringify({currentId:currentGlobalPlanId,plans:globalPlans}));}
  catch(e){alert('No se ha podido guardar la planificación.');}
}
function activeGlobalPlan(){return globalPlans[currentGlobalPlanId];}
function globalPlanItemLabel(r){return r.name+(r.baseId?' · deriva de '+(recipeById(r.baseId)?.name||'receta no disponible'):' · receta original');}
function calculateGlobalProduction(plan){
  if(!plan||!plan.rows||typeof plan.rows!=='object')throw Error('El plan de producción no es válido.');
  const items=[],demand=new Map();
  const ensure=(r)=>{
    const key=String(r.id);
    if(!demand.has(key))demand.set(key,{base:r,required:0,extra:0,items:[],variantItems:[],directItems:[]});
    return demand.get(key);
  };
  for(const [id,row] of Object.entries(plan.rows)){
    const r=recipeById(id);
    if(!r)throw Error('El plan incluye una receta eliminada. Retírala del plan.');
    const pieces=Number(row.pieces),weight=Number(row.weight);
    if(!Number.isSafeInteger(pieces)||pieces<1||!Number.isFinite(weight)||weight<=0)
      throw Error('Cantidad no válida en «'+r.name+'».');
    const totalMass=pieces*weight;
    if(!Number.isFinite(totalMass)||totalMass<=0)throw Error('Peso no válido en «'+r.name+'».');
    if(r.baseId){
      const c=calculateVariant(r,totalMass);
      const mode=row.mode==='scratch'?'scratch':'base';
      const item={...c,recipe:r,type:'variant',mode,pieces,weight,totalMass,calc:c.fullCalc};items.push(item);
      if(mode==='base'){
        const g=ensure(r);g.required+=totalMass;g.items.push(item);g.variantItems.push(item);
      }
    }else{
      const c=calculateRecipeFormula(r,totalMass);
      const item={recipe:r,type:'independent',mode:'scratch',pieces,weight,totalMass,calc:c};items.push(item);
      const g=ensure(r);g.required+=totalMass;g.items.push(item);g.directItems.push(item);
    }
  }
  // Propagación inversa de demanda: productos finales -> masas intermedias -> raíz.
  // Un nodo se amasa una sola vez incluso si lo consumen varios descendientes.
  const groups=[];
  while(demand.size){
    const candidates=[...demand.values()];
    candidates.sort((a,b)=>recipeDepth(b.base)-recipeDepth(a.base));
    const g=candidates[0];demand.delete(String(g.base.id));
    g.extra=Number(plan.extras?.[g.base.id]||0);
    if(!Number.isFinite(g.extra)||g.extra<0)throw Error('El excedente de «'+g.base.name+'» debe ser positivo o cero.');
    g.totalBase=g.required+g.extra;
    if(g.base.baseId){
      const c=calculateVariant(g.base,g.totalBase);
      g.stage=c.stage;g.parentMass=c.baseMass;g.added=c.added;
      g.baseCalc=c.fullCalc;g.parent=c.base;g.mode='transform';
      const parent=ensure(c.base);
      parent.required+=c.baseMass;
      for(const i of g.items)if(!parent.items.includes(i))parent.items.push(i);
    }else{
      g.baseCalc=calculateRecipeFormula(g.base,g.totalBase);
      g.mode='root';g.stage=null;g.parent=null;g.added=[];
    }
    groups.push(g);
  }
  groups.sort((a,b)=>recipeDepth(a.base)-recipeDepth(b.base));
  const productMass=items.reduce((sum,i)=>sum+i.totalMass,0);
  const extraMass=groups.reduce((sum,g)=>sum+g.extra,0);
  const ingredients=new Map();
  const add=(name,grams)=>{
    const key=String(name).trim().toLocaleLowerCase('es');
    if(!ingredients.has(key))ingredients.set(key,{name,grams:0});
    ingredients.get(key).grams+=grams;
  };
  // Los ingredientes de cada etapa solo se compran una vez; la masa heredada
  // de una etapa anterior NO es materia prima nueva.
  for(const g of groups){
    if(g.mode==='root')g.baseCalc.summaryRows.forEach(x=>add(x.name,x.grams));
    else g.added.forEach(a=>add(a.name,a.grams));
  }
  items.filter(i=>i.type==='variant'&&i.mode==='scratch').forEach(i=>i.calc.summaryRows.forEach(x=>add(x.name,x.grams)));
  const ingredientRows=[...ingredients.values()];
  const purchasedMass=ingredientRows.reduce((sum,i)=>sum+i.grams,0);
  if(Math.abs(purchasedMass-productMass-extraMass)>0.00001)
    throw Error('Error de conservación de masa en el plan de producción por etapas.');
  return {plan,items,groups,productMass,extraMass,ingredientRows,purchasedMass};
}
function openGlobalPlanner(recipeId=null){
  switchTab('produccion');
  if(recipeId&&recipes.some(x=>x.id===recipeId))addToGlobalPlan(recipeId);
  else renderGlobalPlanner();
}
// Atajos desde las fichas antiguas: entran al mismo plan global.
function openFamilyPlan(baseId){openGlobalPlanner();}
function addToGlobalPlan(id){
  const r=recipes.find(x=>String(x.id)===String(id));if(!r)return;
  const p=activeGlobalPlan();
  if(!p.rows[r.id])p.rows[r.id]={pieces:r.pieces||1,weight:r.weight||500,mode:r.baseId?(r.productionMode==='scratch'?'scratch':'base'):'scratch'};
  saveGlobalPlans();renderGlobalPlanner();
}
function addPickedRecipe(){
  const value=document.getElementById('global_recipe_pick').value;
  if(value)addToGlobalPlan(value);
}
function setGlobalPlanRow(id,field,value){
  const p=activeGlobalPlan(),row=p.rows[id];if(!row)return;
  row[field]=value;saveGlobalPlans();
  if(field==='mode')renderGlobalPlanner();else renderGlobalResults();
}
function removeGlobalPlanRow(id){
  delete activeGlobalPlan().rows[id];saveGlobalPlans();renderGlobalPlanner();
}
function setGlobalExtra(id,value){
  activeGlobalPlan().extras[id]=value;saveGlobalPlans();renderGlobalResults();
}
function createGlobalPlan(){
  const id=uid();globalPlans[id]={id,name:'Nueva producción',rows:{},extras:{}};
  currentGlobalPlanId=id;saveGlobalPlans();renderGlobalPlanner();
}
function chooseGlobalPlan(id){if(!globalPlans[id])return;currentGlobalPlanId=id;saveGlobalPlans();renderGlobalPlanner();}
function renameGlobalPlan(name){activeGlobalPlan().name=name;saveGlobalPlans();}
function deleteGlobalPlan(){
  if(Object.keys(globalPlans).length===1){alert('Debe existir al menos un plan. Puedes vaciar sus recetas.');return;}
  if(!confirm('¿Eliminar este plan de producción? Las recetas permanecerán intactas.'))return;
  delete globalPlans[currentGlobalPlanId];currentGlobalPlanId=Object.keys(globalPlans)[0];saveGlobalPlans();renderGlobalPlanner();
}
function globalRemoveRecipe(id){
  for(const p of Object.values(globalPlans)){
    if(p.rows)delete p.rows[id];if(p.extras)delete p.extras[id];
  }
  saveGlobalPlans();
}
function renderGlobalPlanner(){
  const page=document.getElementById('page_produccion');if(!page)return;
  const p=activeGlobalPlan();if(!p)return;
  document.getElementById('global_plans_select').innerHTML=Object.values(globalPlans).map(x=>
    `<option value="${esc(x.id)}" ${x.id===currentGlobalPlanId?'selected':''}>${esc(x.name||'Sin nombre')}</option>`).join('');
  document.getElementById('global_plan_name').value=p.name||'';
  const selected=new Set(Object.keys(p.rows||{}));
  document.getElementById('global_recipe_pick').innerHTML='<option value="">Elige un pan para añadir...</option>'+recipes.filter(r=>!selected.has(String(r.id))).map(r=>
    `<option value="${esc(r.id)}">${esc(globalPlanItemLabel(r))}</option>`).join('');
  const rows=document.getElementById('global_plan_rows');
  rows.innerHTML=Object.entries(p.rows||{}).map(([id,row])=>{
    const r=recipes.find(x=>String(x.id)===id);
    return `<div class="plan-item" data-id="${esc(id)}">
      <div class="plan-item-head"><strong>${esc(r?.name||'Receta eliminada')}</strong><button class="btn btn-danger btn-xs" onclick="removeGlobalPlanRow(this.closest('.plan-item').dataset.id)">Quitar</button></div>
      ${r?.baseId?`<label class="lbl">Preparación</label><select class="plan-mode-select" onchange="setGlobalPlanRow(this.closest('.plan-item').dataset.id,'mode',this.value)">
        <option value="base" ${row.mode!=='scratch'?'selected':''}>Desde masa anterior compartida</option>
        <option value="scratch" ${row.mode==='scratch'?'selected':''}>Desde cero (amasado independiente)</option></select>`:''}
      <div class="prod-grid"><div class="field field-flush"><label class="lbl">Nº piezas</label>
      <input type="number" min="1" step="1" value="${esc(row.pieces)}" oninput="setGlobalPlanRow(this.closest('.plan-item').dataset.id,'pieces',this.value)"></div>
      <div class="field field-flush"><label class="lbl">Peso pieza (g)</label>
      <input type="number" min="0.1" step="0.1" value="${esc(row.weight)}" oninput="setGlobalPlanRow(this.closest('.plan-item').dataset.id,'weight',this.value)"></div></div></div>`;
  }).join('')||'<div class="empty-state">El plan está vacío. Añade cualquier receta del recetario para comenzar.</div>';
  renderGlobalResults();
}
function renderGlobalResults(){
  const error=document.getElementById('global_plan_error'),out=document.getElementById('global_plan_results');
  const button=document.getElementById('global_plan_excel');
  error.classList.remove('show');out.innerHTML='';button.disabled=true;
  let calc;try{calc=calculateGlobalProduction(activeGlobalPlan());}
  catch(e){error.textContent=e.message;error.classList.add('show');return;}
  if(!calc.items.length)return;
  button.disabled=false;
  let h=`<div class="plan-kpis"><div class="stat"><div class="stat-lbl">Masa final de panes</div><div class="stat-val">${g1(calc.productMass)} g</div></div>
  <div class="stat"><div class="stat-lbl">Masas por preparar (incluye extra)</div><div class="stat-val">${g1(calc.purchasedMass)} g</div></div></div>`;
  for(const g of calc.groups){
    h+=`<div class="card"><div class="card-hdr">${g.mode==='root'?'Amasado original':'Masa derivada'} · ${esc(g.base.name)}</div>
    ${g.parent?massRow('Masa anterior: '+g.parent.name,g.parentMass):''}
    ${massRow('Masa necesaria para productos y derivados',g.required)}
    <div class="field"><label class="lbl">Excedente sin asignar (g)</label>
      <input type="number" min="0" step="0.1" data-base-id="${esc(g.base.id)}" value="${esc(activeGlobalPlan().extras?.[g.base.id]??0)}" onchange="setGlobalExtra(this.dataset.baseId,this.value)"></div>
    ${massRow('Masa total a preparar',g.totalBase)}
    <div class="field-hint">${g.items.map(i=>esc(i.recipe.name)).join(' · ')}</div>`;
    const elabs=g.mode==='transform'?g.stage.elabCalcs:g.baseCalc.elabCalcs;
    if(elabs.length){
      h+='<div class="section-hdr">Elaboraciones previas de esta etapa</div>';
      for(const e of elabs){h+=`<strong>${esc(e.name)}</strong>`;e.ings.forEach(x=>h+=massRow(x.name,x.grams));h+=massRow('Total '+e.name,e.total);}
    }
    h+='<div class="section-hdr">Incorporaciones de esta etapa</div>';
    if(g.mode==='transform'){
      g.stage.finalRows.filter(x=>x.final>0.000001).forEach(x=>h+=massRow(x.name,x.final));
      elabs.forEach(e=>h+=massRow('Preelaboración: '+e.name,e.total));
    }else g.baseCalc.summaryRows.forEach(x=>h+=massRow(x.name,x.grams));
    const waterMass=g.mode==='transform'?g.stage.waterRemaining:g.baseCalc.amasadoData.waterMass;
    if(waterMass>0.00001)h+=`<button class="btn btn-sm" data-id="${esc(g.base.id)}" onclick="sendGlobalBaseToAmasado(this.dataset.id)">Temperatura de amasado</button>`;
    h+='</div>';
  }
  h+='<div class="card"><div class="card-hdr">Desglose por pan</div>';
  for(const i of calc.items){
    h+=`<div class="plan-result-item"><strong>${esc(i.recipe.name)} · ${i.pieces} × ${g1(i.weight)} g</strong>`;
    if(i.type==='variant'&&i.mode==='base'){
      h+=massRow('Masa base: '+i.base.name,i.baseMass);
      i.stage.elabCalcs.forEach(e=>{
        h+=`<div class="field-hint">Preelaboración propia: ${esc(e.name)}</div>`;
        e.ings.forEach(x=>h+=massRow(x.name,x.grams));
        h+=massRow('Total '+e.name,e.total);
      });
      i.stage.finalRows.filter(x=>x.final>0.000001).forEach(x=>h+=massRow(x.name,x.final,'Añadir a la masa final'));
    }else{
      h+='<div class="field-hint">Elaboración completa e independiente</div>';
      i.calc.elabCalcs.forEach(e=>{
        h+=`<div class="field-hint">Preelaboración: ${esc(e.name)}</div>`;
        e.ings.forEach(x=>h+=massRow(x.name,x.grams));
      });
      i.calc.finalRows.filter(x=>x.final>0.000001).forEach(x=>h+=massRow(x.name,x.final));
    }
    h+=massRow('Masa final de este pan',i.totalMass)+'</div>';
  }
  h+='</div><div class="card"><div class="card-hdr">Ingredientes totales · sin duplicaciones</div>';
  calc.ingredientRows.forEach(x=>h+=massRow(x.name,x.grams));
  h+='</div>';
  out.innerHTML=h;
}
function sendGlobalBaseToAmasado(baseId){
  let calc;try{calc=calculateGlobalProduction(activeGlobalPlan());}catch(e){alert(e.message);return;}
  const g=calc.groups.find(g=>String(g.base.id)===String(baseId));if(!g)return;
  const data=g.mode==='transform'?{recipeName:g.base.name,waterMass:g.stage.waterRemaining,ings:[{name:'Masa anterior: '+g.parent.name,mass:g.parentMass,temp:20},...g.stage.finalRows.filter(x=>x.tag!=='water'&&x.final>0).map(x=>({name:x.name,mass:x.final,temp:20})),...g.stage.elabCalcs.filter(e=>e.total>0).map(e=>({name:'Elaboración: '+e.name,mass:e.total,temp:20}))]}:g.baseCalc.amasadoData;
  if(data.waterMass<=0){alert('No hay agua nueva para este amasado.');return;}
  aIngs=data.ings.map(i=>({id:aIngId++,...i}));
  document.getElementById('a_wm').value=data.waterMass;
  aRenderIngs();aCalc();
  const banner=document.getElementById('a_banner');banner.textContent='✓ Producción global · '+g.base.name+' · '+g1(g.totalBase)+' g';banner.classList.add('show');
  switchTab('amasado');
}
loadGlobalPlans();
