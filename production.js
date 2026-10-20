// ═════════════════════════════════════════════════════════════════════
// FAMILIAS Y PLANIFICADOR DE PRODUCCIÓN (v1)
// Fuente única: la formulación de la masa base. Las variantes guardan
// exclusivamente {baseId,additions} y nunca duplican la fórmula heredada.
// ═════════════════════════════════════════════════════════════════════
const PRODUCTION_KEY='pan_production_v1';
let productionPlans={};
let planBaseId=null;
let variantEditingId=null;
let variantAdditions=[];
let variantMode='base';

function loadProduction(){
  try{const data=JSON.parse(localStorage.getItem(PRODUCTION_KEY)||'{}');productionPlans=data&&typeof data==='object'&&!Array.isArray(data)?data:{};}
  catch(e){productionPlans={};}
}
function saveProduction(){try{localStorage.setItem(PRODUCTION_KEY,JSON.stringify(productionPlans));}catch(e){alert('No se pudo guardar el plan de producción. Comprueba el almacenamiento del navegador.');}}
function getFamilyBase(v){
  const b=recipes.find(x=>x.id===v.baseId && !x.baseId);
  if(!b) throw Error('La receta base de «'+v.name+'» no existe. Revisa la importación.');
  return b;
}
function numPct(p,label){
  if(p===''||p===null||p===undefined||!Number.isFinite(Number(p))||Number(p)<0) throw Error('Porcentaje no válido: '+label+'.');
  return Number(p);
}
function baseFactor(base){
  if(!base||base.baseId) throw Error('La masa base debe ser una receta independiente.');
  const flours=base.flours||[];
  if(!flours.length || Math.abs(flours.reduce((s,f)=>s+numPct(f.pct,f.name),0)-100)>0.01) throw Error('Las harinas de la masa base deben sumar 100 %.');
  const all=[...flours,...(base.ings||[])];
  if(all.some(x=>!String(x.name||'').trim())) throw Error('Todos los ingredientes de la masa base deben tener nombre.');
  const waters=(base.ings||[]).filter(i=>isWaterName(i.name));
  if(waters.length>1) throw Error('La masa base debe tener una sola fila denominada Agua.');
  const factor=1+(base.ings||[]).reduce((s,x)=>s+numPct(x.pct,x.name)/100,0);
  // También detecta elaboraciones incompletas o mal descontadas.
  const c=calculateRecipeFormula(base,factor*100);
  const rem=c.finalRows.reduce((s,x)=>s+x.final,0)+c.elabCalcs.reduce((s,x)=>s+x.total,0);
  if(c.finalRows.some(x=>x.final< -0.00001)||Math.abs(rem-c.totalMass)>0.001) throw Error('Las elaboraciones de la masa base exceden los ingredientes disponibles.');
  return factor;
}
function checkAdditions(v){
  if(!Array.isArray(v.additions)) throw Error('Los ingredientes adicionales de esta variante no son válidos.');
  const ids=new Set();
  v.additions.forEach(a=>{
    if(!String(a.name||'').trim()) throw Error('Hay un ingrediente adicional sin nombre en «'+v.name+'».');
    numPct(a.pct,a.name);
    if(ids.has(String(a.id))) throw Error('Hay identificadores de adición duplicados.');
    ids.add(String(a.id));
  });
}
// Devuelve un objeto virtual completo de la variante. Los IDs heredados
// se preservan para que las elaboraciones de la receta base sigan apuntando
// al ingrediente correcto. Los nuevos IDs usan un espacio de nombres propio.
function effectiveVariantRecipe(v,base){
  checkAdditions(v);
  const ings=(base.ings||[]).map(x=>({...x}));
  for(const a of v.additions){
    const same=ings.find(x=>x.name.trim().toLocaleLowerCase('es')===a.name.trim().toLocaleLowerCase('es'));
    if(same) same.pct=Number(same.pct)+Number(a.pct);
    else ings.push({id:'addition:'+String(a.id),name:a.name.trim(),pct:Number(a.pct)});
  }
  return {id:v.id,name:v.name,notes:v.notes||'',flours:(base.flours||[]).map(x=>({...x})),ings,
    elabs:(base.elabs||[]).map(e=>({...e,ings:(e.ings||[]).map(i=>({...i}))})),
    hidInclElabs:base.hidInclElabs,hidPct:base.hidPct};
}
function calculateVariant(v,totalMass){
  if(!v.baseId) throw Error('No es una variante.');
  if(!Number.isFinite(totalMass)||totalMass<=0) throw Error('El peso de producción debe ser positivo.');
  const base=getFamilyBase(v);
  const bf=baseFactor(base);
  checkAdditions(v);
  const additionFactor=v.additions.reduce((s,a)=>s+Number(a.pct)/100,0);
  const flourG=totalMass/(bf+additionFactor);
  const baseMass=flourG*bf;
  const added=v.additions.map(a=>({id:a.id,name:a.name,pct:Number(a.pct),grams:flourG*Number(a.pct)/100}));
  const baseCalc=calculateRecipeFormula(base,baseMass);
  const effective=effectiveVariantRecipe(v,base);
  const fullCalc=calculateRecipeFormula(effective,totalMass);
  const sum=baseMass+added.reduce((s,a)=>s+a.grams,0);
  if(Math.abs(sum-totalMass)>0.00001) throw Error('Error de conservación de masa en «'+v.name+'».');
  return {variant:v,base,baseMass,added,flourG,totalMass,baseCalc,fullCalc,effective};
}
function planFor(baseId){
  if(!productionPlans[baseId]||typeof productionPlans[baseId]!=='object')productionPlans[baseId]={extra:0,rows:{}};
  const plan=productionPlans[baseId];
  if(!plan.rows||typeof plan.rows!=='object')plan.rows={};
  return plan;
}
function planRow(baseId,v){
  const plan=planFor(baseId);
  if(!plan.rows[v.id])plan.rows[v.id]={enabled:false,pieces:v.pieces||1,weight:v.weight||500};
  return plan.rows[v.id];
}
function calculateProduction(baseId,plan){
  const base=recipes.find(r=>r.id===baseId&&!r.baseId);
  if(!base)throw Error('La masa base no existe.');
  const bf=baseFactor(base);
  const extra=Number(plan.extra||0);
  if(!Number.isFinite(extra)||extra<0)throw Error('La masa base adicional no puede ser negativa.');
  const variants=recipes.filter(r=>r.baseId===baseId);
  const items=[];
  for(const v of variants){
    const row=plan.rows&&plan.rows[v.id];
    if(!row||!row.enabled)continue;
    const pieces=Number(row.pieces),weight=Number(row.weight);
    if(!Number.isSafeInteger(pieces)||pieces<1||!Number.isFinite(weight)||weight<=0)
      throw Error('Número de piezas o peso no válido para «'+v.name+'».');
    const c=calculateVariant(v,pieces*weight);
    items.push({...c,pieces,weight});
  }
  const required=items.reduce((s,x)=>s+x.baseMass,0);
  const totalBase=required+extra;
  const baseCalc=calculateRecipeFormula(base,totalBase);
  const productMass=items.reduce((s,x)=>s+x.totalMass,0);
  const addedMass=items.reduce((s,x)=>s+x.added.reduce((a,y)=>a+y.grams,0),0);
  if(Math.abs(productMass-(required+addedMass))>0.00001)throw Error('No se conserva el peso total de la producción.');
  return {base,baseFactor:bf,items,required,extra,totalBase,baseCalc,productMass,addedMass};
}
function productionIngredients(calc){
  // Compras reales, sin contar los ingredientes de las elaboraciones dos veces.
  const map=new Map();
  const add=(name,grams)=>{
    const key=name.trim().toLocaleLowerCase('es');
    if(!map.has(key))map.set(key,{name,grams:0});
    map.get(key).grams+=grams;
  };
  calc.baseCalc.summaryRows.forEach(x=>add(x.name,x.grams));
  calc.items.forEach(i=>i.added.forEach(a=>add(a.name,a.grams)));
  return Array.from(map.values());
}
function g1(n){return Number(n).toLocaleString('es-ES',{minimumFractionDigits:1,maximumFractionDigits:1});}
function massRow(name,grams,description=''){
  return `<div class="irr"><div class="irr-left"><div class="name">${esc(name)}</div>${description?`<div class="pct">${esc(description)}</div>`:''}</div><div class="irr-right"><div class="grams">${g1(grams)} g</div></div></div>`;
}

