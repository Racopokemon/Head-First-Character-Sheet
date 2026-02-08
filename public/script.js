const PRESET_TEMPLATES = [
  { emoji: '⭐', lang: 'DE', label: 'Head First! (Default)', file: 'default.json' },
  { emoji: '🌃', lang: 'DE', label: 'Neon Shadows', file: 'neon shadows.json' },
  { emoji: '🏝️', lang: 'DE', label: 'Good Times Island', file: 'gti.json' },
];

let gmTemplate = null;
let playerData = {};
let editMode = false;
let compactMode = false;
let ecMode = false; // Success level toggle
let crewVisible = false;
let bgVisible = false;
let hasEnteredEditMode = false; // Track if user ever entered edit mode
let originalCssVariables = null; // Store original CSS variable values
let infoMode = false; // Track if info page is visible
let printPreviewMode = false; // Track if print preview mode is active
let shouldShowCrewBtn = true; // Track if crew button should be shown for current JSON
let shouldShowBgBtn = true; // Track if bg button should be shown for current JSON

document.addEventListener('DOMContentLoaded', () => {
  // wire import/export buttons
  document.getElementById('import-btn').addEventListener('click', openImportModal);
  document.getElementById('file-input').addEventListener('change', handleFileImport);
  document.getElementById('export-btn').addEventListener('click', handleExport);

  // wire edit button toggle
  document.getElementById('edit-btn').addEventListener('click', toggleEditMode);

  // wire expand button toggle
  document.getElementById('toggle-btn').addEventListener('click', toggleCompactMode);

  // wire success level toggle (affects view-mode labels)
  const ecBtn = document.getElementById('ec-btn');
  if (ecBtn) ecBtn.addEventListener('click', toggleEcMode);

  // wire crew/background toggles
  const crewBtn = document.getElementById('crew-btn');
  if (crewBtn) crewBtn.addEventListener('click', toggleCrewVisibility);
  const bgBtn = document.getElementById('bg-btn');
  if (bgBtn) bgBtn.addEventListener('click', toggleBgVisibility);

  // wire info button
  const infoBtn = document.getElementById('info-btn');
  if (infoBtn) infoBtn.addEventListener('click', toggleInfoMode);

  // wire print button
  const printBtn = document.getElementById('print-btn');
  if (printBtn) printBtn.addEventListener('click', togglePrintPreview);

  // wire share button
  const shareBtn = document.getElementById('share-btn');
  if (shareBtn) shareBtn.addEventListener('click', handleShare);

  // wire more-btn dropdown menu
  const moreBtn = document.getElementById('more-btn');
  const ioMenu = document.getElementById('io-menu');
  if (moreBtn && ioMenu) {
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (ioMenu.classList.contains('open')) {
        closeIoMenu();
      } else {
        ioMenu.classList.remove('closing');
        ioMenu.classList.add('open');
        moreBtn.dataset.active = 'true';
      }
    });
    // close when clicking a button inside the menu
    ioMenu.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        window.setTimeout(() => {closeIoMenu();}, 180);
      });
    });
    // close when clicking outside
    document.addEventListener('click', (e) => {
      if (ioMenu.classList.contains('open') && !ioMenu.contains(e.target)) {
        closeIoMenu();
      }
    });
  }

  function closeIoMenu() {
    const menu = document.getElementById('io-menu');
    const btn = document.getElementById('more-btn');
    if (!menu || !menu.classList.contains('open')) return;
    menu.classList.remove('open');
    menu.classList.add('closing');
    btn.dataset.active = 'false';
    menu.addEventListener('animationend', () => {
      menu.classList.remove('closing');
    }, { once: true });
  }

  // Exit edit mode before actual printing
  window.addEventListener('beforeprint', () => {
    if (!infoMode && editMode) {
      //manually leaving editMode without animations (such that we dont print a half-animated stated)
      editMode = false;
      const btn = document.getElementById('edit-btn');
      btn.dataset.active = 'false';

      // Re-enable EC button
      const ecBtn = document.getElementById('ec-btn');
      if (ecBtn) {
        ecBtn.classList.remove('disabled');
      }

      // Remove all animation classes and update immediately
      const row = document.getElementById('points-expander');
      row.classList.remove('collapsing', 'expanding');
      updatePointsDisplay();

      // Remove container padding animation classes
      const container = document.querySelector('.container');
      container.classList.remove('padding-in', 'padding-out');

      // Re-render attributes without animation
      renderAttributes();

      // Remove any sub-attribute buttons that might still be visible
      if (!compactMode) {
        document.querySelectorAll('.sub-add-btn, .sub-del-btn').forEach(btn => btn.remove());
      }

    }
  });

  // wire drag and drop import
  document.addEventListener('dragover', handleDragOver);
  document.addEventListener('drop', handleDrop);
  document.addEventListener('dragleave', (e) => {
    //if (e.clientX === 0 && e.clientY === 0) { // works on chrome to detect leaving the window, but not on firefox, where the ui never changes then, so were doing a delay based approach instead
      hideDragOverlay();
    //}
  });

  // Warn user before leaving if they've entered edit mode (only in non-sync mode)
  window.addEventListener('beforeunload', (e) => {
    // Skip warning if sync is enabled - data is saved online
    if (window.syncModule && window.syncModule.isSyncEnabled()) {
      return;
    }
    if (hasEnteredEditMode) {
      e.preventDefault();
      e.returnValue = ''; // Chrome requires returnValue to be set
    }
  });

  // Setup global input listener for sync broadcasting
  document.addEventListener('input', (e) => {
    if (window.syncModule && window.syncModule.isSyncEnabled()) {
      window.syncModule.debouncedBroadcast();
    }
  });

  // Initialize sync module if available
  let syncActive = false;
  if (window.syncModule) {
    syncActive = window.syncModule.initSync();
  }

  // Only load default.json if sync is not active (sync will load data from server)
  if (!syncActive) {
    fetch('nosync-default.json')
      .then(r => r.json())
      .then(data => {
        applyImported(data);
      })
      .catch(err => {
        console.error('Could not load nosync json', err);
        alert('Could not load the nosync json. Make sure that default.json exists, or any other file in you specified in the env variable DEFAULT_FILE.');
      });
  }
});

function toggleEditMode() {
  const prev = editMode;
  editMode = !editMode;
  const btn = document.getElementById('edit-btn');
  btn.dataset.active = editMode ? 'true' : 'false';

  // Disable EC button in edit mode
  const ecBtn = document.getElementById('ec-btn');
  if (ecBtn) {
    if (editMode) {
      ecBtn.classList.add('disabled');
    } else {
      ecBtn.classList.remove('disabled');
    }
  }

  if (prev) {
    // leaving edit mode
    const row = document.getElementById('points-expander');
    row.classList.add('collapsing');
    row.addEventListener('animationend', () => {
      row.classList.remove('collapsing');
      updatePointsDisplay();
    }, { once: true });

    // Animate container padding out
    const container = document.querySelector('.container');
    container.classList.remove('padding-in');
    container.classList.add('padding-out');
    container.addEventListener('animationend', () => {
      //container.classList.remove('padding-out');
    }, { once: true });

    renderAttributes();
    if (!compactMode) {
      document.querySelectorAll('.sub-add-btn').forEach(box => {
        box.style.display = '';
        box.classList.add('outro');
        //if (firstOne) {
        box.addEventListener('animationend', () => {
          box.remove();
        });
        //}
      });
      document.querySelectorAll('.sub-del-btn').forEach(box => {
        box.style.display = '';
        box.classList.add('outro');
        box.addEventListener('animationend', () => {
          box.remove();
        });
      });
    }
  } else {
    // Entering edit mode: render first then animate labels expand
    hasEnteredEditMode = true; // Set flag for beforeunload warning
    renderAttributes();
    updatePointsDisplay();
    const row = document.getElementById('points-expander');
    row.classList.add('expanding');
    row.addEventListener('animationend', () => {
      row.classList.remove('expanding');
    }, { once: true });

    // Animate container padding in
    const container = document.querySelector('.container');
    container.classList.remove('padding-out');
    container.classList.add('padding-in');
    container.addEventListener('animationend', () => {
      //container.classList.remove('padding-in');
    }, { once: true });

    if (!compactMode) {
      // show buttons
        document.querySelectorAll('.sub-add-btn, .sub-del-btn').forEach(box => {
          box.classList.add('intro');
          box.addEventListener('animationend', () => {
            box.classList.remove('intro');
          }, { once: true });
      });
    }
  }
}

