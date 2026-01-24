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
 * Schedule daily cleanup at midnight
 */
function scheduleCleanup() {
  // Calculate time until next midnight
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const msUntilMidnight = midnight.getTime() - now.getTime();

  // Run first cleanup at midnight, then every 24 hours
  setTimeout(() => {
    cleanupOldSheets();
    // Then run every 24 hours
    setInterval(cleanupOldSheets, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);

  console.log(`Cleanup scheduled: first run at ${midnight.toISOString()}, then daily`);
  console.log(`Cleanup threshold: ${config.cleanupDays} days`);
}

module.exports = { cleanupOldSheets, scheduleCleanup };