// ── Recetario y navegación ──
function renderFamilyList(){
  const el=document.getElementById('recipe_list_el');
  if(!recipes.length){el.innerHTML='<div class="empty-state">🍞<br><br>Aún no tienes recetas guardadas.<br>Pulsa <strong>Nueva</strong> para crear la primera.</div>';return;}
  const roots=recipes.filter(r=>!r.baseId);
  const orphans=recipes.filter(r=>r.baseId&&!recipes.some(b=>b.id===r.baseId&&!b.baseId));
  const item=(r,child=false)=>{
    const subs=recipes.filter(v=>v.baseId===r.id);
    const hydration=r.baseId?(()=>{try{return getHydration(effectiveVariantRecipe(r,getFamilyBase(r)));}catch(e){return null;}})():getHydration(r);
    const meta=r.baseId?(child?'Variante':'Variante sin masa base'):(subs.length?subs.length+' variante(s) · masa compartida':(r.flours||[]).map(f=>f.name).join(' + '));
    return `<div class="recipe-item${child?' recipe-child':''}${r.id===activeId?' sel':''}" data-recipe-id="${esc(r.id)}" onclick="selectRecipe(this.dataset.recipeId)">
       <div class="ri-icon">${r.baseId?'🥖':subs.length?'🍞':'🍞'}</div>
       <div style="flex:1;min-width:0"><div class="ri-name">${esc(r.name)}</div><div class="ri-meta">${esc(meta)}${hydration!=null?' · Hid. '+g1(hydration)+'%':''}</div></div>
       <span aria-hidden="true">›</span></div>`;
  };
  el.innerHTML=roots.map(r=>item(r)+recipes.filter(v=>v.baseId===r.id).map(v=>item(v,true)).join('')).join('')+orphans.map(r=>item(r)).join('');
}
function renderFamilyActions(){
  const r=recipes.find(x=>x.id===activeId),el=document.getElementById('det_family_actions');
  if(!r||!el)return;
  if(r.baseId){
    const b=recipes.find(x=>x.id===r.baseId);
    el.innerHTML=`<div class="family-action-panel"><div class="family-hint">${b?'Variante de '+esc(b.name):'⚠ Masa base no disponible'}</div>
      ${b?`<button class="btn btn-sm" data-id="${esc(b.id)}" onclick="selectRecipe(this.dataset.id)">Ver masa base</button> <button class="btn btn-sm" data-id="${esc(b.id)}" onclick="openFamilyPlan(this.dataset.id)">Planificar familia</button>`:''}</div>
      <div class="variant-mode"><span class="lbl">Modo de elaboración</span>
        <button class="btn btn-sm${(r.productionMode||'base')==='base'?' btn-primary':''}" onclick="changeVariantMode('base')">Desde masa base</button>
        <button class="btn btn-sm${r.productionMode==='scratch'?' btn-primary':''}" onclick="changeVariantMode('scratch')">Desde cero</button></div>`;
  }else{
    const count=recipes.filter(x=>x.baseId===r.id).length;
    el.innerHTML=`<div class="family-action-panel"><div class="family-hint">${count?count+' variante(s) vinculadas':'Puedes utilizar esta receta como masa base'}</div>
      <button class="btn btn-sm" data-id="${esc(r.id)}" onclick="openVariantEditor(null,this.dataset.id)">+ Nueva variante</button>
      <button class="btn btn-primary btn-sm" data-id="${esc(r.id)}" onclick="openFamilyPlan(this.dataset.id)">Planificar producción</button></div>`;
  }
}
function changeVariantMode(mode){
  if(mode!=='base'&&mode!=='scratch')return;
  const r=recipes.find(x=>x.id===activeId);
  if(!r||!r.baseId)return;
  r.productionMode=mode;save();renderFamilyActions();calcDetail();
}

