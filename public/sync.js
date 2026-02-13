/**
 * Head First! Real-Time Sync Client
 * Handles Socket.io connection, state synchronization, and UI updates
 */

// Sync state
let syncEnabled = false;
let currentSheetId = null;
let socket = null;
let isOnline = false;
let currentGmHash = '';
let currentStateToken = null; // For optimistic concurrency control
let reconnectAttempts = 0;
let broadcastTimeout = null;
const BROADCAST_DEBOUNCE_MS = 300;

/**
 * Compute a hash of an object for change detection
 * Must match server-side computeGmHash
 * @param {Object} obj
 * @returns {string}
 */
function computeHash(obj) {
  if (!obj) return '';
  const str = JSON.stringify(obj);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

/**
 * Parse the URL to determine sync mode and sheet ID
 * @returns {{syncEnabled: boolean, sheetId: string|null}}
 */
function parseUrl() {
  const path = window.location.pathname;

  // Root or /nosync = no sync
  if (path === '/' || path === '/nosync') {
    return { syncEnabled: false, sheetId: null };
  }

  // Extract sheet ID from path (decode URL-encoded characters like %C3%A4 → ä)
  // Only reject . / \ and control characters
  const match = path.match(/^\/(.+)$/);
  if (match) {
    let sheetId;
    try {
      sheetId = decodeURIComponent(match[1]);
    } catch (e) {
      // Invalid URI encoding
      return { syncEnabled: false, sheetId: null };
    }

    // Validate: length 1-64, no . / \ or control chars
    if (sheetId.length < 1 || sheetId.length > 64) {
      return { syncEnabled: false, sheetId: null };
    }
    if (/[./\\]/.test(sheetId) || /[\x00-\x1F\x7F]/.test(sheetId)) {
      return { syncEnabled: false, sheetId: null };
    }

    // Normalize to lowercase for case-insensitive matching
    return { syncEnabled: true, sheetId: sheetId.toLowerCase() };
  }

  // Invalid path, no sync
  return { syncEnabled: false, sheetId: null };
}

/**
 * Initialize the sync system
 * Called on page load from script.js
 */
function initSync() {
  const urlInfo = parseUrl();
  syncEnabled = urlInfo.syncEnabled;
  currentSheetId = urlInfo.sheetId;

  console.log('Sync init:', { syncEnabled, currentSheetId });

  if (!syncEnabled) {
    // No sync mode - hide user count, load default.json as before
    hideUserCount();
    return false;
  }

  // Sync mode - connect to server
  showUserCount(0);
  connectSocket();
  return true;
}

/**
 * Connect to Socket.io server
 */
function connectSocket() {
  if (socket) {
    socket.disconnect();
  }

  // Connect to the server (same origin)
  socket = io({
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
  });

  socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
    isOnline = true;
    reconnectAttempts = 0;
    hideReconnectingOverlay();

    // Join the room for this sheet
    socket.emit('join-room', { sheetId: currentSheetId });
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected');
    isOnline = false;
    showReconnectingOverlay();
  });

  socket.on('connect_error', (error) => {
    console.log('Socket connection error:', error);
    reconnectAttempts++;
  });

  socket.on('sheet-data', handleSheetData);
  socket.on('stateToken-update', handleStateTokenUpdate)
  socket.on('sheet-update', handleRemoteUpdate);
  socket.on('user-count', handleUserCount);
  socket.on('error', handleServerError);
}

/**
 * Handle initial sheet data from server (also used when update is rejected)
 * @param {{set_by_gm: Object, set_by_player: Object, gmHash: string, stateToken: string, isNew: boolean}} data */
function handleSheetData(data) {
  console.log('Received sheet data:', { isNew: data.isNew, gmHash: data.gmHash, stateToken: data.stateToken });

  currentGmHash = data.gmHash;
  currentStateToken = data.stateToken;

  // Apply the data using the global applyImported function
  const json = {
    set_by_gm: data.set_by_gm,
    set_by_player: data.set_by_player
  };

  // Use the existing applyImported function
  if (typeof applyImported === 'function') {
    applyImported(json);
  }
}

function handleStateTokenUpdate(data) {
  currentStateToken = data.stateToken;
}

/**
 * Handle remote updates from other clients (or confirmation of own update)
 * @param {{set_by_gm: Object, set_by_player: Object, gmHash: string, stateToken: string}} data
 */
function handleRemoteUpdate(data) {
// Determine change type locally by comparing gmHash
  const isBreakingChange = (currentGmHash !== data.gmHash);
  console.log('Remote update:', { isBreakingChange, oldGmHash: currentGmHash, newGmHash: data.gmHash, stateToken: data.stateToken });

  // Update local state
  currentGmHash = data.gmHash;
  currentStateToken = data.stateToken;

  const json = {
    set_by_gm: data.set_by_gm,
    set_by_player: data.set_by_player
  };

  if (isBreakingChange) {
    // Full re-render with animations
    if (typeof applyImported === 'function') {
      applyImported(json);
    }
  } else {
    // Small change - try in-place update to preserve focus
    if (typeof applyRemoteSmallChange === 'function') {
      applyRemoteSmallChange(json);
    } else {
      // Fallback if function not available
      if (typeof applyImported === 'function') {
        applyImported(json, { preserveUIState: true });
      }
    }
  }
}

