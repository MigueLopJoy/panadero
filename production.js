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
let variantElabs=[];

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
  const ids=new Set(),names=new Set();
  v.additions.forEach(a=>{
    if(!String(a.name||'').trim()) throw Error('Hay un ingrediente adicional sin nombre en «'+v.name+'».');
    numPct(a.pct,a.name);
    const key=a.name.trim().toLocaleLowerCase('es');
    if(names.has(key))throw Error('El ingrediente «'+a.name+'» aparece varias veces entre los adicionales. Usa una sola fila por ingrediente.');
    names.add(key);
    if(ids.has(String(a.id))) throw Error('Hay identificadores de adición duplicados.');
    ids.add(String(a.id));
  });
}
// Devuelve un objeto virtual completo de la variante. Los IDs heredados
// se preservan para que las elaboraciones de la receta base sigan apuntando
// al ingrediente correcto. Los nuevos IDs usan un espacio de nombres propio.
// Las preelaboraciones de una variante solo pueden consumir ingredientes
// añadidos A ESA VARIANTE, nunca ingredientes incorporados a la masa base.
function variantElabRecipe(v,flourG){
  const ingredients=(v.additions||[]).map(a=>({id:'addition:'+a.id,name:a.name,pct:Number(a.pct)}));
  const elabs=(v.elabs||[]).map(e=>({...e,ings:(e.ings||[]).map(row=>({...row}))}));
  for(const e of elabs)for(const r of e.ings){
    if(r.type==='flour')throw Error('Las elaboraciones exclusivas deben prepararse con ingredientes adicionales, no con harina ya mezclada en la masa base. Añade la harina como ingrediente adicional.');
    if(r.type==='other'&&!ingredients.some(i=>i.id===r.ingId))throw Error('«'+e.name+'» usa un ingrediente que no pertenece a los adicionales de esta variante.');
    if(r.type==='water'&&r.baseId==null)throw Error('El agua en «'+e.name+'» debe referirse a un ingrediente añadido de la misma elaboración.');
  }
  // La harina virtual solo fija la referencia de porcentajes panaderos.
  // No representa harina nueva ni forma parte de la elaboración real.
  const fake={name:v.name,flours:[{id:'reference-flour',name:'Referencia de harina',pct:100}],ings:ingredients,elabs};
  const factor=1+ingredients.reduce((s,a)=>s+Number(a.pct)/100,0);
  const c=calculateRecipeFormula(fake,flourG*factor);
  return {elabCalcs:c.elabCalcs,finalRows:c.finalRows.filter(r=>r.tag!=='flour'),
    waterRemaining:c.finalRows.filter(r=>r.tag==='water').reduce((s,r)=>s+r.final,0),
    waterInElabs:c.deductW};
}
function effectiveVariantRecipe(v,base){
  checkAdditions(v);
  const ings=(base.ings||[]).map(x=>({...x}));
  const additionsMap=new Map();
  for(const a of v.additions){
    const key='addition:'+String(a.id);
    const same=ings.find(x=>x.name.trim().toLocaleLowerCase('es')===a.name.trim().toLocaleLowerCase('es'));
    if(same){same.pct=Number(same.pct)+Number(a.pct);additionsMap.set(key,same.id);}
    else{ings.push({id:key,name:a.name.trim(),pct:Number(a.pct)});additionsMap.set(key,key);}
  }
  const inherited=(base.elabs||[]).map(e=>({...e,origin:'base',ings:(e.ings||[]).map(i=>({...i}))}));
  const own=(v.elabs||[]).map(e=>({...e,origin:'variant',ings:(e.ings||[]).map(i=>{
    const copy={...i};if(copy.type==='other')copy.ingId=additionsMap.get(String(copy.ingId))??copy.ingId;
    return copy;
  })}));
  return {id:v.id,name:v.name,notes:v.notes||'',flours:(base.flours||[]).map(x=>({...x})),ings,
    elabs:[...inherited,...own],hidInclElabs:base.hidInclElabs,hidPct:base.hidPct};
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
  const stage=variantElabRecipe(v,flourG);
  const effective=effectiveVariantRecipe(v,base);
  const fullCalc=calculateRecipeFormula(effective,totalMass);
  const sum=baseMass+added.reduce((s,a)=>s+a.grams,0);
  const stageTotal=stage.elabCalcs.reduce((s,e)=>s+e.total,0)+stage.finalRows.reduce((s,r)=>s+r.final,0);
  if(Math.abs(sum-totalMass)>0.00001||Math.abs(stageTotal-(totalMass-baseMass))>0.00001)
    throw Error('Error de conservación de masa en «'+v.name+'».');
  return {variant:v,base,baseMass,added,flourG,totalMass,baseCalc,fullCalc,effective,stage};
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
      ${b?`<button class="btn btn-sm" data-id="${esc(b.id)}" onclick="selectRecipe(this.dataset.id)">Ver masa base</button> <button class="btn btn-sm" data-id="${esc(r.id)}" onclick="openGlobalPlanner(this.dataset.id)">Añadir esta variante al plan</button>`:''}</div>
      <div class="variant-mode"><span class="lbl">Modo de elaboración</span>
        <button class="btn btn-sm${(r.productionMode||'base')==='base'?' btn-primary':''}" onclick="changeVariantMode('base')">Desde masa base</button>
        <button class="btn btn-sm${r.productionMode==='scratch'?' btn-primary':''}" onclick="changeVariantMode('scratch')">Desde cero</button></div>`;
  }else{
    const count=recipes.filter(x=>x.baseId===r.id).length;
    el.innerHTML=`<div class="family-action-panel"><div class="family-hint">${count?count+' variante(s) vinculadas':'Puedes utilizar esta receta como masa base'}</div>
      <button class="btn btn-sm" data-id="${esc(r.id)}" onclick="openVariantEditor(null,this.dataset.id)">+ Nueva variante</button>
      <button class="btn btn-primary btn-sm" data-id="${esc(r.id)}" onclick="openGlobalPlanner()">Abrir planificador</button></div>`;
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
  variantElabs=v?(v.elabs||[]).map(e=>({...e,ings:(e.ings||[]).map(i=>({...i}))})):[];
  document.getElementById('variant_base_id').value=bid;
  document.getElementById('variant_name').value=v?v.name:'';
  document.getElementById('variant_notes').value=v?v.notes||'':'';
  document.getElementById('variant_title').textContent=v?'Editar variante':'Nueva variante';
  document.getElementById('variant_base_label').textContent=b.name;
  document.getElementById('variant_inherited').innerHTML=`<div class="field-hint">Harinas: ${(b.flours||[]).map(x=>esc(x.name)+' '+g1(x.pct)+'%').join(' · ')}</div><div class="field-hint">${(b.ings||[]).map(x=>esc(x.name)+' '+g1(x.pct)+'%').join(' · ')}</div><div class="field-hint">${(b.elabs||[]).length?'Elaboraciones heredadas: '+(b.elabs||[]).map(x=>esc(x.name)).join(', '):'Sin elaboraciones previas.'}</div>`;
  renderVariantAdditions();renderVariantElabs();document.getElementById('variant_overlay').classList.add('open');
}
function closeVariantEditor(){document.getElementById('variant_overlay').classList.remove('open');variantEditingId=null;}
function addVariantIngredient(){variantAdditions.push({id:uid(),name:'',pct:0});renderVariantAdditions();renderVariantElabs();}
function removeVariantIngredient(id){variantAdditions=variantAdditions.filter(a=>a.id!==id);renderVariantAdditions();renderVariantElabs();}
function setVariantIngredient(id,field,value){const a=variantAdditions.find(a=>a.id===id);if(a)a[field]=value;if(field==='name')renderVariantElabs();}
function renderVariantAdditions(){
  const el=document.getElementById('variant_ings');
  el.innerHTML=variantAdditions.map(a=>`<div class="addition-row" data-addition-id="${esc(a.id)}">
    <input type="text" aria-label="Ingrediente adicional" placeholder="Agua, semillas, miel…" value="${esc(a.name)}" oninput="setVariantIngredient(this.parentElement.dataset.additionId,'name',this.value)">
    <input type="number" aria-label="Porcentaje adicional" min="0" step="0.01" value="${esc(a.pct)}" oninput="setVariantIngredient(this.parentElement.dataset.additionId,'pct',this.value)">
    <button class="btn btn-icon btn-ghost" aria-label="Eliminar ingrediente" onclick="removeVariantIngredient(this.parentElement.dataset.additionId)">×</button></div>`).join('') || '<div class="field-hint">Añade los ingredientes que incorporarás a la masa base.</div>';
}
// Editor de preelaboraciones propias: reutiliza el modelo de filas other/water
// del editor clásico, restringiendo las fuentes a ingredientes adicionales.
function addVariantElab(){variantElabs.push({id:uid(),name:'',ings:[]});renderVariantElabs();}
function delVariantElab(id){variantElabs=variantElabs.filter(e=>e.id!==id);renderVariantElabs();}
function setVariantElabName(id,name){const e=variantElabs.find(e=>e.id===id);if(e)e.name=name;}
function addVariantElabRow(elabId,type){
  const e=variantElabs.find(x=>x.id===elabId);if(!e)return;
  if(type==='other'){
    if(!variantAdditions.length){alert('Añade primero el ingrediente a la variante.');return;}
    e.ings.push({id:uid(),type:'other',ingId:'addition:'+variantAdditions[0].id,pct:0});
  }else{
    const ref=e.ings.find(x=>x.type==='other');
    if(!ref){alert('Añade antes un ingrediente al escaldado o remojo.');return;}
    e.ings.push({id:uid(),type:'water',baseId:ref.id,pct:100});
  }
  renderVariantElabs();
}
function delVariantElabRow(elabId,rowId){
  const e=variantElabs.find(x=>x.id===elabId);if(!e)return;
  e.ings=e.ings.filter(x=>x.id!==rowId);renderVariantElabs();
}
function setVariantElabRow(elabId,rowId,field,value){
  const e=variantElabs.find(x=>x.id===elabId),r=e?.ings.find(x=>x.id===rowId);
  if(r)r[field]=value;
}
function renderVariantElabs(){
  const el=document.getElementById('variant_elabs');if(!el)return;
  el.innerHTML=variantElabs.map(e=>{
    const sources=e.ings.filter(x=>x.type==='other');
    const rows=e.ings.map(r=>{
      let options='';
      if(r.type==='other')options=variantAdditions.map(a=>`<option value="${esc('addition:'+a.id)}" ${r.ingId==='addition:'+a.id?'selected':''}>${esc(a.name||'Ingrediente sin nombre')}</option>`).join('');
      else options=sources.map(a=>{
        const match=variantAdditions.find(x=>'addition:'+x.id===a.ingId);
        return `<option value="${esc(a.id)}" ${String(r.baseId)===String(a.id)?'selected':''}>${esc(match?.name||'Ingrediente eliminado')}</option>`;
      }).join('');
      return `<div class="variant-elab-row" data-elab-id="${esc(e.id)}" data-row-id="${esc(r.id)}">
        <span class="field-hint">${r.type==='water'?'Agua (% s/ ingrediente)':'Ingrediente (% s/ harina)'}</span>
        <select aria-label="Base de la fila" onchange="setVariantElabRow(this.closest('.variant-elab-row').dataset.elabId,this.closest('.variant-elab-row').dataset.rowId,'${r.type==='water'?'baseId':'ingId'}',this.value)">${options}</select>
        <input aria-label="Porcentaje de elaboración" type="number" min="0" step="0.1" value="${esc(r.pct)}" oninput="setVariantElabRow(this.closest('.variant-elab-row').dataset.elabId,this.closest('.variant-elab-row').dataset.rowId,'pct',this.value)">
        <button class="btn btn-ghost btn-icon" aria-label="Quitar fila" onclick="delVariantElabRow(this.closest('.variant-elab-row').dataset.elabId,this.closest('.variant-elab-row').dataset.rowId)">×</button></div>`;
    }).join('');
    return `<div class="eeb" data-elab-id="${esc(e.id)}"><div class="eeb-header">
      <input class="eeb-name-input" type="text" aria-label="Nombre de elaboración" placeholder="Ej. Escaldado de semillas" value="${esc(e.name)}" oninput="setVariantElabName(this.closest('.eeb').dataset.elabId,this.value)">
      <button class="btn btn-icon btn-danger" aria-label="Eliminar elaboración" onclick="delVariantElab(this.closest('.eeb').dataset.elabId)">×</button></div>
      ${rows||'<div class="field-hint">Sin ingredientes asignados.</div>'}
      <div class="variant-elab-buttons"><button class="btn btn-xs" onclick="addVariantElabRow(this.closest('.eeb').dataset.elabId,'other')">+ Ingrediente</button>
      <button class="btn btn-xs" onclick="addVariantElabRow(this.closest('.eeb').dataset.elabId,'water')">+ Agua</button></div></div>`;
  }).join('')||'<div class="field-hint">Esta variante no tiene elaboraciones exclusivas.</div>';
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
    additions:variantAdditions.map(a=>({id:a.id,name:a.name.trim(),pct:a.pct})),
    elabs:variantElabs.map(e=>({id:e.id,name:e.name.trim(),ings:e.ings.map(i=>({...i}))}))};
  if(v.elabs.some(e=>!e.name||!e.ings.length)){alert('Todas las elaboraciones previas deben tener nombre e ingredientes.');return;}
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
    amasadoData:mode==='scratch'?d.amasadoData:{recipeName:v.name,waterMass:c.stage.waterRemaining,
      ings:[{name:'Masa base: '+c.base.name,mass:c.baseMass,temp:20},...c.stage.finalRows.filter(a=>a.tag!=='water'&&a.final>0).map(a=>({name:a.name,mass:a.final,temp:20})),...c.stage.elabCalcs.filter(e=>e.total>0).map(e=>({name:'Elaboración: '+e.name,mass:e.total,temp:20}))]}};
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
    c.stage.elabCalcs.forEach(e=>{html+=massRow('Elaboración previa: '+e.name,e.total,'Preparada aparte para esta variante');});
    c.stage.finalRows.filter(a=>a.final>0.000001).forEach(a=>{html+=massRow(a.name,a.final,'Pendiente de incorporar');});
    html+=`</div><div class="total-bar"><span class="total-bar-lbl">Masa final</span><span class="total-bar-val">${g1(c.totalMass)} g</span></div>`;
    body.innerHTML=html;
    return;
  }
  // Reutilizar íntegramente el renderizador clásico para el resumen,
  // las elaboraciones heredadas y el modo «desde cero».
  lastCalc={...state,variant:null,r:c.effective};
  try{renderResTab(i);}finally{lastCalc=state;}
  if(i>0&&i<=state.elabCalcs.length&&mode==='base'){
    const inherited=i<=c.baseCalc.elabCalcs.length;
    document.getElementById('d_res_body').insertAdjacentHTML('afterbegin', inherited
      ?'<div class="alert alert-ok show">Esta elaboración ya está incluida en la masa base. No la incorpores de nuevo a la variante.</div>'
      :'<div class="alert alert-warn show">Esta elaboración es exclusiva de la variante. Prepárala aparte y añádela durante la transformación.</div>');
  }
}

// Planificador visual V2 sustituido por el planificador transversal en
// global-planner.js. Se conservan calculateProduction y planFor para
// migración de datos y compatibilidad de las pruebas anteriores.
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
      // Al importar una familia antigua, conservar su plan en el nuevo
      // planificador global en lugar de dejarlo oculto en el modo V2.
      if(typeof globalPlans!=='undefined'&&typeof currentGlobalPlanId!=='undefined'){
        const pid=uid();
        globalPlans[pid]={id:pid,name:'Familia importada: '+(imported.find(x=>x.id===ids.get(String(oldBase)))?.name||'pan'),
          rows:Object.fromEntries(Object.entries(clone.rows||{}).filter(([,r])=>r.enabled).map(([id,r])=>[id,{pieces:r.pieces,weight:r.weight,mode:'base'}])),
          extras:clone.extra>0?{[ids.get(String(oldBase))]:clone.extra}:{}};
        saveGlobalPlans();
      }
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
