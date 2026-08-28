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

function rawNumber(text) {
  const n = Number(String(text || '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, ''));
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
        if (!confirm(`Cambiar la unidad de registro de ${code} a ${next}?\n\nEl stock físico no cambia, solamente la unidad de presentación.`)) {
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
      if (c[i].dataset.rawKg == null) c[i].dataset.rawKg = String(rawNumber(c[i].textContent));
      const kg = Number(c[i].dataset.rawKg || 0);
      c[i].textContent = fmt(kg / f);
      c[i].title = `Stock interno: ${fmt(kg)} kg`;
    });
  });
}

function cleanModalUnits(modal) {
  const selects = [...modal.querySelectorAll('select')];
  selects.forEach(s => {
    [...s.options].forEach(o => {
      // La ventana Nueva materia prima ya posee sus opciones; no las eliminamos.
      if (/^ton$/i.test(o.textContent.trim())) { o.value = 'Tn'; o.textContent = 'Tn'; }
    });
  });
  const newMpUnit = selects.find(s => /^kg$|^tn$|^ton$/i.test(s.options[0]?.textContent?.trim() || '') && s.closest('label')?.textContent?.trim().startsWith('Unidad'));
  if (newMpUnit) selectStyle(newMpUnit);
}

function setupAdjustmentModal(modal) {
  const labels = [...modal.querySelectorAll('label')];
  const materialLabel = labels.find(l => /Materia prima/i.test(l.textContent) && l.querySelector('select'));
  if (!materialLabel) return;

  let unitWrap = modal.querySelector('[data-registration-unit]');
  if (!unitWrap) {
    unitWrap = document.createElement('label');
    unitWrap.dataset.registrationUnit = '1';
    unitWrap.innerHTML = 'Unidad de registro<select><option value="kg">Kg</option><option value="Tn">Tn</option></select>';
    materialLabel.insertAdjacentElement('afterend', unitWrap);
    selectStyle(unitWrap.querySelector('select'));
  }

  const materialSelect = materialLabel.querySelector('select');
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

function improve() {
  const modal = document.querySelector('.overlay .modal');
  if (modal) {
    cleanModalUnits(modal);
    setupAdjustmentModal(modal);
  }
  decorateMatterTable();
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