function toggleCompactMode() {
  compactMode = !compactMode;
  const btn = document.getElementById('toggle-btn');
  btn.dataset.active = compactMode ? 'true' : 'false';
  
  // In view mode: animate subattribute visibility
  if (compactMode) {
      // Collapsing: add animation class then remove elements
      document.querySelectorAll('.sub-attr-box').forEach(box => {
        box.classList.add('collapsing');
        box.addEventListener('animationend', () => {
          renderAttributes();
          // Re-render which removes the sub-attr boxes
        }, { once: true });
      });
      document.querySelectorAll('.sub-add-btn').forEach(box => {
        box.classList.add('outro');
      });
  } else {
    renderAttributes();
    document.querySelectorAll('.sub-attr-box').forEach(box => {
        box.classList.add('expanding');
        box.addEventListener('animationend', () => {
          box.classList.remove('expanding');}
        );
    });
    document.querySelectorAll('.sub-add-btn').forEach(box => {
      box.classList.add('intro');
      box.addEventListener('animationend', () => {
          box.classList.remove('intro')
        ;}
      );
    });
  }
}

function toggleEcMode() {
  // Don't toggle if in edit mode
  if (editMode) return;

  ecMode = !ecMode;
  const btn = document.getElementById('ec-btn');
  if (btn) btn.dataset.active = ecMode ? 'true' : 'false';
  // only affects view-mode labels
  renderAttributes();
}

function renderAll() {
  if (!gmTemplate) return;
  applyLocalization();
  applyCustomStyles();
  renderDecorativeBg();
  renderOtherPlayers();
  renderInfos();
  renderScales();
  renderAttributes();
  renderFreetexts();
  updateVisibility();
  updatePointsDisplay();
  renderInfoPage();
}

function applyLocalization() {
  const loc = gmTemplate.localization || {};

  // Set title
  const titleEl = document.getElementById('main-title');
  if (titleEl) titleEl.textContent = loc.title || 'Head First! Character Sheet';

  // Set button labels (only for text buttons)
  const editBtn = document.getElementById('edit-btn');
  if (editBtn) editBtn.textContent = loc.btn_edit || 'Edit';

  const toggleBtn = document.getElementById('toggle-btn');
  if (toggleBtn) toggleBtn.textContent = loc.btn_compact || 'Compact';

  const ecBtn = document.getElementById('ec-btn');
  if (ecBtn) ecBtn.textContent = loc.btn_ec || 'Success Levels';

  // Set icon button tooltips
  const importBtn = document.getElementById('import-btn');
  if (importBtn) importBtn.title = loc.btn_import || 'Import character sheet';

  const exportBtn = document.getElementById('export-btn');
  if (exportBtn) exportBtn.title = loc.btn_export || 'Download character sheet';

  const printBtn = document.getElementById('print-btn');
  if (printBtn) printBtn.title = loc.btn_print || 'Printing mode';

  const infoBtn = document.getElementById('info-btn');
  if (infoBtn) infoBtn.title = loc.btn_info || 'Show attribute info';

  const crewBtn = document.getElementById('crew-btn');
  if (crewBtn) crewBtn.title = loc.btn_crew || 'Show my group';

  const bgBtn = document.getElementById('bg-btn');
  if (bgBtn) bgBtn.title = loc.btn_bg || 'Show character details';

  const picBtn = document.getElementById('pic-btn');
  if (picBtn) picBtn.title = loc.btn_pic || 'Show character image';

  const shareBtn = document.getElementById('share-btn');
  if (shareBtn) shareBtn.title = loc.btn_share || 'Share this character sheet';

  const moreBtn = document.getElementById('more-btn');
  if (moreBtn) moreBtn.title = loc.btn_more || 'More ...';

  // Set user count tooltip
  const userCountLabel = document.getElementById('user-count-label');
  if (userCountLabel) userCountLabel.title = loc.user_count_tooltip || 'Connected users';

  // Set footer text
  const footerText = document.getElementById('footer-text');
  if (footerText) footerText.textContent = loc.footer || 'Just another little TTRPG ruleset, by Ramin.';

  // Set subtitle text
  const subtitleEl = document.getElementById('subtitle');
  if (subtitleEl) subtitleEl.textContent = loc.subtitle_info || 'Attribute details';
}

function applyCustomStyles() {
  const root = document.documentElement;

  // Store original CSS variables on first call
  if (originalCssVariables === null) {
    originalCssVariables = {};
    const computedStyle = getComputedStyle(root);

    // Get all CSS variables from both stylesheets
    for (let i = 0; i < document.styleSheets.length; i++) {
      try {
        const styleSheet = document.styleSheets[i];
        const rules = styleSheet.cssRules || styleSheet.rules;

        for (let j = 0; j < rules.length; j++) {
          const rule = rules[j];
          if (rule.selectorText === ':root' && rule.style) {
            for (let k = 0; k < rule.style.length; k++) {
              const propName = rule.style[k];
              if (propName.startsWith('--')) {
                originalCssVariables[propName] = computedStyle.getPropertyValue(propName);
              }
            }
          }
        }
      } catch (e) {
        // Skip stylesheets that can't be accessed (e.g., cross-origin)
      }
    }
  }

  // Reset all CSS variables to original values first
  Object.keys(originalCssVariables).forEach(varName => {
    root.style.setProperty(varName, originalCssVariables[varName]);
  });

  // Apply custom styles from gmTemplate
  const style = gmTemplate.style || {};
  Object.keys(style).forEach(key => {
    // Skip non-style properties ("info")
    if (key === 'info') return;

    const value = style[key];
    // Convert property name to CSS variable format (add -- prefix if not present)
    const cssVarName = key.startsWith('--') ? key : `--${key}`;
    root.style.setProperty(cssVarName, value);
  });
}

function renderDecorativeBg() {
  const container = document.getElementById('deco-bg');
  if (!container) return;

  const decoSvg = gmTemplate.deco_svg || '';
  if (!decoSvg) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  // Fetch the SVG file and inject it
  fetch(decoSvg)
    .then(r => {
      if (!r.ok) throw new Error('Failed to load SVG');
      return r.text();
    })
    .then(svgContent => {
      container.innerHTML = svgContent;
      container.style.display = '';
      container.classList.add('loading');
      // Remove animation class after animation completes
      container.addEventListener('animationend', () => {
        container.classList.remove('loading');
      }, { once: true });
    })
    .catch(err => {
      console.warn('Could not load decorative SVG:', err);
      container.style.display = 'none';
    });
}

function updateVisibility() {
  const other = document.getElementById('other-players-expander');
  const crewBtn = document.getElementById('crew-btn');
  if (other) other.style.display = crewVisible ? '' : 'none';
  if (crewBtn) crewBtn.dataset.active = crewVisible ? 'true' : 'false';

  const freetexts = document.getElementById('freetext-expander');
  const bgBtn = document.getElementById('bg-btn');
  if (freetexts) freetexts.style.display = bgVisible ? '' : 'none';
  if (bgBtn) bgBtn.dataset.active = bgVisible ? 'true' : 'false';

  // Show/hide info button based on show_infopage setting
  const infoBtn = document.getElementById('info-btn');
  const infoBtnFlex = document.getElementById('top-buttons-row-flex');
  const showInfopage = gmTemplate && gmTemplate.show_infopage !== false;
  if (infoBtn) infoBtn.style.display = showInfopage ? '' : 'none';
  if (infoBtnFlex) infoBtnFlex.style.display = showInfopage ? '' : 'none';
}

// Toggle crew section with animation
function toggleCrewVisibility() {
  crewVisible = !crewVisible;
  const other = document.getElementById('other-players-expander');
  const crewBtn = document.getElementById('crew-btn');
  if (!other) { updateVisibility(); return; }

  other.classList.remove('expanding');
  other.classList.remove('collapsing');

  if (crewVisible) {
    // show then animate expand
    other.style.display = '';
    other.classList.add('expanding');
    other.addEventListener('animationend', () => { other.classList.remove('expanding'); updateVisibility(); }, { once: true });
  } else {
    // animate collapse then hide
    other.classList.add('collapsing');
    other.addEventListener('animationend', () => { other.classList.remove('collapsing'); updateVisibility(); }, { once: true });
  }
  if (crewBtn) crewBtn.dataset.active = crewVisible ? 'true' : 'false';
}

// Toggle freetexts/background section with animation
function toggleBgVisibility() {
  bgVisible = !bgVisible;
  const freetexts = document.getElementById('freetext-expander');
  const bgBtn = document.getElementById('bg-btn');
  if (!freetexts) { updateVisibility(); return; }

  freetexts.classList.remove('expanding');
  freetexts.classList.remove('collapsing');

  if (bgVisible) {
    freetexts.style.display = '';
    freetexts.classList.add('expanding');
    freetexts.addEventListener('animationend', () => { freetexts.classList.remove('expanding'); updateVisibility(); }, { once: true });

    // Show arrow icon on mobile when expanding
    if (window.innerWidth <= 850 && bgBtn) {
      const defaultIcon = bgBtn.querySelector('.bg-icon-default');
      const arrowIcon = bgBtn.querySelector('.bg-icon-arrow');

      if (defaultIcon && arrowIcon) {
        defaultIcon.style.display = 'none';
        arrowIcon.style.display = '';

        setTimeout(() => {
          defaultIcon.style.display = '';
          arrowIcon.style.display = 'none';
        }, 350);
      }
    }
  } else {
    freetexts.classList.add('collapsing');
    freetexts.addEventListener('animationend', () => { freetexts.classList.remove('collapsing'); updateVisibility(); }, { once: true });
  }
  if (bgBtn) bgBtn.dataset.active = bgVisible ? 'true' : 'false';
}

