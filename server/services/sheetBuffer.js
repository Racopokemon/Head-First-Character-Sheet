const Sheet = require('../db/models/Sheet');
const config = require('../config');
const fs = require('fs');
const path = require('path');

// In-memory buffer for active sheets
const buffer = new Map();

// Track dirty (modified but not saved) sheets
const dirtySheets = new Set();

// Track user counts per room
const userCounts = new Map();

/**
 * Validate sheet ID format
 * Allows any characters except . / \ and control characters
 * @param {string} sheetId
 * @returns {boolean}
 */
function isValidSheetId(sheetId) {
  if (!sheetId || typeof sheetId !== 'string') return false;
  if (sheetId.length < 1 || sheetId.length > 64) return false;
  // Forbid . / \ and control characters (0x00-0x1F, 0x7F)
  if (/[./\\]/.test(sheetId)) return false;
  if (/[\x00-\x1F\x7F]/.test(sheetId)) return false;
  return true;
}

/**
 * Normalize sheet ID to lowercase for case-insensitive matching
 * @param {string} sheetId
 * @returns {string}
 */
function normalizeSheetId(sheetId) {
  return sheetId.toLowerCase();
}

/**
 * Generate a random state token for optimistic concurrency control
 * @returns {string}
 */
function generateStateToken() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * Compute a simple hash of the set_by_gm object for change detection
 * @param {Object} setByGm
 * @returns {string}
 */
function computeGmHash(setByGm) {
  if (!setByGm) return '';
  const str = JSON.stringify(setByGm);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}

/**
 * Load default template (can be specified in env)
 * @returns {Object}
 */
