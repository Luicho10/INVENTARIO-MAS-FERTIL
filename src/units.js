import { supabase } from './supabase';

const factor = u => String(u).toLowerCase() === 'tn' || String(u).toLowerCase() === 'ton' ? 1000 : 1;
const fmt = n => Number(n || 0).toLocaleString('es-PY', { maximumFractionDigits: 3 });
const normalize = u => factor(u) === 1000 ? 'Tn' : 'kg';

const selectStyle = s => {
  s.style.appearance = 'auto';
  s.style.webkitAppearance = 'auto';
  s.style.cursor = 'pointer';
  s.style.minWidth = '74px';
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

function getUnitForCode(code) {
  const row = [...(document.querySelector('.panel table tbody')?.rows || [])].find(r => r.cells[0]?.textContent.trim() === code);
  return normalize(row?.cells[3]?.querySelector('select')?.value || row?.cells[3]?.textContent.trim() || 'kg');
}

function decorateMatterRows() {
  const main = document.querySelector('main');
  if (!main || main.querySelector('h1')?.textContent?.trim() !== 'Materias Primas') return;
  const table = main.querySelector('.panel table');
  if (!table) return;

  [...table.tBodies[0].rows].forEach(row => {
    const c = row.cells;
    if (!c || c.length < 7) return;
    const code = c[0].textContent.trim();
    let sel = c[3].querySelector('select[data-unit-mp]');

    if (!sel) {
      const current = normalize(c[3].textContent.trim());
      sel = document.createElement('select');
      sel.dataset.unitMp = '1';
      sel.innerHTML = '<option value="kg">Kg</option><option value="Tn">Tn</option>';
      sel.value = current;
      sel.title = 'Unidad de registro';
      selectStyle(sel);
      c[3].textContent = '';
      c[3].appendChild(sel);

      sel.addEventListener('change', async () => {
        const next = normalize(sel.value);
        const previous = current;
        if (!confirm(`Cambiar la unidad de registro de ${code} a ${next}?\n\nEl stock interno seguirá almacenado en kg.`)) {
          sel.value = previous;
          return;
        }
        const r = await supabase.from('materias_primas').update({ unidad: next }).eq('codigo', code);
        if (r.error) {
          alert('No se pudo actualizar la unidad: ' + r.error.message);
          sel.value = previous;
          return;
        }
        location.reload();
      });
    }

    const unit = normalize(sel.value);
    const f = factor(unit);
    [4, 5].forEach(i => {
      if (!c[i]) return;
      if (c[i].dataset.rawKg == null) c[i].dataset.rawKg = String(rawNumber(c[i].textContent));
      const kg = Number(c[i].dataset.rawKg || 0);
      c[i].textContent = fmt(kg / f);
      c[i].title = `${fmt(kg)} kg internos`;
    });
  });
}

function cleanAndStyleAllUnitSelectors() {
  document.querySelectorAll('select').forEach(s => {
    [...s.options].forEach(o => {
      if (/litros|unidades/i.test(o.textContent)) o.remove();
      if (/^ton$/i.test(o.textContent.trim())) o.textContent = 'Tn';
    });
  });

  const modal = document.querySelector('.overlay .modal');
  if (!modal) return;

  // Nueva materia prima: la unidad de registro es obligatoria y solo Kg/Tn.
  const newMpUnit = [...modal.querySelectorAll('label')].find(l => /^Unidad/i.test(l.textContent.trim()) && l.querySelector('select'));
  if (newMpUnit) {
    const s = newMpUnit.querySelector('select');
    selectStyle(s);
    [...s.options].forEach(o => { if (!/^kg$|^tn$|^ton$/i.test(o.textContent.trim())) o.remove(); });
    [...s.options].forEach(o => { if (/^ton$/i.test(o.textContent.trim())) { o.value = 'Tn'; o.textContent = 'Tn'; } });
  }

  // Ajuste manual de materia prima: la cantidad se registra en la unidad elegida.
  const materialLabel = [...modal.querySelectorAll('label')].find(l => /Materia prima/i.test(l.textContent) && l.querySelector('select'));
  if (materialLabel && !modal.querySelector('[data-registration-unit]')) {
    const unitWrap = document.createElement('label');
    unitWrap.dataset.registrationUnit = '1';
    unitWrap.innerHTML = 'Unidad de registro<select><option value="kg">Kg</option><option value="Tn">Tn</option></select></label>';
    const unitSelect = unitWrap.querySelector('select');
    selectStyle(unitSelect);
    const materialSelect = materialLabel.querySelector('select');

    const sync = () => {
      const selected = materialSelect.selectedOptions[0]?.textContent || '';
      const code = selected.split('—')[0].trim();
      unitSelect.value = code ? getUnitForCode(code) : 'kg';
      updateAdjustmentLabels(modal, unitSelect.value);
    };
    materialSelect.addEventListener('change', () => setTimeout(sync, 0));
    unitSelect.addEventListener('change', () => updateAdjustmentLabels(modal, unitSelect.value));
    materialLabel.insertAdjacentElement('afterend', unitWrap);
    sync();
  }
}

function updateAdjustmentLabels(modal, unit) {
  const labels = [...modal.querySelectorAll('label')];
  const qty = labels.find(l => /Nuevo stock|Cantidad/i.test(l.textContent));
  if (qty) {
    const input = qty.querySelector('input');
    const op = [...modal.querySelectorAll('select')].find(s => [...s.options].some(o => /Establecer stock exacto/i.test(o.textContent)))?.value;
    if (input) qty.childNodes[0].textContent = `${op === 'set' ? 'Nuevo stock' : 'Cantidad'} (${unit})`;
  }
}

function improve() {
  cleanAndStyleAllUnitSelectors();
  decorateMatterRows();
}

const obs = new MutationObserver(() => improve());
obs.observe(document.body, { childList: true, subtree: true });
window.addEventListener('load', improve);
setTimeout(improve, 300);
setTimeout(improve, 1000);
