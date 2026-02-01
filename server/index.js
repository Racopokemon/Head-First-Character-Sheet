const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

const config = require('./config');
const { connectToDatabase } = require('./db/connection');
const { setupSocketHandlers } = require('./socket/handlers');
const { startSyncInterval, flushAllDirty } = require('./services/sheetBuffer');
const { scheduleCleanup } = require('./db/cleanup');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Serve static files from public directory
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

// Routes
// Serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// Serve index.html for /nosync (explicit no-sync mode)
app.get('/nosync', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// Serve index.html for any sheet ID (sync mode)
// Sheet ID validation happens on the client/socket side
app.get('/:sheetId', (req, res) => {
  const { sheetId } = req.params;

  // Basic validation - reject obvious non-sheet-id paths
  if (sheetId.includes('.') || sheetId.length > 64) {
    res.status(404).send('Not found');
    return;
  }

  // Validate sheet ID format
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(sheetId)) {
    res.status(400).send('Invalid sheet ID. Use only letters, numbers, and hyphens (1-64 characters).');
    return;
  }

  res.sendFile(path.join(publicPath, 'index.html'));
});

// Setup socket handlers
setupSocketHandlers(io);

// Graceful shutdown
async function shutdown() {
  console.log('\nShutting down...');

  // Flush all dirty sheets to database
  await flushAllDirty();

  // Close server
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    console.log('Forcing exit...');
    process.exit(1);
  }, 10000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start server
async function start() {
  try {
    // Connect to MongoDB
    await connectToDatabase();

    // Start buffer sync interval
    startSyncInterval();

    // Schedule daily cleanup
    scheduleCleanup();

    // Start HTTP server
    httpServer.listen(config.port, () => {
      console.log(`\nHead First! server running at http://localhost:${config.port}`);
      console.log(`\nRoutes:`);
      console.log(`  /             - No sync (local only)`);
      console.log(`  /nosync       - No sync (local only)`);
      console.log(`  /:sheetId     - Real-time sync enabled`);
      console.log(`\nExample: http://localhost:${config.port}/my-group-2024`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