function loadDefaultTemplate() {
  try {
    const defaultPath = path.join(__dirname, '../../public/' + config.defaultFile);
    const content = fs.readFileSync(defaultPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error loading starting file:', error);
    // Return minimal default if file not found
    return {
      set_by_gm: {
        localization: { title: 'Head First!' },
        attributes: []
      }
    };
  }
}

/**
 * Get sheet from buffer or database, or create new from default.json
 * @param {string} sheetId
 * @returns {Promise<{data: Object, isNew: boolean}>}
 */
async function getSheet(sheetId) {
  // Check buffer first
  if (buffer.has(sheetId)) {
    const data = buffer.get(sheetId);
    return { data, isNew: false };
  }

  // Try to load from database
  try {
    const sheet = await Sheet.findOne({ sheetId });
    if (sheet) {
      const data = {
        sheetId: sheet.sheetId,
        set_by_gm: sheet.set_by_gm,
        set_by_player: sheet.set_by_player || {},
        gmHash: sheet.gmHash,
        stateToken: generateStateToken(), // Generate fresh token when loading into memory
        picture: (sheet.picture && sheet.picture.data) ? { data: sheet.picture.data, contentType: sheet.picture.contentType } : null,
        pictureVersion: sheet.pictureVersion || null
      };
      buffer.set(sheetId, data);
      return { data, isNew: false };
    }
  } catch (error) {
    console.error('Error loading sheet from DB:', error);
  }

  // Create new sheet from default.json
  const defaultData = loadDefaultTemplate();
  const newData = {
    sheetId,
    set_by_gm: defaultData.set_by_gm,
    set_by_player: defaultData.set_by_player || {},
    gmHash: computeGmHash(defaultData.set_by_gm),
    stateToken: generateStateToken(),
    picture: null,
    pictureVersion: null
  };
  buffer.set(sheetId, newData);

  // Save immediately to DB to prevent duplicate uploads
  await saveSheet(sheetId);

  return { data: newData, isNew: true };
}

/**
* Update sheet in buffer with optimistic concurrency control
 * @param {string} sheetId
 * @param {Object} setByGm
 * @param {Object} setByPlayer
 * @param {string} newGmHash
 * @param {string} clientStateToken - Token the client believes is current
 * @returns {{accepted: boolean, data: Object}} - If rejected, data contains current state
 */
function updateSheet(sheetId, setByGm, setByPlayer, newGmHash, clientStateToken) {
  const existing = buffer.get(sheetId);

    // Check if client's token matches current state
  if (!existing || existing.stateToken !== clientStateToken) {
    // Client is out of sync - reject update, return current state
    console.log(`Rejected update for ${sheetId}: token mismatch (client: ${clientStateToken}, server: ${existing?.stateToken})`);
    return { accepted: false, data: existing };
  }

  // Token matches - accept update with new token
  // Picture data never travels through the regular sheet-update payload (see setPicture/clearPicture) -
  // strip it defensively so it can never get lost or duplicated here, and carry over the existing picture untouched.
  const cleanSetByPlayer = { ...(setByPlayer || {}) };
  delete cleanSetByPlayer.picture;

  const newStateToken = generateStateToken();
  const data = {
    sheetId,
    set_by_gm: setByGm,
    set_by_player: cleanSetByPlayer,
    gmHash: newGmHash,
    stateToken: newStateToken,
    picture: existing.picture || null,
    pictureVersion: existing.pictureVersion || null
  };

  buffer.set(sheetId, data);
  dirtySheets.add(sheetId);

  return { accepted: true, data };
}

/**
 * Save a specific sheet to the database
 * @param {string} sheetId
 */
async function saveSheet(sheetId) {
  if (!buffer.has(sheetId)) return;

  const data = buffer.get(sheetId);
  try {
    await Sheet.findOneAndUpdate(
      { sheetId },
      {
        set_by_gm: data.set_by_gm,
        set_by_player: data.set_by_player,
        gmHash: data.gmHash,
        picture: data.picture || null,
        pictureVersion: data.pictureVersion || null,
        lastAccessed: new Date()
      },
      { upsert: true, new: true }
    );
    // Only clear the dirty flag if the buffer entry we just persisted is still the current one -
    // a concurrent updateSheet()/setPicture()/clearPicture() call can replace it with a newer
    // object while this write was in flight (awaiting Mongo). If that happened, that newer change
    // was never part of what we just saved, so it must stay marked dirty for the next save.
    if (buffer.get(sheetId) === data) {
      dirtySheets.delete(sheetId);
    }
    console.log(`Saved sheet: ${sheetId}`);
  } catch (error) {
    console.error(`Error saving sheet ${sheetId}:`, error);
  }
}

/**
 * Save all dirty sheets to database
 */
async function flushAllDirty() {
  const sheetsToSave = Array.from(dirtySheets);
  console.log(`Flushing ${sheetsToSave.length} dirty sheets to database`);

  for (const sheetId of sheetsToSave) {
    await saveSheet(sheetId);
  }
}

/**
 * Remove sheet from buffer (but keep in DB)
 * Call this when last user leaves a room
 * @param {string} sheetId
 */
async function evictSheet(sheetId) {
  if (dirtySheets.has(sheetId)) {
    await saveSheet(sheetId);
  }
  buffer.delete(sheetId);
  console.log(`Evicted sheet from buffer: ${sheetId}`);
}

/**
 * Start the periodic sync interval
 */
function startSyncInterval() {
  const intervalMs = config.bufferSyncInterval * 60 * 1000;
  setInterval(async () => {
    await flushAllDirty();
  }, intervalMs);
  console.log(`Buffer sync interval started: every ${config.bufferSyncInterval} minutes`);
}

/**
 * Update user count for a room
 * @param {string} sheetId
 * @param {number} count
 */
function setUserCount(sheetId, count) {
  if (count <= 0) {
    userCounts.delete(sheetId);
  } else {
    userCounts.set(sheetId, count);
  }
}

/**
 * Get user count for a room
 * @param {string} sheetId
 * @returns {number}
 */
function getUserCount(sheetId) {
  return userCounts.get(sheetId) || 0;
}

/**
 * Parse a "data:<mime>;base64,<data>" URL into a Buffer + contentType
 * @param {string} dataUrl
 * @returns {{data: Buffer, contentType: string}|null}
 */
function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/s);
  if (!match) return null;
  return { data: Buffer.from(match[2], 'base64'), contentType: match[1] };
}

/**
 * Set (or replace) the picture for a sheet. Persists immediately (not just marked dirty),
 * since uploads are infrequent and losing one on a server restart before the next
 * periodic flush would be a bad experience.
 *
 * Only operates on a sheet that's already buffered (i.e. someone currently has it open) rather
 * than routing through getSheet()'s create-on-demand behavior - otherwise a POST to an arbitrary
 * sheet ID nobody ever visited would silently create a brand-new sheet that then never enters the
 * normal join/leave eviction lifecycle (see evictSheet, only wired into socket handlers) and
 * leaks in memory for the life of the process.
 * @param {string} sheetId
 * @param {Buffer} imageData
 * @param {string} contentType
 * @returns {Promise<{success: boolean, pictureVersion?: string, error?: string}>}
 */
