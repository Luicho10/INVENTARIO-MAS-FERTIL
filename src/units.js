import { supabase } from './supabase';

const factor = u => String(u).toLowerCase() === 'tn' || String(u).toLowerCase() === 'ton' ? 1000 : 1;
const normalize = u => factor(u) === 1000 ? 'Tn' : 'kg';
const fmt = n => Number(n || 0).toLocaleString('es-PY', { maximumFractionDigits: 3 });

const selectStyle = s => {
  s.style.appearance = 'auto';
  s.style.webkitAppearance = 'auto';
  s.style.cursor = 'pointer';
  s.style.minWidth = '78px';
  s.style.padding = '5px 8px';
  s.style.border = '1px solid #c9d4ce';
  s.style.borderRadius = '6px';
  s.style.backgroundColor = '#fff';
  s.style.fontWeight = '600';
};

function parseLocaleNumber(text) {
  const value = String(text || '').trim();
  if (!value) return 0;
  const n = Number(value.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function getMatterUnit(code) {
  const row = [...(document.querySelector('.panel table tbody')?.rows || [])].find(r => r.cells[0]?.textContent.trim() === code);
  return normalize(row?.cells[3]?.querySelector('select[data-unit-mp]')?.value || row?.cells[3]?.textContent.trim() || 'kg');
}

function decorateMatterTable() {
  const main = document.querySelector('main');
  if (!main || main.querySelector('h1')?.textContent?.trim() !== 'Materias Primas') return;
  const table = main.querySelector('.panel table');
  if (!table?.tBodies[0]) return;

  [...table.tBodies[0].rows].forEach(row => {
    const c = row.cells;
    if (!c || c.length < 7) return;
    const code = c[0].textContent.trim();
    let s = c[3].querySelector('select[data-unit-mp]');
    if (!s) {
      const current = normalize(c[3].textContent.trim());
      s = document.createElement('select');
      s.dataset.unitMp = '1';
      s.innerHTML = '<option value="kg">Kg</option><option value="Tn">Tn</option>';
      s.value = current;
      s.dataset.previous = current;
      s.title = 'Unidad de registro';
      selectStyle(s);
      c[3].replaceChildren(s);
      s.addEventListener('change', async () => {
        const next = normalize(s.value);
        const previous = normalize(s.dataset.previous || 'kg');
        if (!confirm(`Cambiar la unidad de registro de ${code} a ${next}?\n\nEl stock físico no cambia; solamente cambia la unidad en que se muestra y registra.`)) {
          s.value = previous;
          return;
        }
        const r = await supabase.from('materias_primas').update({ unidad: next }).eq('codigo', code);
        if (r.error) {
          alert('No se pudo actualizar la unidad: ' + r.error.message);
          s.value = previous;
          return;
        }
        s.dataset.previous = next;
        location.reload();
      });
    }

    const unit = normalize(s.value);
    const f = factor(unit);
    [4, 5].forEach(i => {
      if (!c[i]) return;
      if (c[i].dataset.rawKg == null) c[i].dataset.rawKg = String(parseLocaleNumber(c[i].textContent));
      const kg = Number(c[i].dataset.rawKg || 0);
      c[i].textContent = fmt(kg / f);
      c[i].title = `Stock interno: ${fmt(kg)} kg`;
    });
  });
}

function decorateDashboard() {
  const main = document.querySelector('main');
  if (!main || main.querySelector('h1')?.textContent?.trim() !== 'Dashboard') return;
  const card = main.querySelector('.cards .card strong');
  const rows = [...(main.querySelector('.panel table tbody')?.rows || [])];
  if (!card || !rows.length) return;

  const data = rows.map(row => {
    const stockCell = row.cells[3];
    if (!stockCell) return null;
    const text = stockCell.textContent.trim();
    const match = text.match(/^([\d.,-]+)\s*(kg|Tn|ton)?$/i);
    if (!match) return null;
    const unit = normalize(match[2] || 'kg');
    const storedKg = parseLocaleNumber(match[1]);
    return { storedKg, unit };
  }).filter(Boolean);
  if (!data.length) return;

  const units = [...new Set(data.map(x => x.unit))];
  data.forEach((x, i) => {
    const row = rows[i];
    const cell = row?.cells[3];
    if (cell) cell.textContent = fmt(x.storedKg / factor(x.unit)) + ' ' + x.unit;
  });

  if (units.length === 1) {
    const unit = units[0];
    const total = data.reduce((sum, x) => sum + x.storedKg / factor(unit), 0);
    card.textContent = `${fmt(total)} ${unit}`;
    card.title = 'Total de materias primas en la unidad seleccionada';
  } else {
    const totalKg = data.reduce((sum, x) => sum + x.storedKg, 0);
    card.textContent = `${fmt(totalKg)} kg`;
    card.title = 'Total físico de materias primas; se muestra en kg porque existen unidades mixtas';
  }
}

function cleanModalUnits(modal) {
  const selects = [...modal.querySelectorAll('select')];
  selects.forEach(s => {
    [...s.options].forEach(o => {
      if (/^ton$/i.test(o.textContent.trim())) { o.value = 'Tn'; o.textContent = 'Tn'; }
    });
  });
  const newMpUnit = selects.find(s => /^kg$|^tn$|^ton$/i.test(s.options[0]?.textContent?.trim() || '') && s.closest('label')?.textContent?.trim().startsWith('Unidad'));
  if (newMpUnit) selectStyle(newMpUnit);
}

function adjustmentElements(modal) {
  const labels = [...modal.querySelectorAll('label')];
  const materialLabel = labels.find(l => /Materia prima/i.test(l.textContent) && l.querySelector('select'));
  const opSelect = [...modal.querySelectorAll('select')].find(s => [...s.options].some(o => /Establecer stock exacto/i.test(o.textContent)));
  const qtyLabel = labels.find(l => /Nuevo stock|Cantidad/i.test(l.textContent) && l.querySelector('input[type="number"]'));
  const reason = labels.find(l => /Justificación/i.test(l.textContent) && l.querySelector('textarea'))?.querySelector('textarea');
  return {materialSelect:materialLabel?.querySelector('select'),opSelect,qtyInput:qtyLabel?.querySelector('input[type="number"]'),reason};
}

function setupAdjustmentModal(modal) {
  const {materialSelect} = adjustmentElements(modal);
  if (!materialSelect) return;

  let unitWrap = modal.querySelector('[data-registration-unit]');
  if (!unitWrap) {
    unitWrap = document.createElement('label');
    unitWrap.dataset.registrationUnit = '1';
    unitWrap.innerHTML = 'Unidad de registro<select><option value="kg">Kg</option><option value="Tn">Tn</option></select>';
    materialSelect.closest('label').insertAdjacentElement('afterend', unitWrap);
    selectStyle(unitWrap.querySelector('select'));
  }

  const unitSelect = unitWrap.querySelector('select');
  const sync = () => {
    const option = materialSelect.selectedOptions[0];
    const code = option?.textContent?.split('—')[0]?.trim();
    unitSelect.value = code ? getMatterUnit(code) : 'kg';
    updateAdjustmentLabels(modal, unitSelect.value);
  };
  if (!materialSelect.dataset.unitSync) {
    materialSelect.dataset.unitSync = '1';
    materialSelect.addEventListener('change', () => setTimeout(sync, 0));
  }
  if (!unitSelect.dataset.unitSync) {
    unitSelect.dataset.unitSync = '1';
    unitSelect.addEventListener('change', () => updateAdjustmentLabels(modal, unitSelect.value));
  }
  sync();
}

function updateAdjustmentLabels(modal, unit) {
  const labels = [...modal.querySelectorAll('label')];
  const qty = labels.find(l => /Nuevo stock|Cantidad/i.test(l.textContent) && l.querySelector('input[type="number"]'));
  const operation = [...modal.querySelectorAll('select')].find(s => [...s.options].some(o => /Establecer stock exacto/i.test(o.textContent)))?.value;
  if (qty) qty.childNodes[0].textContent = `${operation === 'set' ? 'Nuevo stock' : 'Cantidad'} (${unit})`;
}

async function saveAdjustmentFromUnits(modal) {
  const {materialSelect,opSelect,qtyInput,reason} = adjustmentElements(modal);
  const unitSelect = modal.querySelector('[data-registration-unit] select');
  const id = Number(materialSelect?.value || 0);
  const q = Number(qtyInput?.value || 0);
  const op = opSelect?.value || 'set';
  const unit = normalize(unitSelect?.value || 'kg');
  const factorUnit = factor(unit);
  const motivo = String(reason?.value || '').trim();
  if (!id || q < 0 || !motivo) return {ok:false,message:'Seleccione una materia prima, cantidad y justificación.'};

  const currentResult = await supabase.from('materias_primas').select('id,nombre,unidad,stock_inicial').eq('id',id).single();
  if (currentResult.error || !currentResult.data) return {ok:false,message:currentResult.error?.message||'No se pudo leer la materia prima.'};
  const x = currentResult.data;
  const currentKg = Number(x.stock_inicial || 0);
  const quantityKg = q * factorUnit;
  const nextKg = op === 'set' ? quantityKg : op === 'add' ? currentKg + quantityKg : currentKg - quantityKg;
  if (nextKg < 0) return {ok:false,message:'El stock no puede quedar negativo.'};
  const diffKg = nextKg - currentKg;

  const update = await supabase.from('materias_primas').update({stock_inicial:nextKg}).eq('id',id);
  if (update.error) return {ok:false,message:update.error.message};
  const movement = await supabase.from('movimientos_inventario').insert({tipo:'AJUSTE MANUAL MATERIA PRIMA',material_id:id,producto_id:null,cantidad_kg:diffKg,detalle:motivo});
  if (movement.error) return {ok:false,message:movement.error.message};
  return {ok:true};
}

function interceptAdjustmentSave() {
  const modal = document.querySelector('.overlay .modal');
  if (!modal || !/Carga \/ ajuste manual de materia prima/i.test(modal.querySelector('.modalhead h2')?.textContent || '')) return;
  if (modal.dataset.adjustSaveBound === '1') return;
  const buttons = [...modal.querySelectorAll('button')];
  const saveButton = buttons.find(b => /^Guardar ajuste$/i.test(b.textContent.trim()));
  if (!saveButton) return;
  modal.dataset.adjustSaveBound = '1';
  saveButton.addEventListener('click', async e => {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (saveButton.dataset.saving === '1') return;
    saveButton.dataset.saving = '1';
    saveButton.disabled = true;
    const result = await saveAdjustmentFromUnits(modal);
    if (!result.ok) {
      alert(result.message);
      saveButton.disabled = false;
      saveButton.dataset.saving = '0';
      return;
    }
    location.reload();
  }, true);
}

function improve() {
  const modal = document.querySelector('.overlay .modal');
  if (modal) {
    cleanModalUnits(modal);
    setupAdjustmentModal(modal);
    interceptAdjustmentSave();
  }
  decorateMatterTable();
  decorateDashboard();
}

let scheduled = false;
const observer = new MutationObserver(() => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    improve();
  });
});
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener('load', improve);
setTimeout(improve, 300);
setTimeout(improve, 1000);
