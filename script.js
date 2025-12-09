let gmTemplate = null;
let playerData = {};
let editMode = false;

document.addEventListener('DOMContentLoaded', () => {
  // wire import/export buttons
  document.getElementById('import-btn').addEventListener('click', () => document.getElementById('file-input').click());
  document.getElementById('file-input').addEventListener('change', handleFileImport);
  document.getElementById('export-btn').addEventListener('click', handleExport);

  // wire edit button toggle
  document.getElementById('edit-btn').addEventListener('click', toggleEditMode);

  // load default.json
  fetch('default.json')
    .then(r => r.json())
    .then(data => {
      gmTemplate = data.set_by_gm || data;
      // initialize playerData with empty attributes
      playerData.attributes = (gmTemplate.attributes || []).map(() => ({ points: 0, sub_attributes: [] }));
      renderAll();
    })
    .catch(err => {
      console.error('Fehler beim Laden von default.json', err);
      alert('Konnte default.json nicht laden. Stelle sicher, dass die Datei vorhanden ist und die Seite über einen Server läuft.');
    });
});

function toggleEditMode() {
  editMode = !editMode;
  const btn = document.getElementById('edit-btn');
  btn.dataset.active = editMode ? 'true' : 'false';
  renderAttributes();
  updatePointsDisplay();
}

function renderAll() {
  if (!gmTemplate) return;
  renderOtherPlayers();
  renderInfos();
  renderScales();
  renderAttributes();
  renderFreetexts();
  updatePointsDisplay();
}

function renderOtherPlayers() {
  const container = document.getElementById('other-players');
  container.innerHTML = '';
  for (let i = 1; i <= 4; i++) {
    const key = 'other_player' + i;
    const box = document.createElement('div');
    box.className = 'box textareabox';
    const ta = document.createElement('textarea');
    ta.placeholder = gmTemplate[key] || '';
    ta.dataset.key = key;
    box.appendChild(ta);
    container.appendChild(box);
  }
}

function renderInfos() {
  const left = document.getElementById('infos-left');
  left.innerHTML = '';
  for (let i = 1; i <= 3; i++) {
    const key = 'info' + i;
    const box = document.createElement('div');
    box.className = 'box info-single';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = gmTemplate[key] || '';
    input.dataset.key = key;
    box.appendChild(input);
    left.appendChild(box);
  }

  const mid = document.getElementById('info4');
  mid.innerHTML = '';
  const key4 = 'info4';
  const box4 = document.createElement('div');
  box4.className = 'box info-big textareabox';
  const ta4 = document.createElement('textarea');
  ta4.placeholder = gmTemplate[key4] || '';
  ta4.dataset.key = key4;
  box4.appendChild(ta4);
  mid.appendChild(box4);
}

function renderScales() {
  const r = document.getElementById('scales');
  r.innerHTML = '';
  for (let i = 1; i <= 3; i++) {
    const key = 'scale' + i;
    const box = document.createElement('div');
    box.className = 'box';
    const row = document.createElement('div');
    row.className = 'scale-row';
    const lbl = document.createElement('div');
    lbl.textContent = gmTemplate[key] || key;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = 0; input.max = 100;
    input.value = 0;
    input.dataset.key = key;
    row.appendChild(lbl);
    row.appendChild(input);
    box.appendChild(row);
    r.appendChild(box);
  }
}

function renderAttributes() {
  // clear columns
  for (let c = 1; c <= 3; c++) document.getElementById('attr-col-' + c).innerHTML = '';

  // show/hide attr-points-row based on editMode
  document.getElementById('attr-points-row').style.display = editMode ? 'flex' : 'none';

  const attrs = gmTemplate.attributes || [];
  attrs.forEach((attr, idx) => {
    const col = (attr.column || 1);
    const container = document.getElementById('attr-col-' + col);
    const box = document.createElement('div');
    box.className = 'box attr-box color-' + (attr.color || 1);
    const span = document.createElement('div');
    span.textContent = attr.name || ('Attr ' + (idx + 1));
    
    // Get stored value from playerData
    const storedValue = playerData.attributes && playerData.attributes[idx] ? playerData.attributes[idx].points : 0;
    
    if (editMode) {
      // Show input field
      const input = document.createElement('input');
      input.type = 'number';
      input.min = 0;
      input.max = 999;
      input.dataset.attrIndex = idx;
      input.dataset.key = 'attribute_' + idx;
      input.style.width = '80px';
      input.value = storedValue;
      input.addEventListener('input', (e) => {
        // Save to playerData immediately
        if (!playerData.attributes) playerData.attributes = [];
        if (!playerData.attributes[idx]) playerData.attributes[idx] = { points: 0, sub_attributes: [] };
        playerData.attributes[idx].points = Number(e.target.value || 0);
        updatePointsDisplay();
      });
      box.appendChild(span);
      box.appendChild(input);
    } else {
      // Show label with stored value
      const label = document.createElement('div');
      label.className = 'attr-value-label';
      label.textContent = storedValue || '0';
      box.appendChild(span);
      box.appendChild(label);
    }
    
    container.appendChild(box);
  });
}