function setPicture(sheetId, imageData, contentType) {
  const data = buffer.get(sheetId);
  if (!data) return { success: false, error: 'not_found' };
  data.picture = { data: imageData, contentType };
  data.pictureVersion = generateStateToken();
  buffer.set(sheetId, data);
  saveSheet(sheetId);
  return { success: true, pictureVersion: data.pictureVersion };
}

/**
 * Clear the picture for a sheet. Persists immediately, see setPicture (including the same
 * "only touch an already-buffered sheet" reasoning).
 * @param {string} sheetId
 * @returns {Promise<{success: boolean, pictureVersion?: string, error?: string}>}
 */
function clearPicture(sheetId) {
  const data = buffer.get(sheetId);
  if (!data) return { success: false, error: 'not_found' };
  data.picture = null;
  data.pictureVersion = generateStateToken();
  buffer.set(sheetId, data);
  saveSheet(sheetId);
  return { success: true, pictureVersion: data.pictureVersion };
}

/**
 * Get the picture for a sheet (buffer first, falls back to DB for a sheet with no active room)
 * @param {string} sheetId
 * @returns {Promise<{data: Buffer, contentType: string, pictureVersion: string}|null>}
 */
async function getPicture(sheetId) {
  const existing = buffer.get(sheetId);
  if (existing) {
    if (!existing.picture || !existing.picture.data) return null;
    return { data: existing.picture.data, contentType: existing.picture.contentType, pictureVersion: existing.pictureVersion };
  }

  try {
    const sheet = await Sheet.findOne({ sheetId }).select('picture pictureVersion');
    if (sheet && sheet.picture && sheet.picture.data) {
      return { data: sheet.picture.data, contentType: sheet.picture.contentType, pictureVersion: sheet.pictureVersion };
    }
  } catch (error) {
    console.error(`Error loading picture for ${sheetId}:`, error);
  }
  return null;
}

/**
 * Create a new sheet with custom data (for upload feature)
 * Checks if sheet already exists in buffer OR database
 * @param {string} sheetId
 * @param {Object} data - Object with set_by_gm and set_by_player
 * @returns {Promise<{success: boolean, error?: string, url?: string}>}
 */
async function createNewSheet(sheetId, data) {
  // Validate sheet ID
  if (!isValidSheetId(sheetId)) {
    return { success: false, error: 'invalid' };
  }

  // Normalize sheet ID
  const normalizedId = normalizeSheetId(sheetId);

  // Check for reserved names
  if (normalizedId === 'nosync' || normalizedId === '') {
    return { success: false, error: 'reserved' };
  }

  // Check buffer first
  if (buffer.has(normalizedId)) {
    return { success: false, error: 'exists' };
  }

  // Check database
  try {
    const existing = await Sheet.findOne({ sheetId: normalizedId });
    if (existing) {
      return { success: false, error: 'exists' };
    }

    // Create new sheet
    // The picture (if any) arrives embedded as a data URL in set_by_player.picture (that's the
    // self-contained representation used by full sheet export/import/upload) - pull it out into
    // its own field rather than storing it twice, keeping parity with the regular sync path.
    const setByPlayer = { ...(data.set_by_player || {}) };
    const embeddedPicture = parseDataUrl(setByPlayer.picture);
    delete setByPlayer.picture;

    const gmHash = computeGmHash(data.set_by_gm);
    const newSheet = new Sheet({
      sheetId: normalizedId,
      set_by_gm: data.set_by_gm,
      set_by_player: setByPlayer,
      gmHash,
      picture: embeddedPicture,
      pictureVersion: embeddedPicture ? generateStateToken() : null,
      lastAccessed: new Date(),
      createdAt: new Date()
    });

    await newSheet.save();

    /* Neat, but ppl could (theoretically) cause memory leaks with this :D
    // Also add to buffer for immediate availability
    const bufferData = {
      sheetId: normalizedId,
      set_by_gm: data.set_by_gm,
      set_by_player: data.set_by_player || {},
      gmHash,
      stateToken: generateStateToken()
    };
    buffer.set(normalizedId, bufferData);
    */

    return { success: true, url: `/${normalizedId}` };
  } catch (error) {
    console.error('Error creating new sheet:', error);
    return { success: false, error: 'server' };
  }
}

module.exports = {
  isValidSheetId,
  normalizeSheetId,
  computeGmHash,
  getSheet,
  updateSheet,
  saveSheet,
  flushAllDirty,
  evictSheet,
  startSyncInterval,
  setUserCount,
  getUserCount,
  createNewSheet,
  setPicture,
  clearPicture,
  getPicture
};
