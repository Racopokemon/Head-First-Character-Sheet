require('dotenv').config();

module.exports = {
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/headfirst',
  port: parseInt(process.env.PORT, 10) || 3000,
  bufferSyncInterval: parseInt(process.env.BUFFER_SYNC_INTERVAL, 10) || 5, // minutes
  cleanupDays: parseInt(process.env.CLEANUP_DAYS, 10) || 30, // days
  defaultFile: process.env.DEFAULT_FILE || 'default.json' //only nosync mode (always default.json for synced links)
};
