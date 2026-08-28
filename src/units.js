import { supabase } from './supabase';

const factor = u => String(u).toLowerCase() === 'tn' || String(u).toLowerCase() === 'ton' ? 1000 : 1;
const fmt = n => Number(n || 0).toLocaleString('es-PY', { maximumFractionDigits: 3 });
const normalize = u => factor(u) === 1000 ? 'Tn' : 'kg';

let pendingAdjustment = null;

function getUnitFromTable(code) {
  const main = document.querySelector('main');
  const table = main?.querySelector('.panel table');
  const row = [...(table?.tBodies[0]?.rows || [])].find(r => r.cells[0]?.textContent.trim() === code);
  const select = row?.cells[3]?.querySelector('select');
  return normalize(select?.value || row?.cells[3]?.textContent.trim() || 'kg');
}

function getAdjustmentUnit() {
  const modal = document.querySelector('.overlay .modal');
  if (!modal) return 'kg';
  const labels = [...modal.querySelectorAll('label')];
  const unitLabel = labels.find(l => /Unidad de registro/i.test(l.textContent));
  return normalize(unitLabel?.querySelector('select')?.value || 'kg');
}

function getAdjustmentOperation() {
  const modal = document.querySelector('.overlay .modal');
  if (!modal) return 'set';
  const selects = [...modal.querySelectorAll('select')];
  const op = selects.find(s => [...s.options].some(o => /Establecer stock exacto/i.test(o.textContent)));
  return op?.value || 'set';
}

function parseBody(init) {
  try {
    if (!init?.body) return null;
    return typeof init.body === 'string' ? JSON.parse(init.body) : null;
  } catch { return null; }
}

function requestUrl(input) {
  return typeof input === 'string' ? input : input?.url || '';
}

const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const url = requestUrl(input);
  const body = parseBody(init);

  if (body && /\/rest\/v1\/materias_primas(?:\?|$)/.test(url)) {
    const method = String(init.method || input?.method || 'GET').toUpperCase();

    if (method === 'POST' && body.unidad) {
      const unit = normalize(body.unidad);
      body.unidad = unit;
      const f = factor(unit);
      if (f !== 1) {
        if (body.stock_inicial != null) body.stock_inicial = Number(body.stock_inicial || 0) * f;
        if (body.stock_minimo != null) body.stock_minimo = Number(body.stock_minimo || 0) * f;
      }
      init = { ...init, body: JSON.stringify(body) };
    }

    if ((method === 'PATCH' || method === 'PUT') && body.stock_inicial != null) {
      const codeMatch = url.match(/[?&]codigo=eq\.([^&]+)/);
      const idMatch = url.match(/[?&]id=eq\.([^&]+)/);
      const code = codeMatch ? decodeURIComponent(codeMatch[1]) : '';
      const unit = getAdjustmentUnit() || (code ? getUnitFromTable(code) : 'kg');
      const f = factor(unit);
      const entered = Number(body.stock_inicial || 0);
      if (f !== 1) body.stock_inicial = entered * f;
      pendingAdjustment = {
        unit,
        factor: f,
        entered,
        operation: getAdjustmentOperation(),
        id: idMatch ? idMatch[1] : null
      };
      init = { ...init, body: JSON.stringify(body) };
    }
  }

  if (body && /\/rest\/v1\/movimientos_inventario(?:\?|$)/.test(url) && pendingAdjustment && /AJUSTE MANUAL MATERIA PRIMA/i.test(body.tipo || '')) {
    const p = pendingAdjustment;
    const rawDiff = Number(body.cantidad_kg || 0);
    const diffKg = p.operation === 'set'
      ? rawDiff + p.entered * (p.factor - 1)
      : rawDiff * p.factor;
    body.cantidad_kg = diffKg;
    pendingAdjustment = null;
    init = { ...init, body: JSON.stringify(body) };
  }

  return nativeFetch(input, init);
};

function cleanUnitOptions() {
  document.querySelectorAll('select').forEach(s => {
    [...s.options].forEach(o => {
      if (/litros|unidades/i.test(o.textContent)) o.remove();
      if (/^ton$/i.test(o.textContent)) o.textContent = 'Tn';
    });
  });
}

