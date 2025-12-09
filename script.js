let gmTemplate = null;
let playerData = {};
let editMode = false;
let expandMode = false;
let ecMode = false; // Erfolgsklassen toggle
let crewVisible = false;
let bgVisible = false;

document.addEventListener('DOMContentLoaded', () => {
  // wire import/export buttons
  document.getElementById('import-btn').addEventListener('click', () => document.getElementById('file-input').click());
  document.getElementById('file-input').addEventListener('change', handleFileImport);
  document.getElementById('export-btn').addEventListener('click', handleExport);

  // wire edit button toggle
  document.getElementById('edit-btn').addEventListener('click', toggleEditMode);
  
  // wire expand button toggle
  document.getElementById('toggle-btn').addEventListener('click', toggleExpandMode);

  // wire Erfolgsklassen toggle (affects view-mode labels)
  const ecBtn = document.getElementById('ec-btn');
  if (ecBtn) ecBtn.addEventListener('click', toggleEcMode);

  // wire crew/background toggles
  const crewBtn = document.getElementById('crew-btn');
  if (crewBtn) crewBtn.addEventListener('click', () => { crewVisible = !crewVisible; updateVisibility(); });
  const bgBtn = document.getElementById('bg-btn');
  if (bgBtn) bgBtn.addEventListener('click', () => { bgVisible = !bgVisible; updateVisibility(); });

  // load default.json
  fetch('default.json')
    .then(r => r.json())
    .then(data => {
      applyImported(data);
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

function toggleExpandMode() {
  expandMode = !expandMode;
  const btn = document.getElementById('toggle-btn');
  btn.dataset.active = expandMode ? 'true' : 'false';
  renderAttributes();
}

function toggleEcMode() {
  ecMode = !ecMode;
  const btn = document.getElementById('ec-btn');
  if (btn) btn.dataset.active = ecMode ? 'true' : 'false';
  // only affects view-mode labels
  if (!editMode) renderAttributes();
}

function renderAll() {
  if (!gmTemplate) return;
  renderOtherPlayers();
  renderInfos();
  renderScales();
  renderAttributes();
  renderFreetexts();
  updateVisibility();
  updatePointsDisplay();
}

function updateVisibility() {
  const other = document.getElementById('other-players');
  const crewBtn = document.getElementById('crew-btn');
  if (other) other.style.display = crewVisible ? '' : 'none';
  if (crewBtn) crewBtn.dataset.active = crewVisible ? 'true' : 'false';

  const freetexts = document.getElementById('freetexts');
  const bgBtn = document.getElementById('bg-btn');
  if (freetexts) freetexts.style.display = bgVisible ? '' : 'none';
  if (bgBtn) bgBtn.dataset.active = bgVisible ? 'true' : 'false';
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
    ta.className = 'other-player';
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

    if (i == 1) input.className += ' info-char-name';
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
    
    // Main attribute box
    const box = document.createElement('div');
    box.className = 'box attr-box color-' + (attr.color || 1);
    box.dataset.attrMainIdx = idx;
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
      input.className = 'attr-value-input';
      //input.style.width = '80px';
      input.value = storedValue;
      input.addEventListener('input', (e) => {
        // Save to playerData immediately
        if (!playerData.attributes) playerData.attributes = [];
        if (!playerData.attributes[idx]) playerData.attributes[idx] = { points: 0, sub_attributes: [] };
        playerData.attributes[idx].points = Number(e.target.value || 0);
        updatePointsDisplay();
        updateAttributePointLabels(); // only update labels, don't re-render
        validateAttributeInput(input, idx); // check min/max bounds
      });
      validateAttributeInput(input, idx); // initial validation
            // add subattribute button
      if (expandMode) {
        const addBtn = document.createElement('button');
        addBtn.className = 'sub-add-btn';
        addBtn.title = 'Subattribut hinzufügen';
        addBtn.textContent = '+';
        addBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            addSubAttribute(idx);
        });
        box.appendChild(addBtn);
      }

      span.style.flex=1;
      box.appendChild(span);
      box.appendChild(input);
    } else {
      // Show label with stored value
      const label = document.createElement('div');
      label.className = 'attr-value-label';
      label.dataset.attrLabel = idx;
      if (ecMode) {
        const right = Number(storedValue || 0);
        const left = Math.round(right / 5);
        const mid = Math.round(right / 2);
        label.innerHTML = `<span class="ec-light">${left} / ${mid}</span> / <span>${right}</span>`;
      } else {
        label.textContent = storedValue || '0';
      }
      box.appendChild(span);
      box.appendChild(label);
    }
    
    container.appendChild(box);

    // Render subattributes if in expandMode
    if (expandMode) {
      const subAttrs = playerData.attributes && playerData.attributes[idx] ? playerData.attributes[idx].sub_attributes : [];
      subAttrs.forEach((subAttr, subIdx) => {
        renderSubAttribute(container, idx, subIdx, attr.color || 1);
      });
    }
  });
}

