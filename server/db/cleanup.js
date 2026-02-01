const Sheet = require('./models/Sheet');
const config = require('../config');

/**
 * Delete sheets that haven't been accessed in X days
 */
async function cleanupOldSheets() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - config.cleanupDays);

  try {
    const result = await Sheet.deleteMany({
      lastAccessed: { $lt: cutoffDate }
    });

    if (result.deletedCount > 0) {
      console.log(`Cleanup: Deleted ${result.deletedCount} sheets not accessed since ${cutoffDate.toISOString()}`);
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

/**
 * Schedule cleanup: run once at startup, then every 24 hours
 */
function scheduleCleanup() {
  // Run cleanup immediately at startup
  cleanupOldSheets();

  // Then run every 24 hours
  setInterval(cleanupOldSheets, 24 * 60 * 60 * 1000);

  console.log(`Cleanup scheduled: ran at startup, then every 24 hours`);
  console.log(`Cleanup threshold: ${config.cleanupDays} days`);
}

module.exports = { cleanupOldSheets, scheduleCleanup };