/**
 * Handle user count updates
 * @param {{count: number}} data
 */
function handleUserCount(data) {
  updateUserCountDisplay(data.count);
}

/**
 * Handle server errors
 * @param {{message: string}} data
 */
function handleServerError(data) {
  console.error('Server error:', data.message);
}

/**
 * Collect current state from the DOM and playerData
 * Extracted from handleExport logic
 * @returns {{set_by_gm: Object, set_by_player: Object}}
 */
function collectCurrentState() {
  if (!gmTemplate) return null;

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
  const infoBigEl = document.querySelector('[data-key="info_big"]');
  out.set_by_player.info_big = infoBigEl ? infoBigEl.value : '';

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

  // visibility flags
  out.set_by_player.crewVisible = crewVisible;
  out.set_by_player.bgVisible = bgVisible;

  return out;
}

/**
 * Broadcast current state to other clients
 * Called after any local change
 */
function broadcastChange() {
  if (!syncEnabled || !isOnline || !socket) return;

  // Debounce rapid changes
  if (broadcastTimeout) {
    clearTimeout(broadcastTimeout);
  }

  broadcastTimeout = setTimeout(() => {
    const state = collectCurrentState();
    if (!state) return;

    const newGmHash = computeHash(state.set_by_gm);

    socket.emit('sheet-update', {
      set_by_gm: state.set_by_gm,
      set_by_player: state.set_by_player,
      gmHash: newGmHash,
      stateToken: currentStateToken // Send current token for concurrency check
    });
    currentGmHash = newGmHash;
  }, BROADCAST_DEBOUNCE_MS);
}

/**
 * Debounced version for use in input handlers
 */
function debouncedBroadcast() {
  broadcastChange();
}

// UI Functions

/**
 * Show an overlay with a custom message
 * @param {string} message - The message to display
 * @param {string} overlayId - ID for the overlay element (default: 'reconnecting-overlay')
 */
function showOverlay(message, overlayId = 'reconnecting-overlay') {
  let overlay = document.getElementById(overlayId);
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = overlayId;
    overlay.className = 'reconnecting-overlay';

    overlay.innerHTML = `
      <div class="reconnecting-content">
        <div class="reconnecting-spinner"></div>
        <div class="reconnecting-text">${message}</div>
      </div>
    `;
    document.body.appendChild(overlay);
  } else {
    // Update message if overlay already exists
    const textEl = overlay.querySelector('.reconnecting-text');
    if (textEl) textEl.textContent = message;
  }
  overlay.style.display = 'flex';

  // Disable all interactions on main content
  const container = document.querySelector('.container');
  if (container) container.inert = true;
}

/**
 * Hide an overlay
 * @param {string} overlayId - ID for the overlay element (default: 'reconnecting-overlay')
 */
function hideOverlay(overlayId = 'reconnecting-overlay') {
  const overlay = document.getElementById(overlayId);
  if (overlay) {
    overlay.style.display = 'none';
  }

  // Re-enable interactions on main content
  const container = document.querySelector('.container');
  if (container) container.inert = false;
}

/**
 * Show reconnecting overlay (legacy wrapper)
 */
function showReconnectingOverlay() {
  const loc = (typeof gmTemplate !== 'undefined' && gmTemplate && gmTemplate.localization) ? gmTemplate.localization : {};
  showOverlay(loc.reconnecting || 'Reconnecting...');
}

/**
 * Hide reconnecting overlay (legacy wrapper)
 */
function hideReconnectingOverlay() {
  hideOverlay();
}

/**
 * Update user count display
 * Shows "+X" where X is number of OTHER users (count - 1)
 * Hidden when alone (count <= 1)
 * @param {number} count
 */
function updateUserCountDisplay(count) {
  const label = document.getElementById('user-count-label');
  const text = document.getElementById('user-count-text');
  if (label) {
    const others = count - 1;
    if (others >= 1) {
      if (text) text.textContent = '+' + others;
      label.style.display = '';
    } else {
      label.style.display = 'none';
    }
  }
}

/**
 * Show user count element (uses updateUserCountDisplay logic)
 * @param {number} initialCount
 */
function showUserCount(initialCount) {
  updateUserCountDisplay(initialCount);
}

/**
 * Hide user count element
 */
function hideUserCount() {
  const label = document.getElementById('user-count-label');
  if (label) {
    label.style.display = 'none';
  }
}

/**
 * Check if sync is currently enabled
 * @returns {boolean}
 */
function isSyncEnabled() {
  return syncEnabled;
}

/**
 * Check if currently online
 * @returns {boolean}
 */
function isSyncOnline() {
  return isOnline;
}

// Export functions for use in script.js
// Note: These are globals since we're not using modules
window.syncModule = {
  initSync,
  broadcastChange,
  debouncedBroadcast,
  isSyncEnabled,
  isSyncOnline,
  collectCurrentState,
  computeHash,
  showOverlay,
  hideOverlay
};