// Toggle print preview mode
function togglePrintPreview() {
  printPreviewMode = !printPreviewMode;
  const printBtn = document.getElementById('print-btn');
  if (printBtn) printBtn.dataset.active = printPreviewMode ? 'true' : 'false';

  if (printPreviewMode) {
    document.body.classList.add('prt-preview');
  } else {
    document.body.classList.remove('prt-preview');
  }
}

// Toggle info mode (show info page instead of character sheet)
function toggleInfoMode() {
  infoMode = !infoMode;
  const infoBtn = document.getElementById('info-btn');
  const infoPage = document.getElementById('info-page-container');
  const charSheet = document.getElementById('char-sheet-container');
  const crewBtn = document.getElementById('crew-btn');
  const bgBtn = document.getElementById('bg-btn');
  const subtitle = document.getElementById('subtitle');
  const footer = document.querySelector('.footer');

  if (infoBtn) infoBtn.dataset.active = infoMode ? 'true' : 'false';

  if (footer) {
    footer.classList.remove('slide-in');
    footer.offsetWidth;
    footer.classList.add('slide-in');
    footer.addEventListener('animationend', () => {
      footer.classList.remove('slide-in');
    }, { once: true });
  }

  if (infoMode) {
    // Show info page, hide character sheet
    if (charSheet) charSheet.style.display = 'none';
    if (subtitle) {
      subtitle.style.display = 'block';
      subtitle.classList.add('slide-in');
      subtitle.addEventListener('animationend', () => {
        subtitle.classList.remove('slide-in');
      }, { once: true });
    }
    if (infoPage) {
      infoPage.classList.add('active');
      infoPage.classList.add('slide-in');
      // Remove animation class after animation completes
      infoPage.addEventListener('animationend', () => {
        infoPage.classList.remove('slide-in');
      }, { once: true });
    }
    // Hide crew and bg buttons in info mode
    if (crewBtn) crewBtn.style.display = 'none';
    if (bgBtn) bgBtn.style.display = 'none';
  } else {
    // Hide info page, show character sheet
    if (subtitle) subtitle.style.display = 'none';
    if (infoPage) infoPage.classList.remove('active');
    if (charSheet) {
      charSheet.style.display = '';
      charSheet.classList.add('slide-in');
      // Remove animation class after animation completes
      charSheet.addEventListener('animationend', () => {
        charSheet.classList.remove('slide-in');
      }, { once: true });
    }
    // Show crew and bg buttons again (if not hidden in json)
    if (crewBtn) crewBtn.style.display = shouldShowCrewBtn ? '' : 'none';
    if (bgBtn) bgBtn.style.display = shouldShowBgBtn ? '' : 'none';
  }
}

// Render the info page with explanations
function renderInfoPage() {
  const container = document.getElementById('info-page-container');
  if (!container || !gmTemplate) return;

  container.innerHTML = '';

  const infopage = gmTemplate.infopage || {};
  const textL = infopage.text_l || '';
  const textR = infopage.text_r || '';

  // Create intro text row only if at least one text is present
  if (textL || textR) {
    const textRow = document.createElement('div');
    textRow.className = 'info-text-row';

    if (textL) {
      const textBoxL = document.createElement('div');
      textBoxL.className = 'box info-text-box';
      textBoxL.textContent = textL;
      textRow.appendChild(textBoxL);
    }

    if (textR) {
      const textBoxR = document.createElement('div');
      textBoxR.className = 'box info-text-box';
      textBoxR.textContent = textR;
      textRow.appendChild(textBoxR);
    }

    container.appendChild(textRow);
  }

  // Create attribute columns
  const attrs = gmTemplate.attributes || [];
  let maxColumn = 1;
  attrs.forEach((attr) => {
    const col = attr.column || 1;
    if (col > maxColumn) maxColumn = col;
  });

  const attributesRow = document.createElement('div');
  attributesRow.className = 'attributes-row';
  for (let c = 1; c <= maxColumn; c++) {
    const colDiv = document.createElement('div');
    colDiv.className = 'attr-col';
    colDiv.id = 'info-attr-col-' + c;
    attributesRow.appendChild(colDiv);
  }
  container.appendChild(attributesRow);

  // Render attribute info boxes
  attrs.forEach((attr) => {
    const col = attr.column || 1;
    const colContainer = document.getElementById('info-attr-col-' + col);
    if (!colContainer) return;

    const box = document.createElement('div');
    box.className = 'box info-attr-box color-' + (attr.color || 1);

    const name = document.createElement('div');
    name.className = 'info-attr-name';
    name.textContent = attr.name || '';

    const description = document.createElement('div');
    description.className = 'info-attr-description';
    description.textContent = attr.description || '';

    const suggestions = document.createElement('ul');
    suggestions.className = 'info-attr-suggestions';
    const suggestionsArray = attr.sub_attribute_suggestions || [];
    suggestionsArray.forEach((suggestion) => {
      const li = document.createElement('li');
      li.textContent = suggestion;
      suggestions.appendChild(li);
    });

    box.appendChild(name);
    if (description.textContent.length > 0) box.appendChild(description);
    if (suggestionsArray.length > 0) box.appendChild(suggestions);
    colContainer.appendChild(box);
  });
}

function renderOtherPlayers() {
  const container = document.getElementById('other-players');
  container.innerHTML = '';
  const otherPlayers = gmTemplate.other_players || [];
  otherPlayers.forEach((placeholder, i) => {
    const box = document.createElement('div');
    box.className = 'box textareabox';
    const ta = document.createElement('textarea');
    ta.placeholder = placeholder || '';
    ta.dataset.otherPlayerIndex = i;
    ta.className = 'other-player';
    box.appendChild(ta);
    container.appendChild(box);
    box.addEventListener('click', (e) => {
      // Only focus if not already focused or if clicked on label/box
      if (e.target !== ta) {
        ta.focus();
        const len = ta.value.length;
        ta.setSelectionRange(len, len);
      }
    });
  });
}

function renderInfos() {
  const left = document.getElementById('infos-left');
  left.innerHTML = '';
  const container = document.getElementById('infos-container');
  const infos = gmTemplate.infos || [];

  infos.forEach((placeholder, i) => {
    const box = document.createElement('div');
    box.className = 'box info-single';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder || '';
    input.dataset.infoIndex = i;
    box.appendChild(input);
    left.appendChild(box);

    if (i === 0) {
      input.className += ' info-char-name';
      input.addEventListener('input', (e) => {
        updateTitle();
      });
    }

    // Focus input when clicking box
    box.addEventListener('click', (e) => {
      if (e.target !== input) {
        input.focus();
        const len = input.value.length;
        input.setSelectionRange(len, len);
      }
    });
    // keyboard navigation: up/down/enter moves to next/prev input in infos-left
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); focusNextInContainer(input, container, 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); focusPrevInContainer(input, container, 1); }
    });
  });

  const mid = document.getElementById('info-big');
  mid.innerHTML = '';
  const infoBig = gmTemplate.info_big || '';
  const box4 = document.createElement('div');
  box4.className = 'box info-big textareabox';
  const ta4 = document.createElement('textarea');
  ta4.placeholder = infoBig;
  ta4.dataset.key = 'info_big';

  // Focus textarea when clicking box
  box4.addEventListener('click', (e) => {
    if (e.target !== ta4) {
      ta4.focus();
      const len = ta4.value.length;
      ta4.setSelectionRange(len, len);
    }
  });
  // Keyboard navigation for textarea
  ta4.addEventListener('keydown', (e) => {
    const cursorPos = e.target.selectionStart;
    const textLength = e.target.value.length;
    const isAtStart = cursorPos === 0;
    const isAtEnd = cursorPos === textLength;

    if (e.key === 'ArrowUp' && isAtStart) {
      e.preventDefault();
      focusPrevInContainer(ta4, container, 1);
    } else if (e.key === 'ArrowDown' && isAtEnd) {
      e.preventDefault();
      focusNextInContainer(ta4, container, 1);
    } else if (e.key === 'Enter' && (e.ctrlKey || e.shiftKey)) {
      e.preventDefault();
      focusNextInContainer(ta4, container, 1);
    }
  });

  box4.appendChild(ta4);
  mid.appendChild(box4);
}