// ── Editor de variantes ──
function openVariantEditor(variantId=null,baseId=null){
  const v=variantId?recipes.find(r=>r.id===variantId):null;
  const bid=v?v.baseId:baseId||activeId;
  const b=recipes.find(r=>r.id===bid&&!r.baseId);
  if(!b){alert('Primero selecciona una receta base válida.');return;}
  try{baseFactor(b);}catch(e){alert('Corrige la masa base antes de crear variantes: '+e.message);return;}
  variantEditingId=v?v.id:null;
  variantAdditions=v?(v.additions||[]).map(a=>({...a})):[];
  document.getElementById('variant_base_id').value=bid;
  document.getElementById('variant_name').value=v?v.name:'';
  document.getElementById('variant_notes').value=v?v.notes||'':'';
  document.getElementById('variant_title').textContent=v?'Editar variante':'Nueva variante';
  document.getElementById('variant_base_label').textContent=b.name;
  document.getElementById('variant_inherited').innerHTML=`<div class="field-hint">Harinas: ${(b.flours||[]).map(x=>esc(x.name)+' '+g1(x.pct)+'%').join(' · ')}</div><div class="field-hint">${(b.ings||[]).map(x=>esc(x.name)+' '+g1(x.pct)+'%').join(' · ')}</div><div class="field-hint">${(b.elabs||[]).length?'Elaboraciones heredadas: '+(b.elabs||[]).map(x=>esc(x.name)).join(', '):'Sin elaboraciones previas.'}</div>`;
  renderVariantAdditions();document.getElementById('variant_overlay').classList.add('open');
}
function closeVariantEditor(){document.getElementById('variant_overlay').classList.remove('open');variantEditingId=null;}
function addVariantIngredient(){variantAdditions.push({id:uid(),name:'',pct:0});renderVariantAdditions();}
function removeVariantIngredient(id){variantAdditions=variantAdditions.filter(a=>a.id!==id);renderVariantAdditions();}
function setVariantIngredient(id,field,value){const a=variantAdditions.find(a=>a.id===id);if(a)a[field]=value;}
function renderVariantAdditions(){
  const el=document.getElementById('variant_ings');
  el.innerHTML=variantAdditions.map(a=>`<div class="addition-row" data-addition-id="${esc(a.id)}">
    <input type="text" aria-label="Ingrediente adicional" placeholder="Agua, semillas, miel…" value="${esc(a.name)}" oninput="setVariantIngredient(this.parentElement.dataset.additionId,'name',this.value)">
    <input type="number" aria-label="Porcentaje adicional" min="0" step="0.01" value="${esc(a.pct)}" oninput="setVariantIngredient(this.parentElement.dataset.additionId,'pct',this.value)">
    <button class="btn btn-icon btn-ghost" aria-label="Eliminar ingrediente" onclick="removeVariantIngredient(this.parentElement.dataset.additionId)">×</button></div>`).join('') || '<div class="field-hint">Añade los ingredientes que incorporarás a la masa base.</div>';
}
function saveVariant(){
  const name=document.getElementById('variant_name').value.trim();
  const baseId=document.getElementById('variant_base_id').value;
  if(!name){alert('Pon un nombre a la variante.');return;}
  const base=recipes.find(x=>x.id===baseId&&!x.baseId);
  if(!base){alert('La masa base ya no está disponible.');return;}
  const vOld=variantEditingId?recipes.find(x=>x.id===variantEditingId):null;
  const v={...(vOld||{}),id:variantEditingId||uid(),baseId,name,
    notes:document.getElementById('variant_notes').value.trim(),
    additions:variantAdditions.map(a=>({id:a.id,name:a.name.trim(),pct:a.pct}))};
  try{calculateVariant(v,1000);}catch(e){alert(e.message);return;}
  const idx=recipes.findIndex(x=>x.id===v.id);
  if(idx>=0)recipes[idx]=v;else recipes.push(v);
  activeId=v.id;variantEditingId=null;closeVariantEditor();save();renderList();showDetail();
}

