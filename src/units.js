import { supabase } from './supabase';

const factor = u => String(u).toLowerCase() === 'tn' || String(u).toLowerCase() === 'ton' ? 1000 : 1;
const normalize = u => factor(u) === 1000 ? 'Tn' : 'kg';
const fmt = n => Number(n || 0).toLocaleString('es-PY', { maximumFractionDigits: 3 });

/*
  La base guarda las existencias de materias primas en kg.
  La unidad configurada (Kg/Tn) es la unidad de registro y de presentación.
  Por eso:
    10 Tn registrados = 10.000 kg internos
    500 kg registrados = 500 kg internos
*/
function selectedAdjustmentUnit() {
  const modal = document.querySelector('.overlay .modal');
  const s = modal?.querySelector('[data-registration-unit] select');
  return normalize(s?.value || 'kg');
}

function adjustmentOperation() {
  const modal = document.querySelector('.overlay .modal');
  const s = [...(modal?.querySelectorAll('select') || [])].find(x => [...x.options].some(o => /Establecer stock exacto/i.test(o.textContent)));
  return s?.value || 'set';
}

function adjustmentQuantity() {
  const modal = document.querySelector('.overlay .modal');
  const labels = [...(modal?.querySelectorAll('label') || [])];
  const label = labels.find(l => /Nuevo stock|Cantidad/i.test(l.textContent) && l.querySelector('input[type="number"]'));
  return Number(label?.querySelector('input')?.value || 0);
}

function selectedMaterialId() {
  const modal = document.querySelector('.overlay .modal');
  const labels = [...(modal?.querySelectorAll('label') || [])];
  const label = labels.find(l => /Materia prima/i.test(l.textContent) && l.querySelector('select'));
  return label?.querySelector('select')?.value || '';
}

