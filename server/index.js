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

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));

// Serve static files from public directory
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

// Routes
// Serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// Default file for nosync editor can be set by env variable (so providing your friends that one sheet is just one env away)
app.get('/nosync-default.json', (req, res) => {
  res.sendFile(path.join(publicPath, config.defaultFile));
});

// Upload endpoint for creating a new synced sheet from nosync mode
app.post('/upload', async (req, res) => {
  const { sheetId: rawSheetId, data } = req.body;

  console.log('Requested to upload new sheet to /'+rawSheetId);

  // Validate request body
  if (!rawSheetId || !data) {
    return res.status(400).json({
      error: 'invalid',
      message: 'Missing sheetId or data'
    });
  }

  // Import sheetBuffer functions
  const { isValidSheetId, normalizeSheetId, computeGmHash } = require('./services/sheetBuffer');
  const Sheet = require('./db/models/Sheet');

  // Validate sheet ID
  if (!isValidSheetId(rawSheetId))
    return res.status(400).json({error: 'invalid', message: 'Invalid sheet ID format'});

  // Normalize sheet ID (lowercase)
  const sheetId = normalizeSheetId(rawSheetId);

  // Check for reserved names
  if (sheetId === 'nosync')
    return res.status(400).json({error: 'reserved', message: 'This name is reserved'});

  // Check if sheet already exists
  try {
    const existing = await Sheet.findOne({ sheetId });
    if (existing) 
      return res.status(409).json({error: 'exists', message: 'Sheet already exists'});

    // Create new sheet
    const gmHash = computeGmHash(data.set_by_gm);
    const newSheet = new Sheet({
      sheetId,
      set_by_gm: data.set_by_gm,
      set_by_player: data.set_by_player || {},
      gmHash,
      lastAccessed: new Date(),
      createdAt: new Date()
    });
    await newSheet.save();
    // Return success with the sheet URL
    console.log('Upload to /'+sheetId+' successful');
    return res.status(200).json({success: true, sheetId, url: `/${sheetId}`
    });
  } catch (error) {
    console.error('Error creating sheet:', error);
    return res.status(500).json({error: 'server', message: 'Server error while creating sheet'
    });
  }
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
  // Forbid . / \ and control characters, max 64 chars
  if (sheetId.includes('.') || sheetId.includes('/') || sheetId.includes('\\')) {
    res.status(404).send('Not found');
    return;
  }
  if (sheetId.length > 64 || sheetId.length < 1) {
    res.status(400).send('Invalid sheet ID (1-64 characters).');
    return;
  }
  if (/[\x00-\x1F\x7F]/.test(sheetId)) {
    res.status(400).send('Invalid sheet ID (control characters not allowed).');
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