function addSubAttribute(attrIdx) {
  if (!playerData.attributes) playerData.attributes = [];
  if (!playerData.attributes[attrIdx]) playerData.attributes[attrIdx] = { points: 0, sub_attributes: [] };
  playerData.attributes[attrIdx].sub_attributes.push({ name: '', points: 0 });
  renderAttributes();
  updatePointsDisplay();
  // focus the new subattr name input
  const newIndex = playerData.attributes[attrIdx].sub_attributes.length - 1;
  const selector = `[data-sub-input="${attrIdx}-${newIndex}"]`;
  const el = document.querySelector(selector);
  if (el) el.focus();
}

function removeSubAttribute(attrIdx, subIdx) {
  if (!playerData.attributes || !playerData.attributes[attrIdx]) return;
  playerData.attributes[attrIdx].sub_attributes.splice(subIdx, 1);
  renderAttributes();
  updatePointsDisplay();
}

function updateAttributePointLabels() {
  // Update all attribute and sub-attribute point labels without re-rendering
  const attrs = gmTemplate.attributes || [];
  attrs.forEach((attr, idx) => {
    // Update main attribute label
    const mainLabel = document.querySelector(`[data-attr-label="${idx}"]`);
    if (mainLabel) {
      const storedValue = playerData.attributes && playerData.attributes[idx] ? playerData.attributes[idx].points : 0;
      if (ecMode) {
        const right = Number(storedValue || 0);
        const left = Math.round(right / 5);
        const mid = Math.round(right / 2);
        mainLabel.innerHTML = `<span class="ec-light">${left}/${mid}</span>/<span>${right}</span>`;
      } else {
        mainLabel.textContent = storedValue || '0';
      }
    }
    
    // Update sub-attribute labels
    if (expandMode) {
      const subAttrs = playerData.attributes && playerData.attributes[idx] ? playerData.attributes[idx].sub_attributes : [];
      subAttrs.forEach((subAttr, subIdx) => {
        const subLabel = document.querySelector(`[data-sub-label="${idx}-${subIdx}"]`);
        if (subLabel) {
          const mainPoints = playerData.attributes[idx].points || 0;
          const subPoints = subAttr.points || 0;
          const sum = mainPoints + subPoints;
          if (ecMode) {
            const right = Number(sum || 0);
            const left = Math.round(right / 5);
            const mid = Math.round(right / 2);
            subLabel.innerHTML = `<span class="ec-light">${left}/${mid}</span>/<span>${right}</span>`;
          } else {
            subLabel.textContent = sum;
          }
        }
      });
    }
  });
}

function renderSubAttribute(container, attrIdx, subAttrIdx, parentColor) {
  const subAttr = playerData.attributes[attrIdx].sub_attributes[subAttrIdx];
  const box = document.createElement('div');
  box.className = 'box attr-box sub-attr-box color-' + parentColor + '-light';
  
  if (editMode) {
    //box.className += ' sub-attr-box-edit';

    // Edit mode: name input + value input + total label
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    // nameInput.placeholder = 'Subattribut-Name';
    nameInput.value = subAttr.name || '';
    nameInput.dataset.subInput = `${attrIdx}-${subAttrIdx}`;
    nameInput.addEventListener('input', (e) => {
      playerData.attributes[attrIdx].sub_attributes[subAttrIdx].name = e.target.value;
    });
    
    const valueInput = document.createElement('input');
    valueInput.type = 'number';
    valueInput.min = 0;
    valueInput.max = 999;
    valueInput.value = subAttr.points || 0;
    valueInput.className = 'sub-attr-value-input';
    //valueInput.style.width = '60px';
    valueInput.dataset.subInputVal = `${attrIdx}-${subAttrIdx}`;
    valueInput.addEventListener('input', (e) => {
      playerData.attributes[attrIdx].sub_attributes[subAttrIdx].points = Number(e.target.value || 0);
      updateAttributePointLabels(); // only update labels, don't re-render
      updatePointsDisplay(); // update specialization points
      validateSubAttributeInput(valueInput); // check max bound
    });
    validateSubAttributeInput(valueInput); // initial validation
    
    const totalLabel = document.createElement('div');
    totalLabel.className = 'attr-value-label';
    totalLabel.dataset.subLabel = `${attrIdx}-${subAttrIdx}`;
    const mainPoints = playerData.attributes[attrIdx].points || 0;
    const subPoints = subAttr.points || 0;
    totalLabel.textContent = mainPoints + subPoints;
    
    // delete button for this subattribute
    const delBtn = document.createElement('button');
    delBtn.className = 'sub-del-btn';
    delBtn.title = 'Subattribut entfernen';
    delBtn.textContent = '-';//'×';
    delBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      removeSubAttribute(attrIdx, subAttrIdx);
    });

    box.appendChild(delBtn);
    box.appendChild(nameInput);
    box.appendChild(valueInput);
    box.appendChild(totalLabel);
  } else {
    // View mode: name + total label
    const nameLabel = document.createElement('div');
    nameLabel.textContent = subAttr.name || '';
    //nameLabel.className = 'flex';
    
    const totalLabel = document.createElement('div');
    totalLabel.className = 'attr-value-label';
    totalLabel.dataset.subLabel = `${attrIdx}-${subAttrIdx}`;
    const mainPoints = playerData.attributes[attrIdx].points || 0;
    const subPoints = subAttr.points || 0;
    const sum = mainPoints + subPoints;
    if (ecMode) {
      const right = Number(sum || 0);
      const left = Math.round(right / 5);
      const mid = Math.round(right / 2);
      totalLabel.innerHTML = `<span class="ec-light">${left} / ${mid}</span> / <span>${right}</span>`;
    } else {
      totalLabel.textContent = sum;
    }
    
    box.appendChild(nameLabel);
    box.appendChild(totalLabel);
  }
  
  container.appendChild(box);
}