function updateTitle() {
  const input = document.querySelector('input[data-info-index="0"]');
  if (input && input.value) {
    document.title = input.value + ' - Head First! Character Sheet';
  } else {
    document.title = 'Head First! Character Sheet';
  }
}

function renderScales() {
  const r = document.getElementById('scales');
  r.innerHTML = '';
  const container = document.getElementById('infos-container');
  const scales = gmTemplate.scales || [];

  // Hide scales row if no scales defined, and balance flex on remaining rows
  const hasScales = scales.length > 0;
  r.style.display = hasScales ? '' : 'none';

  const infosLeft = document.getElementById('infos-left');
  const infoBig = document.getElementById('info-big');
  if (infosLeft) infosLeft.style.flex = hasScales ? '' : '1';
  if (infoBig) infoBig.style.flex = hasScales ? '' : '1';


  scales.forEach((scaleData, i) => {
    const row = document.createElement('div');
    row.className = 'box scale-row';
    const lbl = document.createElement('div');
    lbl.textContent = scaleData.label || `Scale ${i + 1}`;
    const input = document.createElement('input');
    input.type = 'number';
    input.value = 0;
    input.dataset.scaleIndex = i;
    row.appendChild(lbl);
    row.appendChild(input);
    r.appendChild(row);
    // Focus input when clicking box
    row.addEventListener('click', (e) => {
      if (e.target !== input) {
        input.focus();
        //const len = input.value.length;
        //input.setSelectionRange(len, len); //doesnt work for number input :(
      }
    });
    // keyboard navigation: up/down/enter moves to next/prev scale input
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        if (e.shiftKey) {
          // Shift+Down: decrement value (default behavior, don't prevent)
        } else {
          e.preventDefault();
          focusNextInContainer(input, container, 1);
        }
      } else if (e.key === 'ArrowUp') {
        if (e.shiftKey) {
          // Shift+Up: increment value (default behavior, don't prevent)
        } else {
          e.preventDefault();
          focusPrevInContainer(input, container, 1);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        focusNextInContainer(input, container, 1);
      }
    });
  });
}

function renderAttributes() {
  const attrs = gmTemplate.attributes || [];

  // Determine the maximum column number
  let maxColumn = 1;
  attrs.forEach((attr) => {
    const col = attr.column || 1;
    if (col > maxColumn) maxColumn = col;
  });

  // Clear and recreate columns
  const attributesRow = document.getElementById('attributes-row');
  attributesRow.innerHTML = '';
  for (let c = 1; c <= maxColumn; c++) {
    const colDiv = document.createElement('div');
    colDiv.className = 'attr-col';
    colDiv.id = 'attr-col-' + c;
    attributesRow.appendChild(colDiv);
  }

  attrs.forEach((attr, idx) => {
    const col = (attr.column || 1);
    const container = document.getElementById('attr-col-' + col);
    const allColumnsContainer = document.getElementById('attributes-row');
    
    // Main attribute box
    const box = document.createElement('div');
    box.className = 'box attr-box color-' + (attr.color || 1);
    box.dataset.attrMainIdx = idx;
    const span = document.createElement('div');
    span.textContent = attr.name || ('Attr ' + (idx + 1));
    span.className = 'attr-name';
    
    // Get stored value from playerData
    const storedValue = playerData.attributes && playerData.attributes[idx] ? playerData.attributes[idx].points : 0;
    
    if (editMode) {
      // Show input field
      const input = document.createElement('input');
      input.type = 'number';
      //input.min = 0;
      //input.max = 999;
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
      // keyboard navigation: up/down/enter moves between all number inputs in the column
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
          if (e.shiftKey) {
            // Shift+Down: decrement value (default behavior, don't prevent)
          } else {
            e.preventDefault();
            focusNextInContainer(input, allColumnsContainer, 2);
          }
        } else if (e.key === 'ArrowUp') {
          if (e.shiftKey) {
            // Shift+Up: increment value (default behavior, don't prevent)
          } else {
            e.preventDefault();
            focusPrevInContainer(input, allColumnsContainer, 2);
          }
        } else if (e.key === 'Enter') {
          e.preventDefault();
          focusNextInContainer(input, allColumnsContainer, 2);
        }
      });
      validateAttributeInput(input, idx); // initial validation
            // add subattribute button
      if (!compactMode) {
        const addBtn = document.createElement('button');
        addBtn.className = 'sub-add-btn';
        addBtn.textContent = '+';
        addBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            addSubAttribute(idx);
        });
        box.appendChild(addBtn);
      }

      box.appendChild(span);
      box.appendChild(input);

      // Focus input when clicking box (in edit mode)
      box.addEventListener('click', (e) => {
        if (e.target !== input && !e.target.classList.contains('sub-add-btn') && editMode) {
          input.focus();
          //const len = input.value.length;
          //input.setSelectionRange(len, len); (bro what weird error is this I dont wanna switch to 'tel')
        }
      });
    } else {
      // Show label with stored value
      const label = document.createElement('div');
      label.className = 'attr-value-label';
      label.dataset.attrLabel = idx;
      label.dataset.value = storedValue || '0';
      if (ecMode) {
        const right = Number(storedValue || 0);
        const left = Math.round(right / 5);
        const mid = Math.round(right / 2);
        label.innerHTML = `<span class="ec-light">${left} / ${mid}</span> / <span>${right}</span>`;
      } else {
        label.textContent = storedValue || '0';
      }
      if (!compactMode) {
        //this button is only needed for the fade-out animation
        const addBtn = document.createElement('button');
        addBtn.className = 'sub-add-btn';
        addBtn.textContent = '+';
        addBtn.style.display = 'none'; //quick n dirty, but for one animation its probably ok
        box.append(addBtn);
      }
      box.appendChild(span);
      box.appendChild(label);
    }
    
    container.appendChild(box);

    // Render subattributes if in not compactMode
    if (!compactMode) {
      const subAttrs = playerData.attributes && playerData.attributes[idx] ? playerData.attributes[idx].sub_attributes : [];
      subAttrs.forEach((subAttr, subIdx) => {
        renderSubAttribute(container, idx, subIdx, attr.color || 1);
      });
    }
  });
}

function addSubAttribute(attrIdx, atIndex) {
  if (!playerData.attributes) playerData.attributes = [];
  if (!playerData.attributes[attrIdx]) playerData.attributes[attrIdx] = { points: 0, sub_attributes: [] };
  const arr = playerData.attributes[attrIdx].sub_attributes;
  const newObj = { name: '', points: 0 };
  if (typeof atIndex === 'number' && atIndex >= 0 && atIndex <= arr.length) {
    arr.splice(atIndex, 0, newObj);
    var newIndex = atIndex;
  } else {
    arr.push(newObj);
    var newIndex = arr.length - 1;
  }
  renderAttributes();
  updatePointsDisplay();
  // Broadcast change to sync
  if (window.syncModule && window.syncModule.isSyncEnabled()) {
    window.syncModule.broadcastChange();
  }
  // focus the new subattr name input
  const selector = `[data-sub-input="${attrIdx}-${newIndex}"]`;
  const el = document.querySelector(selector);
  if (el) {
    el.focus();
    try { const len = (el.value || '').length; if (el.setSelectionRange) el.setSelectionRange(len, len); } catch (e) {}
  }
}