// ── Resultados individuales ──
function calcVariantDetail(v,pieces,unitW,errEl,resWrap){
  if(!Number.isSafeInteger(pieces)||pieces<=0||!Number.isFinite(unitW)||unitW<=0){errEl.textContent='Número de piezas o peso no válido.';errEl.classList.add('show');return;}
  let c;
  try{c=calculateVariant(v,pieces*unitW);}catch(e){errEl.textContent=e.message;errEl.classList.add('show');return;}
  const mode=v.productionMode||'base';
  const d=c.fullCalc;
  lastCalc={...d,variant:c,mode,r:mode==='scratch'?c.effective:v,
    amasadoData:mode==='scratch'?d.amasadoData:{recipeName:v.name,waterMass:c.added.filter(a=>isWaterName(a.name)).reduce((s,a)=>s+a.grams,0),
      ings:[{name:'Masa base: '+c.base.name,mass:c.baseMass,temp:20},...c.added.filter(a=>!isWaterName(a.name)).map(a=>({name:a.name,mass:a.grams,temp:20}))]}};
  const hyd=getHydration(c.effective);
  document.getElementById('d_chips').innerHTML=`<span class="tag tag-elab">Variante de ${esc(c.base.name)}</span>${hyd!=null?`<span class="tag tag-water">Hid. ${g1(hyd)}%</span>`:''}<span class="tag">${g1(c.totalMass)} g</span>`;
  if(v.weight!==unitW||v.pieces!==pieces){v.weight=unitW;v.pieces=pieces;save();}
  resWrap.style.display='block';
  buildResTabs(c.fullCalc.elabCalcs);
  renderResTab(resTab);
  const btn=resWrap.querySelector('.btn-goto-amasado');
  if(btn){btn.style.display=lastCalc.amasadoData.waterMass>0.000001?'':'none';}
}
function renderVariantResTab(i){
  const state=lastCalc,c=state.variant,mode=state.mode;
  if(i===state.elabCalcs.length+1 && mode==='base'){
    const body=document.getElementById('d_res_body');
    let html=`<div class="card"><div class="card-hdr">Incorporar a la masa final</div>`;
    html+=massRow('Masa base: '+c.base.name,c.baseMass,'Contiene todos sus ingredientes y elaboraciones previas');
    c.added.forEach(a=>{html+=massRow(a.name,a.grams,'+'+g1(a.pct)+'% s/harina total');});
    html+=`</div><div class="total-bar"><span class="total-bar-lbl">Masa final</span><span class="total-bar-val">${g1(c.totalMass)} g</span></div>`;
    body.innerHTML=html;
    return;
  }
  // Reutilizar íntegramente el renderizador clásico para el resumen,
  // las elaboraciones heredadas y el modo «desde cero».
  lastCalc={...state,variant:null,r:c.effective};
  try{renderResTab(i);}finally{lastCalc=state;}
  if(i>0&&i<=state.elabCalcs.length&&mode==='base'){
    document.getElementById('d_res_body').insertAdjacentHTML('afterbegin','<div class="alert alert-ok show">Esta elaboración ya está incluida en la masa base. No la incorpores de nuevo a la variante.</div>');
  }
}

