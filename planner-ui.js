// PAN & AGUA · Guía de elaboración del planificador (V8)
// Presentación separada del motor de cálculo: nunca modifica recetas ni masas.
let planSelectedFamily=null;
let planSelectedStage=null;
let planSelectedPane='final';
const PLAN_EPSILON=0.00001;

// Modelo puramente derivado del cálculo global. Una familia = raíz de la genealogía.
// Los amasados desde cero se presentan como etapas independientes de su familia.
function buildPlanPresentation(calc){
  const families=new Map();
  const ensure=(r)=>{
    const root=getFamilyRoot(r),id=String(root.id);
    if(!families.has(id))families.set(id,{id,name:root.name,stages:[],mass:0});
    return families.get(id);
  };
  for(const g of calc.groups){
    const f=ensure(g.base);
    const direct=calc.items.filter(i=>String(i.recipe.id)===String(g.base.id)&&(i.type==='independent'||i.mode==='base'));
    const childBatches=calc.groups.filter(next=>next.parent&&String(next.parent.id)===String(g.base.id));
    const allocations=[
      ...direct.map(i=>({name:'Panes terminados: '+i.recipe.name,grams:i.totalMass,kind:'product'})),
      ...childBatches.map(child=>({name:'Transformar en '+child.base.name,grams:child.parentMass,kind:'downstream'})),
      ...(g.extra>0?[{name:'Masa sobrante sin asignar',grams:g.extra,kind:'extra'}]:[])
    ];
    const allocated=allocations.reduce((s,a)=>s+a.grams,0);
    if(Math.abs(allocated-g.totalBase)>PLAN_EPSILON)
      throw Error('El reparto de «'+g.base.name+'» no coincide con la masa preparada.');
    const elabs=g.mode==='root'?g.baseCalc.elabCalcs:g.stage.elabCalcs;
    const pending=g.mode==='root'?g.baseCalc.finalRows:g.stage.finalRows;
    const inherited=g.mode==='transform'?[{name:'Masa anterior: '+g.parent.name,grams:g.parentMass,kind:'parent'}]:[];
    const inputs=g.mode==='root'?g.baseCalc.summaryRows.map(r=>({name:r.name,grams:r.grams,pct:r.pct,tag:r.tag})):
      [...inherited,...g.added.map(a=>({name:a.name,grams:a.grams,pct:g1(a.pct)+'% añadido',tag:'new'}))];
    const rawMass=inputs.reduce((s,r)=>s+r.grams,0);
    const actualMass=inherited.reduce((s,r)=>s+r.grams,0)+pending.reduce((s,r)=>s+r.final,0)+elabs.reduce((s,e)=>s+e.total,0);
    if(Math.abs(rawMass-g.totalBase)>PLAN_EPSILON||Math.abs(actualMass-g.totalBase)>PLAN_EPSILON)
      throw Error('Los componentes de «'+g.base.name+'» no suman la masa preparada.');
    f.stages.push({id:'stage:'+g.base.id,name:g.base.name,depth:recipeDepth(g.base),kind:g.mode,recipe:g.base,
      parent:g.parent||null,grams:g.totalBase,required:g.required,extra:g.extra,inputs,pending,elabs,inherited,allocations,
      formula:g.baseCalc.summaryRows,group:g});
  }
  for(const i of calc.items.filter(i=>i.type==='variant'&&i.mode==='scratch')){
    const f=ensure(i.recipe),c=i.calc;
    const actual=c.finalRows.reduce((s,r)=>s+r.final,0)+c.elabCalcs.reduce((s,e)=>s+e.total,0);
    if(Math.abs(actual-i.totalMass)>PLAN_EPSILON)throw Error('La elaboración independiente «'+i.recipe.name+'» no cuadra.');
    f.stages.push({id:'scratch:'+i.recipe.id,name:i.recipe.name+' · desde cero',depth:recipeDepth(i.recipe),kind:'scratch',
      recipe:i.recipe,parent:null,grams:i.totalMass,required:i.totalMass,extra:0,
      inputs:c.summaryRows.map(r=>({name:r.name,grams:r.grams,pct:r.pct,tag:r.tag})),pending:c.finalRows,
      elabs:c.elabCalcs,inherited:[],allocations:[{name:i.pieces+' × '+g1(i.weight)+' g',grams:i.totalMass,kind:'product'}],
      formula:c.summaryRows,group:null});
  }
  for(const f of families.values()){
    f.stages.sort((a,b)=>a.depth-b.depth||(a.kind==='scratch'?1:0)-(b.kind==='scratch'?1:0));
    f.mass=calc.items.filter(i=>String(getFamilyRoot(i.recipe).id)===f.id).reduce((s,i)=>s+i.totalMass,0);
  }
  const firstIndex=new Map();
  calc.items.forEach((i,index)=>{
    const id=String(getFamilyRoot(i.recipe).id);
    if(!firstIndex.has(id))firstIndex.set(id,index);
  });
  return [...families.values()].sort((a,b)=>(firstIndex.get(a.id)??Infinity)-(firstIndex.get(b.id)??Infinity));
}
function planSwitchFamily(id){
  planSelectedFamily=String(id);planSelectedStage=null;planSelectedPane='final';renderGlobalResults();
  const nav=document.querySelector('.plan-family-tabs'),active=nav?.querySelector('.plan-family-tab.active');
  if(active)nav.scrollLeft=active.offsetLeft-nav.offsetLeft-8;
  active?.focus({preventScroll:true});
}
function planSwitchStage(id){
  planSelectedStage=String(id);planSelectedPane='final';renderGlobalResults();
  // Mantener a la vista la etapa seleccionada en las tiras horizontales.
  const nav=document.querySelector('.plan-stage-tabs'),active=nav?.querySelector('.plan-stage-tab.active');
  if(active)nav.scrollLeft=active.offsetLeft-nav.offsetLeft-8;
  active?.focus({preventScroll:true});
}
function planSwitchPane(pane){
  if(!['ingredients','elabs','final','share'].includes(pane))return;
  planSelectedPane=pane;renderGlobalResults();
  document.querySelector('.plan-pane-tab.active')?.focus({preventScroll:true});
}
function planRowWithDeduction(row){
  const amount=row.final??row.grams;
  const hint=row.ded>PLAN_EPSILON?`Total ${g1(row.total)} g · empleado en elaboraciones: −${g1(row.ded)} g`:row.pct||'';
  return massRow(row.name,amount,hint);
}
function planElabList(elabs){
  if(!elabs.length)return '<div class="plan-empty-section">No hay elaboraciones previas en esta etapa. Todos los ingredientes se incorporan directamente.</div>';
  return elabs.map((e,j)=>`<article class="plan-elab-card"><div class="plan-elab-head"><span class="plan-step-number">${j+1}</span><strong>${esc(e.name)}</strong><span class="plan-elab-total">${g1(e.total)} g</span></div>
    ${e.ings.map(x=>massRow(x.name,x.grams,x.pctDesc||'')).join('')}
    <div class="plan-mini-total">Preparar ${esc(e.name)}: <strong>${g1(e.total)} g</strong></div></article>`).join('');
}
function planStepContent(stage){
  const elabMass=stage.elabs.reduce((s,e)=>s+e.total,0);
  const pendingMass=stage.pending.reduce((s,r)=>s+r.final,0);
  const ancestorMass=stage.inherited.reduce((s,r)=>s+r.grams,0);
  const prefix=`<div class="plan-mass-balance" aria-label="Balance de masa"><span>Objetivo de esta etapa</span><strong>${g1(stage.grams)} g</strong></div>`;
  if(planSelectedPane==='ingredients'){
    return prefix+`<div class="plan-panel-note">Composición completa de <strong>esta etapa de trabajo</strong>, antes de separar ingredientes para elaboraciones previas. Las masas anteriores ya están preparadas.</div>
      <div class="card plan-result-card">${stage.inputs.map(x=>massRow(x.name,x.grams,x.pct|| (x.kind==='parent'?'Masa preparada en una etapa anterior':''))).join('')}</div>
      ${stage.kind==='transform'?`<details class="plan-formula-details"><summary>Consultar la fórmula completa de ${esc(stage.recipe.name)}</summary><div class="card">${stage.formula.map(r=>massRow(r.name,r.grams,r.pct||'')).join('')}</div><p class="plan-help">La fórmula completa es informativa: sus ingredientes heredados ya están dentro de la masa anterior y no se vuelven a pesar.</p></details>`:''}`;
  }
  if(planSelectedPane==='elabs'){
    return prefix+`<div class="plan-panel-note">Prepara estas elaboraciones <strong>antes del amasado final</strong>. Sus ingredientes ya están descontados de la pestaña «Masa final».</div>
      ${planElabList(stage.elabs)}`;
  }
  if(planSelectedPane==='share'){
    return prefix+`<div class="plan-panel-note">Distribución de la masa preparada en esta etapa. Las cantidades incluyen los destinos de masa compartida y el excedente, si lo hay.</div>
      <div class="card plan-result-card">${stage.allocations.map(a=>massRow(a.name,a.grams)).join('')}
      <div class="plan-mini-total">Total distribuido: <strong>${g1(stage.grams)} g</strong></div></div>`;
  }
  // Pantalla operativa por defecto: solo se pesa lo que falta por incorporar.
  let html=prefix+'<div class="plan-panel-note">Instrucciones para el amasado final. Los ingredientes destinados a las elaboraciones previas <strong>ya están descontados</strong>.</div>';
  if(stage.elabs.length){
    html+=`<div class="plan-prep-reminder"><strong>Antes de amasar: ${stage.elabs.length} elaboración${stage.elabs.length===1?'':'es'} previa${stage.elabs.length===1?'':'s'}</strong>
      <div>${stage.elabs.map(e=>`${esc(e.name)} · ${g1(e.total)} g`).join(' · ')}</div>
      <button type="button" class="btn btn-sm" onclick="planSwitchPane('elabs')">Ver cómo prepararlas →</button></div>`;
  }
  html+='<div class="card plan-result-card"><div class="plan-result-caption">Incorporar al amasado</div>';
  html+=stage.inherited.map(i=>massRow(i.name,i.grams,'Masa ya preparada')).join('');
  html+=stage.pending.filter(x=>x.final>PLAN_EPSILON).map(planRowWithDeduction).join('');
  html+=stage.elabs.filter(e=>e.total>PLAN_EPSILON).map(e=>massRow('Elaboración previa: '+e.name,e.total,'Preparada aparte, incorporar completa')).join('');
  html+=`<div class="plan-mini-total">Masa final a obtener <strong>${g1(stage.grams)} g</strong></div></div>`;
  html+=`<div class="plan-balance-caption">Balance: ${g1(ancestorMass)} g de masa anterior + ${g1(pendingMass)} g pendientes + ${g1(elabMass)} g en elaboraciones = ${g1(stage.grams)} g.</div>`;
  if(stage.group){
    const water=stage.kind==='root'?stage.group.baseCalc.amasadoData.waterMass:stage.group.stage.waterRemaining;
    if(water>PLAN_EPSILON)html+=`<button class="btn btn-sm plan-water-button" data-id="${esc(stage.recipe.id)}" onclick="sendGlobalBaseToAmasado(this.dataset.id)">Calcular temperatura del agua para esta etapa</button>`;
  }
  return html;
}
function renderPlanExperience(calc){
  const families=buildPlanPresentation(calc),allId='shopping';
  if(!families.some(f=>f.id===planSelectedFamily)&&planSelectedFamily!==allId)planSelectedFamily=families[0]?.id||null;
  const chosen=families.find(f=>f.id===planSelectedFamily);
  if(chosen&&!chosen.stages.some(s=>s.id===planSelectedStage))planSelectedStage=chosen.stages[0]?.id||null;
  const stage=chosen?.stages.find(s=>s.id===planSelectedStage);
  let html=`<div class="plan-overview"><div><span>Producción programada</span><strong>${g1(calc.productMass)} g</strong></div>
    <div><span>Ingredientes totales, incluidos excedentes</span><strong>${g1(calc.purchasedMass)} g</strong></div></div>
    <div class="plan-guide-heading"><div><div class="card-hdr">Guía de producción</div><h2>Elige una familia</h2></div><span>${families.length} familia${families.length===1?'':'s'}</span></div>
    <div class="plan-family-tabs" role="tablist" aria-label="Familias de producción">`;
  for(const f of families)html+=`<button type="button" role="tab" aria-selected="${f.id===planSelectedFamily}" class="plan-family-tab${f.id===planSelectedFamily?' active':''}" data-id="${esc(f.id)}" onclick="planSwitchFamily(this.dataset.id)"><strong>${esc(f.name)}</strong><span>${f.stages.length} etapa${f.stages.length===1?'':'s'} · ${g1(f.mass)} g en panes</span></button>`;
  html+=`<button type="button" role="tab" aria-selected="${planSelectedFamily===allId}" class="plan-family-tab${planSelectedFamily===allId?' active':''}" onclick="planSwitchFamily('shopping')"><strong>Ingredientes totales</strong><span>Lista consolidada de compra</span></button></div>`;
  if(!chosen){
    html+='<section class="plan-display-panel"><div class="plan-panel-note">Ingredientes para toda la producción, contabilizados una sola vez aunque haya prefermentos o masas compartidas.</div><div class="card plan-result-card">';
    html+=calc.ingredientRows.map(r=>massRow(r.name,r.grams)).join('');
    html+=`<div class="plan-mini-total">Total ingredientes <strong>${g1(calc.purchasedMass)} g</strong></div></div></section>`;
    return html;
  }
  html+=`<section class="plan-display-panel" role="tabpanel"><div class="plan-guide-heading"><div><div class="card-hdr">${esc(chosen.name)}</div><h2>Selecciona la etapa de trabajo</h2></div></div>
    <div class="plan-stage-tabs" role="tablist" aria-label="Etapas de ${esc(chosen.name)}">`;
  for(const [j,s] of chosen.stages.entries()){
    const sub=s.kind==='root'?'Amasado original':s.kind==='scratch'?'Preparación independiente':'Transformación de masa';
    html+=`<button type="button" role="tab" aria-selected="${s.id===planSelectedStage}" class="plan-stage-tab${s.id===planSelectedStage?' active':''}" data-id="${esc(s.id)}" onclick="planSwitchStage(this.dataset.id)"><span class="plan-stage-index">${j+1}</span><span><strong>${esc(s.name)}</strong><small>${sub} · ${g1(s.grams)} g</small></span></button>`;
  }
  html+='</div>';
  if(stage){
    const desc=stage.kind==='root'?'Preparación de la masa original':stage.kind==='scratch'?'Elaboración desde cero, independiente de las masas compartidas':'Transformación desde '+stage.parent.name;
    html+=`<div class="plan-stage-header"><div class="plan-stage-type">${esc(desc)}</div><h3>${esc(stage.name)}</h3><p>${stage.elabs.length?`${stage.elabs.length} elaboración${stage.elabs.length===1?'':'es'} previa${stage.elabs.length===1?'':'s'} por preparar`:'Sin elaboraciones previas en esta etapa'}</p></div>`;
    const panes=[['ingredients','Ingredientes'],['elabs','Elaboraciones'],['final','Masa final'],['share','Reparto']];
    html+='<div class="plan-pane-tabs" role="tablist" aria-label="Instrucciones de etapa">';
    for(const [id,name] of panes)html+=`<button type="button" role="tab" aria-selected="${id===planSelectedPane}" class="plan-pane-tab${id===planSelectedPane?' active':''}" onclick="planSwitchPane('${id}')">${name}</button>`;
    html+=`</div><div class="plan-step-content" role="tabpanel" aria-live="polite">${planStepContent(stage)}</div>`;
  }
  html+='</section>';
  return html;
}