function addRegistrationUnitToAdjustment(modal) {
  const labels = [...modal.querySelectorAll('label')];
  const materialLabel = labels.find(l => /Materia prima/i.test(l.textContent) && l.querySelector('select'));
  if (!materialLabel || modal.querySelector('[data-registration-unit]')) return;

  const unitWrap = document.createElement('label');
  unitWrap.dataset.registrationUnit = '1';
  unitWrap.innerHTML = 'Unidad de registro<select><option value="kg">Kg</option><option value="Tn">Tn</option></select></label>';
  const select = unitWrap.querySelector('select');
  const materialSelect = materialLabel.querySelector('select');

  const sync = () => {
    const code = materialSelect.selectedOptions[0]?.textContent?.split('—')[0]?.trim();
    const unit = code ? getUnitFromTable(code) : 'kg';
    select.value = unit;
    refreshAdjustmentTexts(modal, unit);
  };
  materialSelect.addEventListener('change', () => setTimeout(sync, 0));
  select.addEventListener('change', () => refreshAdjustmentTexts(modal, normalize(select.value)));
  materialLabel.insertAdjacentElement('afterend', unitWrap);
  sync();
}

function refreshAdjustmentTexts(modal, unit) {
  const f = factor(unit);
  const labels = [...modal.querySelectorAll('label')];
  const qtyLabel = labels.find(l => /Nuevo stock|Cantidad/i.test(l.textContent));
  if (qtyLabel) {
    const input = qtyLabel.querySelector('input');
    const op = [...modal.querySelectorAll('select')].find(s => [...s.options].some(o => /Establecer stock exacto/i.test(o.textContent)))?.value;
    if (input) qtyLabel.childNodes[0].textContent = (op === 'set' ? 'Nuevo stock' : 'Cantidad') + ` (${unit})`;
  }
  const current = modal.querySelector('.current');
  if (current) {
    const m = current.textContent.match(/([\d.,-]+)\s*kg/i);
    if (m) {
      const raw = Number(m[1].replace(/\./g, '').replace(',', '.'));
      current.innerHTML = `Stock actual: <strong>${fmt(raw / f)} ${unit}</strong>`;
    }
  }
}

function improve() {
  cleanUnitOptions();
  const main = document.querySelector('main');
  if (!main) return;

  if (main.querySelector('h1')?.textContent?.trim() === 'Materias Primas') {
    const table = main.querySelector('.panel table');
    const rows = table?.tBodies[0]?.rows || [];
    rows.forEach(row => {
      const cells = row.cells;
      if (cells.length < 7) return;
      if (!cells[3].querySelector('select')) {
        const code = cells[0].textContent.trim();
        const select = document.createElement('select');
        select.innerHTML = '<option value="kg">Kg</option><option value="Tn">Tn</option>';
        select.value = normalize(cells[3].textContent.trim());
        select.title = 'Unidad de registro y visualización';
        select.addEventListener('change', async () => {
          const next = normalize(select.value);
          const ok = confirm(`Cambiar la unidad de registro de ${code} a ${next}? El stock interno se conservará en kg.`);
          if (!ok) { select.value = normalize(cells[3].textContent.trim()); return; }
          const r = await supabase.from('materias_primas').update({ unidad: next }).eq('codigo', code);
          if (r.error) alert('No se pudo actualizar la unidad: ' + r.error.message);
          else location.reload();
        });
        cells[3].textContent = '';
        cells[3].appendChild(select);
      }
      const unit = normalize(cells[3].querySelector('select')?.value || 'kg');
      const f = factor(unit);
      [4, 5].forEach(i => {
        const raw = parseFloat(cells[i].dataset.raw || cells[i].textContent.replace(/\./g, '').replace(',', '.'));
        if (Number.isFinite(raw)) {
          cells[i].dataset.raw = raw;
          cells[i].textContent = fmt(raw / f);
        }
      });
    });
  }

  const modal = document.querySelector('.overlay .modal');
  if (modal) {
    addRegistrationUnitToAdjustment(modal);
  }
}

const obs = new MutationObserver(improve);
obs.observe(document.body, { childList: true, subtree: true });
window.addEventListener('load', improve);
setTimeout(improve, 500);