// ── Planificador ──
function openFamilyPlan(baseId){
  const base=recipes.find(r=>r.id===baseId&&!r.baseId);
  if(!base){alert('No existe la masa base seleccionada.');return;}
  planBaseId=baseId;
  document.getElementById('v_list').style.display='none';
  document.getElementById('v_detail').style.display='none';
  document.getElementById('v_plan').style.display='block';
  renderPlanEditor();
}
function renderPlanEditor(){
  if(!planBaseId)return;
  const base=recipes.find(r=>r.id===planBaseId);
  if(!base){showList();return;}
  const plan=planFor(planBaseId);
  document.getElementById('plan_name').textContent=base.name;
  const options=recipes.filter(r=>r.baseId===planBaseId);
  const rows=document.getElementById('plan_rows');
  rows.innerHTML=options.length?options.map(v=>{
    const row=planRow(planBaseId,v);
    return `<div class="plan-item" data-variant-id="${esc(v.id)}"><div class="plan-item-head"><label class="plan-check"><input type="checkbox" ${row.enabled?'checked':''} onchange="updatePlanRow(this.closest('.plan-item').dataset.variantId,'enabled',this.checked)"><strong>${esc(v.name)}</strong></label><button class="btn btn-ghost btn-xs" onclick="selectRecipe(this.closest('.plan-item').dataset.variantId)">Ver</button></div>
      <div class="prod-grid"><div class="field field-flush"><label class="lbl">Nº piezas</label><input type="number" min="1" step="1" value="${esc(row.pieces)}" ${row.enabled?'':'disabled'} oninput="updatePlanRow(this.closest('.plan-item').dataset.variantId,'pieces',this.value)"></div>
      <div class="field field-flush"><label class="lbl">Peso pieza (g)</label><input type="number" min="0.1" step="0.1" value="${esc(row.weight)}" ${row.enabled?'':'disabled'} oninput="updatePlanRow(this.closest('.plan-item').dataset.variantId,'weight',this.value)"></div></div></div>`;
  }).join(''):'<div class="empty-state">Crea primero una variante desde la receta base.<br><button class="btn btn-primary btn-sm" onclick="openVariantEditor(null,planBaseId)">+ Crear variante</button></div>';
  document.getElementById('plan_extra').value=plan.extra||0;
  renderPlanResults();
}
function updatePlanRow(id,field,value){
  const v=recipes.find(x=>x.id===id&&x.baseId===planBaseId);if(!v)return;
  const row=planRow(planBaseId,v);
  row[field]=field==='enabled'?!!value:value; // guardar también el texto inválido para mostrar un error real
  saveProduction();
  if(field==='enabled')renderPlanEditor();else renderPlanResults();
}
function updatePlanExtra(value){planFor(planBaseId).extra=value;saveProduction();renderPlanResults();}
function renderPlanResults(){
  const e=document.getElementById('plan_error'),out=document.getElementById('plan_results'),btn=document.getElementById('plan_export_excel');
  e.classList.remove('show');out.innerHTML='';btn.disabled=true;
  const amasadoBtn=document.getElementById('plan_go_amasado');if(amasadoBtn)amasadoBtn.disabled=true;
  let calc;
  try{calc=calculateProduction(planBaseId,planFor(planBaseId));}
  catch(err){e.textContent=err.message;e.classList.add('show');return;}
  if(!calc.items.length){out.innerHTML='<div class="empty-state">Selecciona al menos una variante para calcular la producción.</div>';return;}
  btn.disabled=false;
  if(amasadoBtn)amasadoBtn.disabled=calc.baseCalc.amasadoData.waterMass<=0;
  let h=`<div class="plan-kpis"><div class="stat"><div class="stat-lbl">Masa base a preparar</div><div class="stat-val">${g1(calc.totalBase)} g</div></div><div class="stat"><div class="stat-lbl">Panes terminados</div><div class="stat-val">${g1(calc.productMass)} g</div></div></div>`;
  h+=`<div class="card"><div class="card-hdr">Reparto de masa base</div>`;
  for(const item of calc.items){
    h+=`<div class="plan-result-item"><strong>${esc(item.variant.name)} · ${item.pieces} × ${g1(item.weight)} g</strong>`;
    h+=massRow('Masa base',item.baseMass);
    item.added.forEach(a=>{h+=massRow(a.name,a.grams,'+'+g1(a.pct)+'%');});
    h+=massRow('Masa final',item.totalMass);
    h+='</div>';
  }
  h+=`<div class="total-bar"><span class="total-bar-lbl">Masa base asignada</span><span class="total-bar-val">${g1(calc.required)} g</span></div>`;
  if(calc.extra)h+=massRow('Masa base extra, sin asignar',calc.extra);
  h+='</div>';
  h+=`<div class="card"><div class="card-hdr">Preparar la masa base conjunta</div>`;
  const bc=calc.baseCalc;
  h+=`<div class="field-hint">Fórmula completa · harina total ${g1(bc.flourG)} g</div>`;
  bc.summaryRows.forEach(x=>{h+=massRow(x.name,x.grams,x.pct);});
  h+=`<div class="total-bar"><span class="total-bar-lbl">Total masa base</span><span class="total-bar-val">${g1(calc.totalBase)} g</span></div></div>`;
  if(bc.elabCalcs.length){
    h+=`<div class="card"><div class="card-hdr">Elaboraciones previas conjuntas</div>`;
    for(const e of bc.elabCalcs){h+=`<div class="plan-result-item"><strong>${esc(e.name)}</strong>`;e.ings.forEach(x=>{h+=massRow(x.name,x.grams,x.pctDesc);});h+=massRow('Total '+e.name,e.total)+'</div>';}
    h+='</div>';
  }
  h+=`<div class="card"><div class="card-hdr">Masa final de la base (tras elaboraciones)</div>`;
  bc.finalRows.forEach(x=>{if(x.final>0.00001)h+=massRow(x.name,x.final,x.ded>0?'Preelaboraciones: −'+g1(x.ded)+' g':'');});
  bc.elabCalcs.forEach(x=>{h+=massRow(x.name,x.total,'Ya elaborado');});
  h+='</div>';
  h+=`<div class="card"><div class="card-hdr">Ingredientes totales para preparar</div>`;
  productionIngredients(calc).forEach(x=>{h+=massRow(x.name,x.grams);});
  h+='</div>';
  out.innerHTML=h;
}
function sendPlannedBaseToAmasado(){
  if(!planBaseId)return;
  let calc;try{calc=calculateProduction(planBaseId,planFor(planBaseId));}
  catch(e){alert(e.message);return;}
  const data=calc.baseCalc.amasadoData;
  if(!calc.items.length||data.waterMass<=0){alert('La masa base no requiere agua nueva en el amasado o aún no has seleccionado variantes.');return;}
  aIngs=data.ings.map(i=>({id:aIngId++,...i}));
  document.getElementById('a_wm').value=data.waterMass;
  aRenderIngs();aCalc();
  const b=document.getElementById('a_banner');
  b.textContent='✓ Masa base conjunta: '+calc.base.name+' · '+g1(calc.totalBase)+' g';
  b.classList.add('show');switchTab('amasado');
}
function removeFromProduction(recipeId){
  if(productionPlans[recipeId])delete productionPlans[recipeId];
  Object.values(productionPlans).forEach(p=>{if(p.rows)delete p.rows[recipeId];});
  saveProduction();
}