function updatePointsDisplay() {
  const row = document.getElementById('attr-points-row');
  if (!row || !editMode) return;
  
  let totalPoints = 0;
  if (playerData.attributes) {
    playerData.attributes.forEach((a) => {
      totalPoints += Number(a.points || 0);
    });
  }
  
  const maxPoints = gmTemplate.attribute_points || 150;
  const label = document.getElementById('attr-points-label');
  if (label) label.textContent = `Grundwerte ${totalPoints}/${maxPoints}`;
}

function renderFreetexts() {
  const container = document.getElementById('freetexts');
  container.innerHTML = '';
  for (let i = 1; i <= 6; i++) {
    const key = 'freetext' + i;
    const box = document.createElement('div');
    box.className = 'box textareabox';
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = gmTemplate[key] || key;
    const ta = document.createElement('textarea');
    ta.dataset.key = key;
    box.appendChild(label);
    box.appendChild(ta);
    container.appendChild(box);
  }
}

function handleExport() {
  if (!gmTemplate) return alert('Noch keine Vorlage geladen');
  const out = { set_by_gm: gmTemplate, set_by_player: {} };

  // infos and freetexts and other players and scales
  ['info1','info2','info3','info4'].forEach(k => out.set_by_player[k] = getValueByKey(k));
  for (let i=1;i<=6;i++) out.set_by_player['freetext'+i] = getValueByKey('freetext'+i);
  for (let i=1;i<=4;i++) out.set_by_player['other_player'+i] = getValueByKey('other_player'+i);
  for (let i=1;i<=3;i++) out.set_by_player['scale'+i] = getValueByKey('scale'+i);

  // attributes from playerData
  out.set_by_player.attributes = (playerData.attributes || []).map(a => ({
    points: a.points || 0,
    sub_attributes: a.sub_attributes || []
  }));

  const blob = new Blob([JSON.stringify(out, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  // filename: yyyy_mm_dd-hh_mm-<charname>.json
  const now = new Date();
  const pad = (n) => String(n).padStart(2,'0');
  const y = now.getFullYear();
  const mo = pad(now.getMonth()+1);
  const d = pad(now.getDate());
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  let name = getValueByKey('info1') || getValueByKey('info1') || '';
  name = (name || 'character').toString().trim();
  // sanitize name to safe filename
  name = name.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_\-]/g,'');
  a.href = url; a.download = `${y}_${mo}_${d}-${hh}_${mm}_${name}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function getValueByKey(key) {
  const el = document.querySelector(`[data-key='${key}']`);
  if (!el) return '';
  if (el.tagName === 'INPUT') return el.value;
  return el.value || '';
}

function handleFileImport(e) {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const json = JSON.parse(ev.target.result);
      applyImported(json);
    } catch (err) {
      alert('Ungültige JSON-Datei');
    }
  };
  reader.readAsText(f);
  // reset input so same file can be selected again
  e.target.value = '';
}

function applyImported(json) {
  // if set_by_gm present, replace template and re-render labels
  if (json.set_by_gm) {
    gmTemplate = json.set_by_gm;
    renderAll();
  }
  const sp = json.set_by_player || json;
  if (!sp) return;

  // fill simples
  ['info1','info2','info3','info4'].forEach(k => setInputValue(k, sp[k] || ''));
  for (let i=1;i<=6;i++) setInputValue('freetext'+i, sp['freetext'+i] || '');
  for (let i=1;i<=4;i++) setInputValue('other_player'+i, sp['other_player'+i] || '');
  for (let i=1;i<=3;i++) setInputValue('scale'+i, sp['scale'+i] || '');

  // attributes array - store in playerData and re-render
  if (Array.isArray(sp.attributes)) {
    playerData.attributes = sp.attributes.map(a => ({
      points: a.points || 0,
      sub_attributes: a.sub_attributes || []
    }));
    renderAttributes();
    updatePointsDisplay();
  }
}

function setInputValue(key, value) {
  const el = document.querySelector(`[data-key='${key}']`);
  if (!el) return;
  el.value = value;
}
