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
 * @param {string} sheetId
 * @returns {boolean}
 */
function isValidSheetId(sheetId) {
  return /^[a-zA-Z0-9-]{1,64}$/.test(sheetId);
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
 * Load default.json template
 * @returns {Object}
 */
function loadDefaultTemplate() {
  try {
    const defaultPath = path.join(__dirname, '../../public/default.json');
    const content = fs.readFileSync(defaultPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error loading default.json:', error);
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
        gmHash: sheet.gmHash
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
    gmHash: computeGmHash(defaultData.set_by_gm)
  };
  buffer.set(sheetId, newData);
  dirtySheets.add(sheetId);

  return { data: newData, isNew: true };
}

/**
 * Update sheet in buffer
 * @param {string} sheetId
 * @param {Object} setByGm
 * @param {Object} setByPlayer
 * @param {string} newGmHash
 * @returns {{changeType: 'breaking'|'small', gmHash: string}}
 */
function updateSheet(sheetId, setByGm, setByPlayer, newGmHash) {
  const existing = buffer.get(sheetId);
  const oldGmHash = existing ? existing.gmHash : '';

  const data = {
    sheetId,
    set_by_gm: setByGm,
    set_by_player: setByPlayer || {},
    gmHash: newGmHash
  };

  buffer.set(sheetId, data);
  dirtySheets.add(sheetId);

  // Determine change type
  const changeType = (oldGmHash !== newGmHash) ? 'breaking' : 'small';

  return { changeType, gmHash: newGmHash };
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
        lastAccessed: new Date()
      },
      { upsert: true, new: true }
    );
    dirtySheets.delete(sheetId);
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

module.exports = {
  isValidSheetId,
  computeGmHash,
  getSheet,
  updateSheet,
  saveSheet,
  flushAllDirty,
  evictSheet,
  startSyncInterval,
  setUserCount,
  getUserCount
};