// Exportación/importación autocontenida de familias, conservando datos antiguos.
function exportCurrentFamily(){
  const r=recipes.find(x=>x.id===activeId);if(!r)return;
  const id=r.baseId||r.id;
  const all=recipes.filter(x=>x.id===id||x.baseId===id);
  const json={format:'pan-agua-family-v1',recipes:all,production:productionPlans[id]||null};
  downloadFile(new Blob([JSON.stringify(json,null,2)],{type:'application/json'}),'familia_'+safeFileName(recipes.find(x=>x.id===id)?.name||'pan')+'.json');
}
function safeFileName(s){return String(s||'produccion').replace(/[^\w\-áéíóúÁÉÍÓÚñÑ ]/g,'').trim().replace(/\s+/g,'_').slice(0,70)||'produccion';}
function downloadFile(blob,name){
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function importRecipeData(data){
  const isBundle=data&&data.format==='pan-agua-family-v1';
  const arr=isBundle?data.recipes:(Array.isArray(data)?data:[data]);
  if(!Array.isArray(arr)||!arr.length||arr.some(r=>!r||!r.name||!r.id&&r.baseId))throw Error('El archivo no contiene recetas válidas.');
  // Si existen colisiones, crear IDs nuevos y remapear enlaces internos; nunca sobreescribir.
  const used=new Set(recipes.map(r=>String(r.id)));
  const ids=new Map();
  const incoming=new Set();
  const keys=arr.map(r=>String(r.id||uid()));
  for(let ri=0;ri<arr.length;ri++){
    const original=keys[ri];
    if(incoming.has(original))throw Error('Hay identificadores duplicados en el archivo.');
    incoming.add(original);
    let id=original;
    if(used.has(id)){do{id=uid();}while(used.has(id));}
    used.add(id);ids.set(original,id);
  }
  const imported=arr.map((r,ri)=>{
    const v=JSON.parse(JSON.stringify(r));v.id=ids.get(keys[ri]);
    if(v.baseId) v.baseId=ids.get(String(v.baseId))||v.baseId;
    return v;
  });
  const pool=[...recipes,...imported];
  for(const v of imported){
    if(v.baseId){
      if(!pool.some(b=>b.id===v.baseId&&!b.baseId))throw Error('La variante «'+v.name+'» hace referencia a una masa base no incluida. Importa la familia completa.');
      checkAdditions(v);
    }else{
      if(!Array.isArray(v.flours)||!Array.isArray(v.ings))throw Error('La receta «'+v.name+'» está incompleta.');
      if(!Array.isArray(v.elabs))v.elabs=[];
    }
  }
  for(const v of imported.filter(x=>x.baseId)){
    const b=pool.find(x=>x.id===v.baseId);baseFactor(b);calculateRecipeFormula(effectiveVariantRecipe(v,b),1000);
  }
  recipes.push(...imported);
  if(isBundle&&data.production){
    const oldBase=arr.find(x=>!x.baseId)?.id;
    if(oldBase){
      const clone=JSON.parse(JSON.stringify(data.production));
      clone.rows=Object.fromEntries(Object.entries(clone.rows||{}).map(([id,row])=>[ids.get(id)||id,row]).filter(([id])=>imported.some(v=>v.id===id&&v.baseId)));
      productionPlans[ids.get(String(oldBase))]=clone;
      saveProduction();
    }
  }
  save();renderList();return imported.length;
}
function importJSON(){
  const inp=document.createElement('input');inp.type='file';inp.accept='.json,application/json';
  inp.onchange=()=>{const file=inp.files&&inp.files[0];if(!file)return;
    const fr=new FileReader();fr.onload=()=>{try{const n=importRecipeData(JSON.parse(fr.result));alert(n+' receta(s) importada(s).');}catch(e){alert('No se pudo importar: '+e.message);}};fr.readAsText(file);
  };inp.click();
}

loadProduction();
renderList();
