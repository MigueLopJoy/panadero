// Exportación XLSX sin servicios, CDN ni dependencias externas.
// Genera un ZIP OpenXML con tablas de producción y fórmulas de Excel.
// Las hojas de detalle documentan la fotografía de la producción exportada.
function productionWorkbookData(calc){
  const pr=[['PLAN DE PRODUCCIÓN · '+calc.base.name],
    ['Variante','Piezas','Peso pieza (g)','Masa final (g)','Harina equivalente (g)','Masa base (g)','Adiciones (g)','Factor base','Adición (%)']];
  let row=3;
  calc.items.forEach(item=>{
    const addPct=item.added.reduce((s,a)=>s+a.pct,0);
    pr.push([item.variant.name,item.pieces,item.weight,
      {formula:`B${row}*C${row}`,value:item.totalMass},
      {formula:`D${row}/(H${row}+I${row}/100)`,value:item.flourG},
      {formula:`E${row}*H${row}`,value:item.baseMass},
      {formula:`D${row}-F${row}`,value:item.added.reduce((s,a)=>s+a.grams,0)},
      calc.baseFactor,addPct]);row++;
  });
  const first=3,last=row-1;
  const sumCol=c=>last>=first?`SUM(${c}${first}:${c}${last})`:'0';
  pr.push(['TOTAL PRODUCCIÓN','','',{formula:sumCol('D'),value:calc.productMass},
    '',{formula:sumCol('F'),value:calc.required},
    {formula:sumCol('G'),value:calc.addedMass},'','']);
  pr.push(['Masa base extra sin asignar (g)','','','','',calc.extra]);
  pr.push(['MASA BASE TOTAL A PREPARAR (g)','','','','',
    {formula:`F${row}+F${row+1}`,value:calc.totalBase}]);
  pr.push(['Información','Pueden editarse las cantidades de la hoja Producción. Las hojas de desglose son una fotografía del cálculo al exportar.']);

  const bf=calc.baseCalc;
  const base=[['INGREDIENTES DE LA MASA BASE · '+calc.base.name],['Ingrediente','Tipo','Porcentaje (%)','Peso total (g)','En masa final (g)','En elaboraciones (g)']];
  bf.summaryRows.forEach((x,i)=>{
    const final=bf.finalRows[i];base.push([x.name,x.tag==='flour'?'Harina':x.tag==='water'?'Agua':'Otro',
      x.pctValue,x.grams,final.final,final.ded]);
  });
  base.push(['TOTAL','','',calc.totalBase,bf.finalRows.reduce((s,x)=>s+x.final,0),bf.elabCalcs.reduce((s,x)=>s+x.total,0)]);

  const elabs=[['ELABORACIONES PREVIAS · PRODUCCIÓN CONJUNTA'],['Elaboración','Ingrediente','Tipo','Referencia del porcentaje','Cantidad (g)']];
  if(!bf.elabCalcs.length)elabs.push(['Sin elaboraciones previas']);
  bf.elabCalcs.forEach(e=>{
    e.ings.forEach(i=>elabs.push([e.name,i.name,i.type,i.pctDesc,i.grams]));
    elabs.push(['TOTAL '+e.name,'','','',e.total]);
  });

  const final=[['MASA FINAL DE LA BASE · TRAS PREELABORACIONES'],['Ingrediente','Tipo','Cantidad (g)','Detalle']];
  bf.finalRows.filter(r=>r.final>0.0000001).forEach(r=>final.push([r.name,r.tag||'otro',r.final,r.ded?'Preelaboración descontada: '+r.ded+' g':'']));
  bf.elabCalcs.forEach(e=>final.push([e.name,'Elaboración previa',e.total,'Ya elaborada e incorporada']));
  final.push(['TOTAL MASA BASE','',calc.totalBase]);

  const reparto=[['REPARTO Y ADICIONES POR VARIANTE'],['Variante','Piezas','Peso pieza (g)','Componente','Porcentaje añadido (%)','Peso (g)','Masa final variante (g)']];
  calc.items.forEach(i=>{
    reparto.push([i.variant.name,i.pieces,i.weight,'Masa base ('+calc.base.name+')','',i.baseMass,i.totalMass]);
    i.added.forEach(a=>reparto.push([i.variant.name,i.pieces,i.weight,a.name,a.pct,a.grams,i.totalMass]));
  });
  reparto.push(['MASA BASE EXTRA SIN ASIGNAR','','','Masa base','',calc.extra,'']);

  const formulations=[['FÓRMULAS COMPLETAS DE LOS PANES'],['Variante','Ingrediente','Tipo','Porcentaje (%)','Cantidad (g)','Procedencia']];
  calc.items.forEach(i=>{
    const inherited=(i.base.ings||[]).map(x=>x.name.trim().toLocaleLowerCase('es'));
    const additions=i.added.map(x=>x.name.trim().toLocaleLowerCase('es'));
    i.fullCalc.summaryRows.forEach(x=>{
      const key=x.name.trim().toLocaleLowerCase('es');
      const origin=x.tag==='flour'||inherited.includes(key)?(additions.includes(key)?'Heredado + adición':'Masa base'):'Adición';
      formulations.push([i.variant.name,x.name,x.tag||'otro',x.pctValue,x.grams,origin]);
    });
  });

  const shopping=[['INGREDIENTES TOTALES PARA LA PRODUCCIÓN (INCLUIDO EXCEDENTE DE BASE)'],['Ingrediente','Cantidad (g)','Cantidad (kg)']];
  productionIngredients(calc).forEach(i=>shopping.push([i.name,i.grams,i.grams/1000]));
  return [
    {name:'Producción',rows:pr},{name:'Masa base',rows:base},
    {name:'Elaboraciones',rows:elabs},{name:'Masa final base',rows:final},
    {name:'Reparto',rows:reparto},{name:'Fórmulas',rows:formulations},
    {name:'Ingredientes totales',rows:shopping}
  ];
}
function xmlEscape(v){return String(v==null?'':v).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
function excelColumn(n){let str='';for(let x=n+1;x>0;x=Math.floor((x-1)/26))str=String.fromCharCode(65+(x-1)%26)+str;return str;}
function sheetXML(sheet){
  const rows=sheet.rows;
  const colCount=Math.max(...rows.map(r=>r.length),1);
  const cols=Array.from({length:colCount},(_,i)=>{
    const max=Math.max(9,...rows.map(r=>Math.min(46,String((r[i]&&typeof r[i]==='object')?r[i].value??'':r[i]??'').length+2)));
    return `<col min="${i+1}" max="${i+1}" width="${Math.min(42,max)}" customWidth="1"/>`;
  }).join('');
  const result=rows.map((cells,ri)=>{
    const cs=cells.map((val,ci)=>{
      if(val===''||val===null||val===undefined)return '';
      const addr=excelColumn(ci)+(ri+1);
      const style=ri===0?'1':ri===1?'2':typeof val==='number'||typeof val==='object'?'3':'0';
      if(val&&typeof val==='object'&&'formula' in val)
        return `<c r="${addr}" s="${style}"><f>${xmlEscape(val.formula)}</f><v>${Number(val.value)||0}</v></c>`;
      if(typeof val==='number'&&Number.isFinite(val))return `<c r="${addr}" s="${style}"><v>${val}</v></c>`;
      return `<c r="${addr}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(val)}</t></is></c>`;
    }).join('');
    return `<row r="${ri+1}"${ri===0?' ht="26" customHeight="1"':''}>${cs}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${result}</sheetData></worksheet>`;
}
function workbookParts(sheets){
  const types=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
  const rels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const wb=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${xmlEscape(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
  const wr=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFC4561A"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const parts=[['[Content_Types].xml',types],['_rels/.rels',rels],['xl/workbook.xml',wb],['xl/_rels/workbook.xml.rels',wr],['xl/styles.xml',styles]];
  sheets.forEach((s,i)=>parts.push([`xl/worksheets/sheet${i+1}.xml`,sheetXML(s)]));
  return parts;
}
// ZIP 2.0, método STORE. Compatible con Excel y LibreOffice, sin librerías.
function crc32(bytes){let crc=0xFFFFFFFF;for(let i=0;i<bytes.length;i++){crc^=bytes[i];for(let j=0;j<8;j++)crc=crc&1?(crc>>>1)^0xEDB88320:crc>>>1;}return (crc^0xFFFFFFFF)>>>0;}
function xlsxBlob(sheets){
  const enc=new TextEncoder(),parts=workbookParts(sheets),chunks=[],central=[];
  let offset=0;
  for(const [path,xml] of parts){
    const name=enc.encode(path),body=enc.encode(xml),crc=crc32(body);
    const local=new Uint8Array(30+name.length),l=new DataView(local.buffer);
    l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0,true);l.setUint16(8,0,true);
    l.setUint32(14,crc,true);l.setUint32(18,body.length,true);l.setUint32(22,body.length,true);l.setUint16(26,name.length,true);local.set(name,30);
    chunks.push(local,body);
    const c=new Uint8Array(46+name.length),d=new DataView(c.buffer);
    d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint32(16,crc,true);
    d.setUint32(20,body.length,true);d.setUint32(24,body.length,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);c.set(name,46);
    central.push(c);offset+=local.length+body.length;
  }
  const centLength=central.reduce((s,c)=>s+c.length,0);chunks.push(...central);
  const end=new Uint8Array(22),dv=new DataView(end.buffer);dv.setUint32(0,0x06054b50,true);
  dv.setUint16(8,parts.length,true);dv.setUint16(10,parts.length,true);
  dv.setUint32(12,centLength,true);dv.setUint32(16,offset,true);chunks.push(end);
  return new Blob(chunks,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function exportProductionExcel(){
  try{
    if(!planBaseId)throw Error('Selecciona una familia.');
    const calc=calculateProduction(planBaseId,planFor(planBaseId));
    if(!calc.items.length)throw Error('Selecciona al menos una variante para exportar.');
    const file=xlsxBlob(productionWorkbookData(calc));
    downloadFile(file,'Produccion_'+safeFileName(calc.base.name)+'.xlsx');
  }catch(e){alert('No se ha podido exportar el Excel: '+e.message);}
}