function removeSubAttribute(attrIdx, subIdx) {
  if (!playerData.attributes || !playerData.attributes[attrIdx]) return;
  playerData.attributes[attrIdx].sub_attributes.splice(subIdx, 1);
  renderAttributes();
  updatePointsDisplay();
  // Broadcast change to sync
  if (window.syncModule && window.syncModule.isSyncEnabled()) {
    window.syncModule.broadcastChange();
  }
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
        mainLabel.innerHTML = `<span class="ec-light">${left} / ${mid}</span> / <span>${right}</span>`;
      } else {
        mainLabel.textContent = storedValue || '0';
      }
    }

    // Update sub-attribute labels and validate them
    if (!compactMode) {
      const subAttrs = playerData.attributes && playerData.attributes[idx] ? playerData.attributes[idx].sub_attributes : [];
      subAttrs.forEach((subAttr, subIdx) => {
        const subLabel = document.querySelector(`[data-sub-label="${idx}-${subIdx}"]`);
        if (subLabel) {
          const mainPoints = playerData.attributes[idx].points || 0;
          const subPoints = subAttr.points || 0;
          const sum = mainPoints + subPoints;
          if (ecMode && !editMode) {
            const right = Number(sum || 0);
            const left = Math.round(right / 5);
            const mid = Math.round(right / 2);
            subLabel.innerHTML = `<span class="ec-light">${left} / ${mid}</span> / <span>${right}</span>`;
          } else {
            subLabel.textContent = sum;
          }

          // Validate using the centralized function
          validateSubAttributeInput(`${idx}-${subIdx}`);
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
    const allColumnsContainer = document.getElementById('attributes-row');
    // Edit mode: name input + value input + total label
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    // nameInput.placeholder = 'Subattribut-Name';
    nameInput.value = subAttr.name || '';
    nameInput.dataset.subInput = `${attrIdx}-${subAttrIdx}`;

    // Bring to front on focus, move back on blur
    nameInput.addEventListener('focus', () => { nameInput.style.zIndex = '1'; });
    nameInput.addEventListener('blur', () => { nameInput.style.zIndex = ''; });

    // suggestions dropdown element
    const suggestionsDiv = document.createElement('div');
    suggestionsDiv.className = 'sub-suggestions';
    suggestionsDiv.style.display = 'none';
    box.appendChild(suggestionsDiv);

    // highlight index for keyboard navigation
    let highlightedIndex = -1;

    function populateSuggestions(query) {
      suggestionsDiv.innerHTML = '';
      highlightedIndex = -1;
      const list = (gmTemplate && gmTemplate.attributes && gmTemplate.attributes[attrIdx] && gmTemplate.attributes[attrIdx].sub_attribute_suggestions) || [];
      const q = (query || '').toLowerCase();

      // Get all existing sub-attribute names for this attribute (excluding current one)
      const existingNames = (playerData.attributes[attrIdx] && playerData.attributes[attrIdx].sub_attributes || [])
        .map((sa, idx) => idx !== subAttrIdx ? (sa.name || '').toLowerCase() : null)
        .filter(n => n);

      const filtered = list.filter(s => {
        const lower = s.toLowerCase();
        return s && lower.includes(q) && !existingNames.includes(lower);
      });
      filtered.forEach((s, i) => {
        const it = document.createElement('div');
        it.className = 'sub-suggestion';
        it.textContent = s;
        it.dataset.suggIndex = i;
        it.addEventListener('mousedown', (ev) => {
          ev.preventDefault();
          selectSuggestion(i, s);
        });
        suggestionsDiv.appendChild(it);
      });
      suggestionsDiv.style.display = filtered.length ? '' : 'none';
      if (filtered.length) {
        // position the dropdown to align with the name input
        try {
          suggestionsDiv.style.right = 'auto';
          suggestionsDiv.style.left = (nameInput.offsetLeft) + 'px';
          suggestionsDiv.style.width = (nameInput.offsetWidth) + 'px';
          suggestionsDiv.style.boxSizing = 'border-box';
        } catch (e) {}
      }
    }

    function moveHighlight(dir) {
      const items = suggestionsDiv.querySelectorAll('.sub-suggestion');
      if (!items || items.length === 0) return;
      // compute next index
      if (highlightedIndex === -1) {
        highlightedIndex = dir > 0 ? 0 : items.length - 1;
      } else {
        highlightedIndex = (highlightedIndex + dir + items.length) % items.length;
      }
      items.forEach((it, i) => it.classList.toggle('highlight', i === highlightedIndex));
      const el = items[highlightedIndex];
      if (el) el.scrollIntoView({ block: 'nearest' });
    }

    function selectSuggestion(index, value) {
      // pick the suggestion at index (value provided for convenience)
      const items = suggestionsDiv.querySelectorAll('.sub-suggestion');
      const it = items[index];
      const chosen = value || (it && it.textContent) || '';
      nameInput.value = chosen;
      if (!playerData.attributes[attrIdx]) playerData.attributes[attrIdx] = { points: 0, sub_attributes: [] };
      if (!playerData.attributes[attrIdx].sub_attributes[subAttrIdx]) playerData.attributes[attrIdx].sub_attributes[subAttrIdx] = { name: '', points: 0 };
      playerData.attributes[attrIdx].sub_attributes[subAttrIdx].name = chosen;
      suggestionsDiv.style.display = 'none';
      highlightedIndex = -1;
      validateSubAttributeInput(valueInput);
      updateAttributePointLabels();
      updatePointsDisplay();
      // Broadcast change to sync
      if (window.syncModule && window.syncModule.isSyncEnabled()) {
        window.syncModule.broadcastChange();
      }
    }

    nameInput.addEventListener('input', (e) => {
      playerData.attributes[attrIdx].sub_attributes[subAttrIdx].name = e.target.value;
      populateSuggestions(e.target.value);
    });
    nameInput.addEventListener('blur', () => setTimeout(() => { suggestionsDiv.style.display = 'none'; highlightedIndex = -1; }, 25));
    // keyboard navigation for suggestions and field-jumping when no suggestions
    nameInput.addEventListener('keydown', (e) => {
      const visible = suggestionsDiv.style.display !== 'none' && suggestionsDiv.children.length > 0;
      if (visible) {
        if (e.key === 'ArrowDown') { e.preventDefault(); moveHighlight(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); moveHighlight(-1); }
        else if (e.key === 'Enter') {
          e.preventDefault();
          if (highlightedIndex >= 0) {
            // select highlighted
            const items = suggestionsDiv.querySelectorAll('.sub-suggestion');
            const it = items[highlightedIndex];
            if (it) selectSuggestion(highlightedIndex, it.textContent);
          } else {
            // no highlight but suggestions exist: pick first
            const items = suggestionsDiv.querySelectorAll('.sub-suggestion');
            if (items.length) selectSuggestion(0, items[0].textContent);
          }
        } else if (e.key === 'Escape' || (e.key === 'Backspace' && e.target.value.length == 0)) {
          suggestionsDiv.style.display = 'none'; highlightedIndex = -1;
        }
      } else {
        // no suggestions - arrow keys jump between subattribute name fields in the column
        if (e.key === 'ArrowDown') { e.preventDefault(); focusNextInContainer(nameInput, allColumnsContainer, 3); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); focusPrevInContainer(nameInput, allColumnsContainer, 3); }
        else if (e.key === 'Enter') { 
          e.preventDefault(); 
          if (e.ctrlKey || e.shiftKey) {
            focusNextInContainer(nameInput, allColumnsContainer, 3);
          } else {
            addSubAttribute(attrIdx, subAttrIdx + 1); 
          }
        }
        else if (e.key === 'Backspace' && nameInput.value === '') {
          e.preventDefault();
          // Precompute the expected data-sub-input for the previous subattribute
          const prevSubIdx = subAttrIdx - 1;
          const expectedDataSubInput = `${attrIdx}-${prevSubIdx}`;
          // Remove this subattribute (which will trigger re-render)
          removeSubAttribute(attrIdx, subAttrIdx);
          // After re-render, find and focus the previous subattribute's name field
          const prevInput = document.querySelector(`input[data-sub-input="${expectedDataSubInput}"]`);
          if (prevInput) {
            prevInput.focus();
            const len = (prevInput.value || '').length;
            if (prevInput.setSelectionRange) prevInput.setSelectionRange(len, len);
          }
        }
      }
    });
    nameInput.addEventListener('mousedown', (e) => {
      const visible = suggestionsDiv.style.display !== 'none' && suggestionsDiv.children.length > 0;
      const focussed = document.activeElement == nameInput;
      if (focussed && nameInput.value.length == 0) {
        if (visible) {
          suggestionsDiv.style.display = 'none';
          highlightedIndex = -1;
        } else {
          //e.target.value
          populateSuggestions('');
        }
      }
    });
    
    const valueInput = document.createElement('input');
    valueInput.type = 'number';
    //valueInput.min = 0;
    //valueInput.max = 999;
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
    // keyboard navigation: up/down/enter moves between all number inputs in the column
    valueInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        if (e.shiftKey) {
          // Shift+Down: decrement value (default behavior, don't prevent)
        } else {
          e.preventDefault();
          focusNextInContainer(valueInput, allColumnsContainer, 2);
        }
      } else if (e.key === 'ArrowUp') {
        if (e.shiftKey) {
          // Shift+Up: increment value (default behavior, don't prevent)
        } else {
          e.preventDefault();
          focusPrevInContainer(valueInput, allColumnsContainer, 2);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        focusNextInContainer(valueInput, allColumnsContainer, 2);
      }
    });
    validateSubAttributeInput(valueInput); // initial validation

    const totalLabel = document.createElement('div');
    totalLabel.className = 'attr-value-label';
    totalLabel.dataset.subLabel = `${attrIdx}-${subAttrIdx}`;
    const mainPoints = playerData.attributes[attrIdx].points || 0;
    const subPoints = subAttr.points || 0;
    const sum = mainPoints + subPoints;
    totalLabel.dataset.value = String(sum);
    totalLabel.textContent = sum;
    
    // delete button for this subattribute
    const delBtn = document.createElement('button');
    delBtn.className = 'sub-del-btn';
    delBtn.title = 'Subattribut entfernen';
    delBtn.textContent = '×';//'×';
    delBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      removeSubAttribute(attrIdx, subAttrIdx);
    });

    box.appendChild(delBtn);
    box.appendChild(nameInput);
    box.appendChild(valueInput);
    box.appendChild(totalLabel);

    //// Focus value input when clicking box (in edit mode)
    //box.addEventListener('click', (e) => {
    //  if (e.target !== nameInput && e.target !== valueInput && !e.target.classList.contains('sub-del-btn') && !e.target.classList.contains('sub-suggestion')) {
    //    valueInput.focus();
    //    valueInput.select();
    //  }
    //});
  } else {
    // View mode: name + total label
    const nameLabel = document.createElement('div');
    nameLabel.textContent = subAttr.name || '';
    nameLabel.className = 'sub-attr-name';
    //nameLabel.className = 'flex';
    
    const totalLabel = document.createElement('div');
    totalLabel.className = 'attr-value-label';
    totalLabel.dataset.subLabel = `${attrIdx}-${subAttrIdx}`;
    const mainPoints = playerData.attributes[attrIdx].points || 0;
    const subPoints = subAttr.points || 0;
    const sum = mainPoints + subPoints;
    totalLabel.dataset.value = String(sum);
    if (ecMode) {
      const right = Number(sum || 0);
      const left = Math.round(right / 5);
      const mid = Math.round(right / 2);
      totalLabel.innerHTML = `<span class="ec-light">${left} / ${mid}</span> / <span>${right}</span>`;
    } else {
      totalLabel.textContent = sum;
    }
    
    if (!compactMode) {
      //this button is only needed (again) for the fade-out animation
      const addBtn = document.createElement('button');
      addBtn.className = 'sub-del-btn';
      addBtn.textContent = '×';
      addBtn.style.display = 'none'; //quick n dirty, but for one animation its probably ok
      box.append(addBtn);
    }

    box.appendChild(nameLabel);
    box.appendChild(totalLabel);
  }
  
  container.appendChild(box);
}