function internalStockFromTable(id) {
  const modal = document.querySelector('.overlay .modal');
  const material = [...(modal?.querySelectorAll('label') || [])].find(l => /Materia prima/i.test(l.textContent) && l.querySelector('select'))?.querySelector('select');
  const option = [...(material?.options || [])].find(o => o.value === String(id));
  const code = option?.textContent?.split('—')[0]?.trim();
  const row = [...(document.querySelector('.panel table tbody')?.rows || [])].find(r => r.cells[0]?.textContent.trim() === code);
  if (!row) return null;
  const cell = row.cells[4];
  if (!cell) return null;
  if (cell.dataset.rawKg != null) return Number(cell.dataset.rawKg);
  return Number(String(cell.textContent).replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;
}

let pendingMpAdjustment = null;
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url || '';
  const method = String(init.method || input?.method || 'GET').toUpperCase();
  let body = null;
  try { body = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch {}

  if (body && /\/rest\/v1\/materias_primas(?:\?|$)/.test(url)) {
    if (method === 'POST' && body.unidad) {
      const f = factor(body.unidad);
      body.unidad = normalize(body.unidad);
      body.stock_inicial = Number(body.stock_inicial || 0) * f;
      body.stock_minimo = Number(body.stock_minimo || 0) * f;
      init = { ...init, body: JSON.stringify(body) };
    }

    if ((method === 'PATCH' || method === 'PUT') && body.stock_inicial != null) {
      const idMatch = url.match(/[?&]id=eq\.([^&]+)/);
      const id = idMatch ? decodeURIComponent(idMatch[1]) : selectedMaterialId();
      const unit = selectedAdjustmentUnit();
      const op = adjustmentOperation();
      const q = adjustmentQuantity();
      const cur = internalStockFromTable(id);
      const currentKg = cur == null ? 0 : cur;
      const nextKg = op === 'set' ? q * factor(unit) : op === 'add' ? currentKg + q * factor(unit) : currentKg - q * factor(unit);
      if (nextKg < 0) return new Response(JSON.stringify({ error: 'El stock no puede quedar negativo' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      body.stock_inicial = nextKg;
      pendingMpAdjustment = { diffKg: nextKg - currentKg };
      init = { ...init, body: JSON.stringify(body) };
    }
  }

  if (body && /\/rest\/v1\/movimientos_inventario(?:\?|$)/.test(url) && pendingMpAdjustment && /AJUSTE MANUAL MATERIA PRIMA/i.test(body.tipo || '')) {
    body.cantidad_kg = pendingMpAdjustment.diffKg;
    pendingMpAdjustment = null;
    init = { ...init, body: JSON.stringify(body) };
  }

  return nativeFetch(input, init);
};

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

function rawNumber(text) {
  const n = Number(String(text || '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function unitForCode(code) {
  const row = [...(document.querySelector('.panel table tbody')?.rows || [])].find(r => r.cells[0]?.textContent.trim() === code);
  return normalize(row?.cells[3]?.querySelector('select[data-unit-mp]')?.value || row?.cells[3]?.textContent.trim() || 'kg');
}

function decorateMatterTable() {
  const main = document.querySelector('main');
  if (!main || main.querySelector('h1')?.textContent.trim() !== 'Materias Primas') return;
  const table = main.querySelector('.panel table');
  if (!table?.tBodies[0]) return;

  [...table.tBodies[0].rows].forEach(row => {
    const c = row.cells;
    if (!c || c.length < 7) return;
    const code = c[0].textContent.trim();
    let s = c[3].querySelector('select[data-unit-mp]');
    if (!s) {
      s = document.createElement('select');
      s.dataset.unitMp = '1';
      s.innerHTML = '<option value="kg">Kg</option><option value="Tn">Tn</option>';
      s.value = normalize(c[3].textContent.trim());
      s.title = 'Unidad de registro';
      selectStyle(s);
      c[3].replaceChildren(s);
      s.addEventListener('change', async () => {
        const next = normalize(s.value);
        const old = normalize(s.dataset.previous || 'kg');
        if (!confirm(`Cambiar la unidad de registro de ${code} a ${next}?\n\nEl stock físico no cambia: se convertirá solamente la unidad de registro.`)) {
          s.value = old;
          return;
        }
        const r = await supabase.from('materias_primas').update({ unidad: next }).eq('codigo', code);
        if (r.error) { alert('No se pudo actualizar la unidad: ' + r.error.message); s.value = old; return; }
        location.reload();
      });
    }
    s.dataset.previous = s.value;
    const f = factor(s.value);
    [4,5].forEach(i => {
      if (!c[i]) return;
      if (c[i].dataset.rawKg == null) c[i].dataset.rawKg = String(rawNumber(c[i].textContent));
      const kg = Number(c[i].dataset.rawKg || 0);
      c[i].textContent = fmt(kg / f);
      c[i].title = `Stock interno: ${fmt(kg)} kg`;
    });
  });
}

function cleanSelectors() {
  document.querySelectorAll('select').forEach(s => {
    [...s.options].forEach(o => {
      if (/litros|unidades/i.test(o.textContent)) o.remove();
      if (/^ton$/i.test(o.textContent.trim())) { o.value = 'Tn'; o.textContent = 'Tn'; }
    });
  });

  const modal = document.querySelector('.overlay .modal');
  if (!modal) return;

  const newUnit = [...modal.querySelectorAll('label')].find(l => /^Unidad/i.test(l.textContent.trim()) && l.querySelector('select'));
  if (newUnit) {
    const s = newUnit.querySelector('select');
    [...s.options].forEach(o => { if (!/^kg$|^tn$|^ton$/i.test(o.textContent.trim())) o.remove(); });
    [...s.options].forEach(o => { if (/^ton$/i.test(o.textContent.trim())) { o.value = 'Tn'; o.textContent = 'Tn'; } });
    selectStyle(s);
  }

  const materialLabel = [...modal.querySelectorAll('label')].find(l => /Materia prima/i.test(l.textContent) && l.querySelector('select'));
  if (materialLabel && !modal.querySelector('[data-registration-unit]')) {
    const wrap = document.createElement('label');
    wrap.dataset.registrationUnit = '1';
    wrap.innerHTML = 'Unidad de registro<select><option value="kg">Kg</option><option value="Tn">Tn</option></select></label>';
    const unitSelect = wrap.querySelector('select');
    selectStyle(unitSelect);
    const materialSelect = materialLabel.querySelector('select');

    const sync = () => {
      const option = materialSelect.selectedOptions[0];
      const code = option?.textContent?.split('—')[0]?.trim();
      unitSelect.value = code ? unitForCode(code) : 'kg';
      updateAdjustmentLabels(modal, unitSelect.value);
    };
    materialSelect.addEventListener('change', () => setTimeout(sync, 0));
    unitSelect.addEventListener('change', () => updateAdjustmentLabels(modal, unitSelect.value));
    materialLabel.insertAdjacentElement('afterend', wrap);
    sync();
  }

  // Reaccionar a la operación para mantener la etiqueta correcta.
  [...modal.querySelectorAll('select')].forEach(s => s.addEventListener('change', () => updateAdjustmentLabels(modal, selectedAdjustmentUnit())));
}

function updateAdjustmentLabels(modal, unit) {
  const labels = [...modal.querySelectorAll('label')];
  const qty = labels.find(l => /Nuevo stock|Cantidad/i.test(l.textContent) && l.querySelector('input[type="number"]'));
  const op = [...modal.querySelectorAll('select')].find(s => [...s.options].some(o => /Establecer stock exacto/i.test(o.textContent)))?.value;
  if (qty) qty.childNodes[0].textContent = `${op === 'set' ? 'Nuevo stock' : 'Cantidad'} (${unit})`;
  const current = modal.querySelector('.current');
  if (current) {
    const id = selectedMaterialId();
    const kg = internalStockFromTable(id);
    if (kg != null) current.innerHTML = `Stock actual: <strong>${fmt(kg / factor(unit))} ${unit}</strong>`;
  }
  const calc = modal.querySelector('.calc');
  const input = qty?.querySelector('input');
  if (calc && input && idValid(selectedMaterialId())) {
    const kg = internalStockFromTable(selectedMaterialId());
    const q = Number(input.value || 0);
    const next = op === 'set' ? q : op === 'add' ? (kg || 0) / factor(unit) + q : (kg || 0) / factor(unit) - q;
    calc.innerHTML = `Stock resultante: <strong>${fmt(next)} ${unit}</strong>`;
  }
}

function idValid(id) { return id !== ''; }

function improve() {
  cleanSelectors();
  decorateMatterTable();
}

const observer = new MutationObserver(improve);
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener('load', improve);
setTimeout(improve, 300);
setTimeout(improve, 1000);