function validateAttributeInput(inputEl, attrIdx) {
  const val = Number(inputEl.value || 0);
  const minVal = gmTemplate.attribute_points_min || 10;
  const maxVal = gmTemplate.attribute_points_max || 80;
  
  if (val < minVal || val > maxVal) {
    inputEl.classList.add('warning');
  } else {
    inputEl.classList.remove('warning');
  }
}

function validateSubAttributeInput(inputEl) {
  // Mark the corresponding total label red if (attribute points + this sub) > max
  const ds = inputEl.dataset.subInputVal || '';
  const parts = ds.split('-');
  if (parts.length < 2) return;
  const attrIdx = Number(parts[0]);
  const subIdx = Number(parts[1]);
  const subVal = Number(inputEl.value || 0);
  const mainVal = (playerData.attributes && playerData.attributes[attrIdx]) ? Number(playerData.attributes[attrIdx].points || 0) : 0;
  const sum = mainVal + subVal;
  const maxVal = gmTemplate.sub_attribute_points_max || 80;
  const label = document.querySelector(`[data-sub-label="${attrIdx}-${subIdx}"]`);
  if (!label) return;
  if (sum > maxVal) {
    label.classList.add('warning');
  } else {
    label.classList.remove('warning');
  }
}

function updatePointsDisplay() {
  const row = document.getElementById('attr-points-row');
  if (!row || !editMode) return;
  
  let totalPoints = 0;
  let totalSubPoints = 0;
  if (playerData.attributes) {
    playerData.attributes.forEach((a) => {
      totalPoints += Number(a.points || 0);
      // Sum all subattribute points
      if (a.sub_attributes) {
        a.sub_attributes.forEach((sub) => {
          totalSubPoints += Number(sub.points || 0);
        });
      }
    });
  }
  
  const maxPoints = gmTemplate.attribute_points || 150;
  const maxSubPoints = gmTemplate.sub_attribute_points || 250;
  const label = document.getElementById('attr-points-label');
  if (label) {
    label.textContent = `Grundwerte ${totalPoints}/${maxPoints}`;
    if (totalPoints > maxPoints) {
      label.classList.add('warning');
    } else {
      label.classList.remove('warning');
    }
  }
  
  const subLabel = document.getElementById('sub-attr-points-label');
  if (subLabel) {
    subLabel.textContent = `Spezialisierung ${totalSubPoints}/${maxSubPoints}`;
    if (totalSubPoints > maxSubPoints) {
      subLabel.classList.add('warning');
    } else {
      subLabel.classList.remove('warning');
    }
  }
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
  const sp = json.set_by_player;

  if (!sp) {
    // initialize playerData with empty attributes
    playerData.attributes = (gmTemplate.attributes || []).map(() => ({ points: 0, sub_attributes: [] }));
    // fill scales with initial values from gmTemplate
    for (let i=1;i<=3;i++) {
      const initialKey = 'scale_initial' + i;
      if (gmTemplate[initialKey]) {
        setInputValue('scale' + i, gmTemplate[initialKey]);
      }
    }
    if (!editMode) {
        toggleEditMode();
    }
    return;
  }

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

  if (editMode) {
    toggleEditMode();
  }

}

function setInputValue(key, value) {
  const el = document.querySelector(`[data-key='${key}']`);
  if (!el) return;
  el.value = value;
}