function getSelectorFromType(type) {
  if (type == 1) {
    return 'input[type="text"], input[type="number"], textarea';
  } else if (type == 2) {
    return 'input[type="number"]';
  } else {
    return 'input[type="text"]';
  }
}

// Move focus to the next/previous input-like element within a container
function focusNextInContainer(currentEl, container, type) {
  const inputs = Array.from(container.querySelectorAll(getSelectorFromType(type)));
  const idx = inputs.indexOf(currentEl);
  if (idx !== -1 && idx + 1 < inputs.length) {
    inputs[idx + 1].focus();
    try { const len = (inputs[idx + 1].value || '').length; if (inputs[idx + 1].setSelectionRange) inputs[idx + 1].setSelectionRange(len, len); } catch (e) {}
  }
}

function focusPrevInContainer(currentEl, container, type) {
  const inputs = Array.from(container.querySelectorAll(getSelectorFromType(type)));
  const idx = inputs.indexOf(currentEl);
  if (idx > 0) {
    inputs[idx - 1].focus();
    try { const len = (inputs[idx - 1].value || '').length; if (inputs[idx - 1].setSelectionRange) inputs[idx - 1].setSelectionRange(len, len); } catch (e) {}
  }
}

function validateAttributeInput(inputEl, attrIdx) {
  const val = Number(inputEl.value || 0);
  const minVal = gmTemplate.attribute_points_min === 0 ? 0 : gmTemplate.attribute_points_min || 10;
  const maxVal = gmTemplate.attribute_points_max || 80;
  
  if (val != 0 && (val < minVal || val > maxVal)) {
    inputEl.classList.add('warning');
  } else {
    inputEl.classList.remove('warning');
  }
}

function validateSubAttributeInput(inputEl) {
  // Mark the corresponding total label red if (attribute points + this sub) > max
  // Can accept either an input element or a data string in format "attrIdx-subIdx"
  let attrIdx, subIdx;

  if (typeof inputEl === 'string') {
    // Called with "attrIdx-subIdx" string
    const parts = inputEl.split('-');
    if (parts.length < 2) return;
    attrIdx = Number(parts[0]);
    subIdx = Number(parts[1]);
  } else {
    // Called with input element
    const ds = inputEl.dataset.subInputVal || '';
    const parts = ds.split('-');
    if (parts.length < 2) return;
    attrIdx = Number(parts[0]);
    subIdx = Number(parts[1]);
  }

  const mainVal = (playerData.attributes && playerData.attributes[attrIdx]) ? Number(playerData.attributes[attrIdx].points || 0) : 0;
  const subVal = (playerData.attributes && playerData.attributes[attrIdx] && playerData.attributes[attrIdx].sub_attributes[subIdx]) ? Number(playerData.attributes[attrIdx].sub_attributes[subIdx].points || 0) : 0;
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
  const row = document.getElementById('points-expander');

  // show/hide based on editMode
  row.style.display = editMode ? null : 'none';

  const container = document.querySelector('.container');
  //container.dataset.extended = editMode ? 'true' : 'false';

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
  const loc = gmTemplate.localization || {};
  const labelGrundwerte = loc.label_grundwerte || 'Grundwerte';
  const labelSpezialisierung = loc.label_spezialisierung || 'Spezialisierung';

  const label = document.getElementById('attr-points-label');
  if (label) {
    label.textContent = `${labelGrundwerte} ${totalPoints}/${maxPoints}`;
    if (totalPoints > maxPoints) {
      label.classList.add('warning');
    } else {
      label.classList.remove('warning');
    }
  }

  const subLabel = document.getElementById('sub-attr-points-label');
  if (subLabel) {
    subLabel.textContent = `${labelSpezialisierung} ${totalSubPoints}/${maxSubPoints}`;
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
  const freetexts = gmTemplate.freetexts || [];
  freetexts.forEach((label, i) => {
    const box = document.createElement('div');
    box.className = 'box textareabox';
    const lbl = document.createElement('div');
    lbl.className = 'label';
    lbl.textContent = label;
    const ta = document.createElement('textarea');
    ta.className = 'freetext-textarea';
    ta.dataset.freetextIndex = i;
    box.appendChild(lbl);
    box.appendChild(ta);
    // Focus textarea when clicking anywhere in the box
    box.addEventListener('click', (e) => {
      // Only focus if not already focused or if clicked on label/box
      if (e.target !== ta) {
        ta.focus();
        const len = ta.value.length;
        ta.setSelectionRange(len, len);
      }
    });
    container.appendChild(box);
  });
}

function handleShare() {
  navigator.clipboard.writeText(window.location.hostname + window.location.pathname).then(() => {
    const loc = gmTemplate && gmTemplate.localization ? gmTemplate.localization : {};
    const toast = document.getElementById('toast');
    toast.textContent = loc.link_copied || 'Copied link to clipboard :)';
    toast.classList.add('visible');
    clearTimeout(toast._hideTimeout);
    
    // Switch share button icon to copy icon
    const shareBtn = document.getElementById('share-btn');
    if (shareBtn) {
      const defaultIcon = shareBtn.querySelector('.share-icon-default');
      const copyIcon = shareBtn.querySelector('.share-icon-copy');
      if (defaultIcon && copyIcon) {
        defaultIcon.style.display = 'none';
        copyIcon.style.display = '';
      }
    }
    
    toast._hideTimeout = setTimeout(() => {
      toast.classList.remove('visible');
      
      // Switch share button icon back to share icon
      const shareBtn = document.getElementById('share-btn');
      if (shareBtn) {
        const defaultIcon = shareBtn.querySelector('.share-icon-default');
        const copyIcon = shareBtn.querySelector('.share-icon-copy');
        if (defaultIcon && copyIcon) {
          defaultIcon.style.display = '';
          copyIcon.style.display = 'none';
        }
      }
    }, 1250);
  });
}

function handleExport() {
  if (!gmTemplate) return alert('No sheet loaded to export');
  const out = { set_by_gm: gmTemplate, set_by_player: {} };

  // infos array
  const infoValues = [];
  const infoInputs = document.querySelectorAll('input[data-info-index]');
  infoInputs.forEach((input) => {
    const idx = Number(input.dataset.infoIndex);
    infoValues[idx] = input.value || '';
  });
  out.set_by_player.infos = infoValues;

  // info_big
  out.set_by_player.info_big = getValueByKey('info_big');

  // freetexts array
  const freetextValues = [];
  const freetextInputs = document.querySelectorAll('textarea[data-freetext-index]');
  freetextInputs.forEach((ta) => {
    const idx = Number(ta.dataset.freetextIndex);
    freetextValues[idx] = ta.value || '';
  });
  out.set_by_player.freetexts = freetextValues;

  // other_players array
  const otherPlayerValues = [];
  const otherPlayerInputs = document.querySelectorAll('textarea[data-other-player-index]');
  otherPlayerInputs.forEach((ta) => {
    const idx = Number(ta.dataset.otherPlayerIndex);
    otherPlayerValues[idx] = ta.value || '';
  });
  out.set_by_player.other_players = otherPlayerValues;

  // scales array
  const scaleValues = [];
  const scaleInputs = document.querySelectorAll('input[data-scale-index]');
  scaleInputs.forEach((input) => {
    const idx = Number(input.dataset.scaleIndex);
    scaleValues[idx] = input.value || '';
  });
  out.set_by_player.scales = scaleValues;

  // attributes from playerData
  out.set_by_player.attributes = (playerData.attributes || []).map(a => ({
    points: a.points || 0,
    sub_attributes: a.sub_attributes || []
  }));

  // save visibility flags
  out.set_by_player.crewVisible = crewVisible;
  out.set_by_player.bgVisible = bgVisible;

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
  let name = (infoValues[0] || 'character').toString().trim();
  // sanitize name to safe filename
  name = name.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_\-]/g,'');
  a.href = url; a.download = `${y}_${mo}_${d}-${hh}_${mm}_${name}.char`;
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
      // Broadcast change to other clients if sync is enabled
      if (window.syncModule && window.syncModule.isSyncEnabled()) {
        window.syncModule.broadcastChange();
      }
    } catch (err) {
      alert('Could not parse json data :(');
    }
  };
  reader.readAsText(f);
  // reset input so same file can be selected again
  e.target.value = '';
}

