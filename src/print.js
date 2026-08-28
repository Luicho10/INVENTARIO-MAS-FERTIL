export function imprimirReporte(tipo){
  const esc=s=>String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const main=document.querySelector('main');
  const table=main?.querySelector('.panel table');
  if(!table){alert('No hay datos para imprimir.');return}
  const title=tipo==='materias'?'Inventario de Materias Primas':tipo==='produccion'?'Órdenes de Producción':tipo==='productos'?'Productos Terminados':'Historial de Movimientos';
  const clone=table.cloneNode(true);
  clone.querySelectorAll('button').forEach(b=>b.remove());
  clone.querySelectorAll('select').forEach(s=>{
    const selected=s.options[s.selectedIndex];
    const span=document.createElement('span');
    span.textContent=selected?.textContent?.trim()||s.value||'';
    span.className='print-unit';
    s.replaceWith(span)
  });
  // En Materias Primas, la unidad visible es la unidad de registro seleccionada (Kg/Tn).
  // La impresión toma exactamente ese valor del formulario, evitando que vuelva a mostrar Kg.
  if(tipo==='materias'){
    const originalRows=[...(table.tBodies[0]?.rows||[])];
    const printRows=[...(clone.tBodies[0]?.rows||[])];
    originalRows.forEach((row,i)=>{
      const unit=row.cells[3]?.querySelector('select[data-unit-mp]')?.value;
      if(unit && printRows[i]?.cells[3]) printRows[i].cells[3].textContent=unit==='Tn'?'Tn':'Kg';
    });
  }
  const w=window.open('','_blank','width=1000,height=800');
  if(!w){alert('El navegador bloqueó la ventana de impresión.');return}
  w.document.open();
  w.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>'+esc(title)+'</title><style>body{font-family:Arial,sans-serif;color:#17231e;padding:28px}h1{font-size:24px;margin:0 0 5px}h2{font-size:16px;font-weight:400;margin:0 0 18px}p{font-size:11px;color:#66756d;margin:0 0 16px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:8px 7px;border:1px solid #d5ddd8}th{background:#f1f4f2;font-weight:700}.print-unit{font-weight:600}.firma{margin-top:55px;display:flex;justify-content:space-between}.firma div{width:35%;border-top:1px solid #777;padding-top:6px;font-size:11px}@media print{body{padding:10mm}}</style></head><body><h1>MAS FERTIL SAE</h1><h2>'+esc(title)+'</h2><p>Fecha de impresión: '+new Date().toLocaleString('es-PY')+'</p>'+clone.outerHTML+'<div class="firma"><div>Responsable</div><div>Control / Administración</div></div><script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>');
  w.document.close()
}