function openImportModal() {
  // Remove existing modal if any
  const existing = document.getElementById('import-modal-overlay');
  if (existing) existing.remove();

  const loc = (gmTemplate && gmTemplate.localization) || {};
  const infoText = loc.import_modal_info || 'Start from a new character sheet or upload your own. Be advised: This overrides the current sheet.';
  const uploadLabel = loc.import_modal_upload || 'Upload ...';

  const overlay = document.createElement('div');
  overlay.id = 'import-modal-overlay';
  overlay.className = 'import-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'import-modal';

  const info = document.createElement('p');
  info.className = 'import-modal-info';
  info.textContent = infoText;
  modal.appendChild(info);

  const grid = document.createElement('div');
  grid.className = 'import-modal-grid';

  // Upload button
  const uploadBtn = document.createElement('button');
  uploadBtn.className = 'toggle-btn import-modal-btn-upload';
  uploadBtn.textContent = uploadLabel;
  uploadBtn.addEventListener('click', () => {
    closeImportModal();
    document.getElementById('file-input').click();
  });
  grid.appendChild(uploadBtn);

  // Preset buttons
  PRESET_TEMPLATES.forEach(preset => {
    const btn = document.createElement('button');
    btn.className = 'toggle-btn';
    btn.textContent = preset.label;
    btn.addEventListener('click', () => {
      closeImportModal();
      loadPresetTemplate(preset.file);
    });
    grid.appendChild(btn);
  });

  modal.appendChild(grid);
  overlay.appendChild(modal);

  // Close on overlay click (outside modal)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeImportModal();
  });

  // Close on Escape key
  overlay._escHandler = (e) => {
    if (e.key === 'Escape') closeImportModal();
  };
  document.addEventListener('keydown', overlay._escHandler);

  document.body.appendChild(overlay);
}

function closeImportModal() {
  const overlay = document.getElementById('import-modal-overlay');
  if (!overlay) return;
  document.removeEventListener('keydown', overlay._escHandler);
  overlay.remove();
}

function loadPresetTemplate(filename) {
  fetch('/' + encodeURIComponent(filename))
    .then(res => {
      if (!res.ok) throw new Error('Failed to load template');
      return res.json();
    })
    .then(json => {
      applyImported(json);
      if (window.syncModule && window.syncModule.isSyncEnabled()) {
        window.syncModule.broadcastChange();
      }
    })
    .catch(() => {
      alert('Could not load template :(');
    });
}

function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'copy';
  // Only show overlay if dragging files and not offline in sync mode
  if (e.dataTransfer.types.includes('Files')) {
    // Don't show overlay if offline in sync mode
    if (window.syncModule && window.syncModule.isSyncEnabled() && !window.syncModule.isSyncOnline()) {
      return;
    }
    showDragOverlay();
  }
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  hideDragOverlay();

  // Silently ignore drop when offline in sync mode
  if (window.syncModule && window.syncModule.isSyncEnabled() && !window.syncModule.isSyncOnline()) {
    return;
  }

  const files = e.dataTransfer.files;
  if (!files || files.length === 0) return;

  const file = files[0];
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const json = JSON.parse(ev.target.result);
      applyImported(json);
      // Broadcast change to other clients if sync is enabled
      if (window.syncModule && window.syncModule.isSyncEnabled()) {
        window.syncModule.broadcastChange();
      }
    } catch (err) {
      alert('Could not parse json data :(');
    }
  };
  reader.readAsText(file);
}

var dropHideTimer1;
function showDragOverlay() {
  window.clearTimeout(dropHideTimer1);
  let overlay = document.getElementById('drag-over-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'drag-over-overlay';
    overlay.className = 'drag-over-overlay';
    const loc = gmTemplate && gmTemplate.localization ? gmTemplate.localization : {};
    overlay.textContent = loc.drop_file || 'Drop file here';
    document.body.appendChild(overlay);
    closeImportModal();
  }
}

function hideDragOverlay() {
  window.clearTimeout(dropHideTimer1);
  dropHideTimer1 = window.setTimeout(() => {
      const overlay = document.getElementById('drag-over-overlay');
      if (overlay) {
        overlay.remove();
      }
  }, 30);
}

/**
 * Apply remote small changes in-place without recreating DOM elements.
 * This preserves focus and mobile keyboard state.
 * @param {Object} json - Full json with set_by_gm and set_by_player
 * @returns {boolean} - true if applied in-place, false if full re-render needed
 */
function applyRemoteSmallChange(json) {
  const sp = json.set_by_player;
  if (!sp) return false;

  // Update simple text fields in-place (skip if focused)
  if (Array.isArray(sp.infos)) {
    document.querySelectorAll('input[data-info-index]').forEach(input => {
      const idx = Number(input.dataset.infoIndex);
      const newVal = sp.infos[idx] || '';
      if (input.value !== newVal) {
        input.value = newVal;
      }
    });
  }

  const bigEl = document.querySelector('[data-key="info_big"]');
  if (bigEl) {
    const newVal = sp.info_big || '';
    if (bigEl.value !== newVal) bigEl.value = newVal;
  }

  if (Array.isArray(sp.scales)) {
    document.querySelectorAll('input[data-scale-index]').forEach(input => {
      const idx = Number(input.dataset.scaleIndex);
      const newVal = sp.scales[idx] || '';
      if (input.value !== newVal) {
        input.value = newVal;
      }
    });
  }

  if (Array.isArray(sp.freetexts)) {
    document.querySelectorAll('textarea[data-freetext-index]').forEach(ta => {
      const idx = Number(ta.dataset.freetextIndex);
      const newVal = sp.freetexts[idx] || '';
      if (ta.value !== newVal) {
        ta.value = newVal;
      }
    });
  }

  if (Array.isArray(sp.other_players)) {
    document.querySelectorAll('textarea[data-other-player-index]').forEach(ta => {
      const idx = Number(ta.dataset.otherPlayerIndex);
      const newVal = sp.other_players[idx] || '';
      if (ta.value !== newVal) {
        ta.value = newVal;
      }
    });
  }

  // Check if subattribute structure changed - if so, we need to re-render attributes
  const subattrStructureChanged = hasSubattrStructureChanged(sp.attributes);

  // Update playerData with new attribute values
  if (Array.isArray(sp.attributes)) {
    playerData.attributes = sp.attributes.map(a => ({
      points: (a && a.points) || 0,
      sub_attributes: (a && a.sub_attributes) || []
    }));
  }

  // Handle attributes
  if (subattrStructureChanged || !editMode) {
    // Structure changed (or not in edit mode so theres no focus to lose) - must re-render attributes (focus loss is acceptable)
    renderAttributes();
  } else {
    // Structure same - update attribute values in-place
    updateAttributeValuesInPlace(sp.attributes);
  }

  updateAttributePointLabels();
  updatePointsDisplay();
  updateTitle();

  return true;
}

/**
 * Check if subattribute structure (count per attribute) has changed
 */
function hasSubattrStructureChanged(newAttrs) {
  if (!playerData.attributes || !newAttrs) return true;
  if (playerData.attributes.length !== newAttrs.length) return true;

  for (let i = 0; i < newAttrs.length; i++) {
    const oldCount = (playerData.attributes[i]?.sub_attributes || []).length;
    const newCount = (newAttrs[i]?.sub_attributes || []).length;
    if (oldCount !== newCount) return true;
  }
  return false;
}

/**
 * Update attribute and subattribute INPUT values in-place (for edit mode)
 */
function updateAttributeValuesInPlace(attrs) {
  if (!Array.isArray(attrs)) return;

  attrs.forEach((attr, idx) => {
    // Attribute main value input (edit mode)
    const attrInput = document.querySelector(`input[data-attr-index="${idx}"]`);
    if (attrInput) {
      const newVal = String(attr.points || 0);
      if (attrInput.value !== newVal) attrInput.value = newVal;
    }

    // Subattribute inputs (edit mode)
    const subs = attr.sub_attributes || [];
    subs.forEach((sub, subIdx) => {
      // Name input
      const nameInput = document.querySelector(`[data-sub-input="${idx}-${subIdx}"]`);
      if (nameInput) {
        const newVal = sub.name || '';
        if (nameInput.value !== newVal) nameInput.value = newVal;
      }
      // Value input
      const valInput = document.querySelector(`[data-sub-input-val="${idx}-${subIdx}"]`);
      if (valInput) {
        const newVal = String(sub.points || 0);
        if (valInput.value !== newVal) valInput.value = newVal;
      }
    });
  });
}

function applyImported(json, options = {}) {
  // options.preserveUIState - if true, keep editMode, compactMode, ecMode, crewVisible, bgVisible, infoMode
  const preserveUIState = options.preserveUIState || false;

  // Save current UI state if preserving
  const savedState = preserveUIState ? {
    editMode,
    compactMode,
    ecMode,
    crewVisible,
    bgVisible,
    infoMode
  } : null;

  // if set_by_gm present, replace template and re-render labels
  if (!json.set_by_gm) {
    // actually this would be a problem, were always expecting the set_by_gm to exist
    throw new Error("Provided json file does not provide a 'set_by_gm' entry :(");
  }
  gmTemplate = json.set_by_gm;
  renderAll();

  //unhiding some things that are only hidden initially (rather have an empty page flash before loading finished than a half-built one)
  document.getElementById('char-sheet-container').style.display = '';
  document.getElementById('footer').style.display = '';

  const sp = json.set_by_player;

  // Handle show_subattributes and show_success_levels
  const showSubattributes = gmTemplate.show_subattributes !== false; // default true
  const showSuccessLevels = gmTemplate.show_success_levels !== false; // default true
  const showFreetextButton = gmTemplate.show_freetext_button !== false; // default true
  const showOthersButton = gmTemplate.show_others_button !== false; // default true

  // Update compact button visibility and state
  const toggleBtn = document.getElementById('toggle-btn');
  if (toggleBtn) {
    if (!showSubattributes) {
      toggleBtn.style.display = 'none';
      compactMode = true; // force compact mode
    } else {
      toggleBtn.style.display = '';
    }
  }
  // Show/hide sub-attribute points label based on show_subattributes setting
  const subAttrPointsLabel = document.getElementById('sub-attr-points-label');
  if (subAttrPointsLabel) subAttrPointsLabel.style.display = showSubattributes ? '' : 'none';

  // Update EC button visibility and state
  const ecBtn = document.getElementById('ec-btn');
  if (ecBtn) {
    if (!showSuccessLevels) {
      ecBtn.style.display = 'none';
      ecMode = false; // force ecMode off
    } else {
      ecBtn.style.display = '';
    }
  }

  // Update crew button visibility based on other_players array
  const hasOtherPlayers = gmTemplate.other_players && gmTemplate.other_players.length > 0;
  const hasFreetexts = gmTemplate.freetexts && gmTemplate.freetexts.length > 0;
  shouldShowCrewBtn = showOthersButton && hasOtherPlayers;
  shouldShowBgBtn = showFreetextButton && hasFreetexts;

  const crewBtn = document.getElementById('crew-btn');
  if (crewBtn) {
    crewBtn.style.display = shouldShowCrewBtn ? '' : 'none';
  }

  // Update bg button visibility (hide if disabled or if freetexts are missing/empty)
  const bgBtn = document.getElementById('bg-btn');
  if (bgBtn) {
    bgBtn.style.display = shouldShowBgBtn ? '' : 'none';
  }

  if (!sp) {
    // initialize playerData with empty attributes
    playerData.attributes = (gmTemplate.attributes || []).map(() => ({ points: 0, sub_attributes: [] }));
    // fill scales with initial values from gmTemplate
    const scales = gmTemplate.scales || [];
    scales.forEach((scaleData, i) => {
      const scaleInput = document.querySelector(`input[data-scale-index="${i}"]`);
      if (scaleInput && scaleData.initial !== undefined) {
        scaleInput.value = scaleData.initial;
      }
    });
    if (editMode) {
        toggleEditMode();
    }
  } else {
    // fill infos array
    if (Array.isArray(sp.infos)) {
      const infoInputs = document.querySelectorAll('input[data-info-index]');
      infoInputs.forEach((input) => {
        const idx = Number(input.dataset.infoIndex);
        input.value = sp.infos[idx] || '';
      });
    }

    // fill info_big
    setInputValue('info_big', sp.info_big || '');

    // fill freetexts array
    if (Array.isArray(sp.freetexts)) {
      const freetextInputs = document.querySelectorAll('textarea[data-freetext-index]');
      freetextInputs.forEach((ta) => {
        const idx = Number(ta.dataset.freetextIndex);
        ta.value = sp.freetexts[idx] || '';
      });
    }

    // fill other_players array
    if (Array.isArray(sp.other_players)) {
      const otherPlayerInputs = document.querySelectorAll('textarea[data-other-player-index]');
      otherPlayerInputs.forEach((ta) => {
        const idx = Number(ta.dataset.otherPlayerIndex);
        ta.value = sp.other_players[idx] || '';
      });
    }

    // fill scales array
    if (Array.isArray(sp.scales)) {
      const scaleInputs = document.querySelectorAll('input[data-scale-index]');
      scaleInputs.forEach((input) => {
        const idx = Number(input.dataset.scaleIndex);
        input.value = sp.scales[idx] || '';
      });
    }

    // attributes array - store in playerData and re-render
    if (Array.isArray(sp.attributes)) {
      playerData.attributes = sp.attributes.map(a => ({
        points: a.points || 0,
        sub_attributes: a.sub_attributes || []
      }));
    }

    // restore visibility flags (only if the corresponding button is shown)
    if (typeof sp.crewVisible === 'boolean') {
      crewVisible = sp.crewVisible && shouldShowCrewBtn;
    }
    if (typeof sp.bgVisible === 'boolean') {
      bgVisible = sp.bgVisible && shouldShowBgBtn;
    }
  }

  updateVisibility();
  renderAttributes();
  updatePointsDisplay();

  if (preserveUIState && savedState) {
    // Restore saved UI state without animations
    editMode = savedState.editMode;
    compactMode = savedState.compactMode;
    ecMode = savedState.ecMode;
    crewVisible = savedState.crewVisible;
    bgVisible = savedState.bgVisible;
    infoMode = savedState.infoMode;

    // Update button states
    const editBtn = document.getElementById('edit-btn');
    if (editBtn) editBtn.dataset.active = editMode ? 'true' : 'false';
    const toggleBtn = document.getElementById('toggle-btn');
    if (toggleBtn) toggleBtn.dataset.active = compactMode ? 'true' : 'false';
    const ecBtn = document.getElementById('ec-btn');
    if (ecBtn) ecBtn.dataset.active = ecMode ? 'true' : 'false';

    updateVisibility();
    renderAttributes();
    updatePointsDisplay();

    // Handle info mode display without animation
    const infoPage = document.getElementById('info-page-container');
    const charSheet = document.getElementById('char-sheet-container');
    const subtitle = document.getElementById('subtitle');
    if (infoMode) {
      if (charSheet) charSheet.style.display = 'none';
      if (subtitle) subtitle.style.display = 'block';
      if (infoPage) infoPage.classList.add('active');
    } else {
      if (charSheet) charSheet.style.display = '';
      if (subtitle) subtitle.style.display = 'none';
      if (infoPage) infoPage.classList.remove('active');
    }

    // Handle edit mode points display
    const row = document.getElementById('points-expander');
    if (row) row.style.display = editMode ? null : 'none';
  } else {
    infoMode = true;
    toggleInfoMode(); //makes sure were never in boring info mode when loading a new sheet, and also plays the nice face-in animation

    if (editMode) {
      toggleEditMode();
    }
  }
  updateTitle();
}

function setInputValue(key, value) {
  const el = document.querySelector(`[data-key='${key}']`);
  if (!el) return;
  el.value = value;
}
