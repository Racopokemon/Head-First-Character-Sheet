const sheetBuffer = require('../services/sheetBuffer');

/**
 * Get the number of clients in a room
 * @param {import('socket.io').Server} io
 * @param {string} roomName
 * @returns {number}
 */
function getRoomSize(io, roomName) {
  const room = io.sockets.adapter.rooms.get(roomName);
  return room ? room.size : 0;
}

/**
 * Broadcast user count to all clients in a room
 * @param {import('socket.io').Server} io
 * @param {string} sheetId
 */
function broadcastUserCount(io, sheetId) {
  const count = getRoomSize(io, sheetId);
  sheetBuffer.setUserCount(sheetId, count);
  io.to(sheetId).emit('user-count', { count });
}

/**
 * Setup Socket.io event handlers
 * @param {import('socket.io').Server} io
 */
function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    let currentRoom = null;

    // Handle joining a room
    socket.on('join-room', async ({ sheetId }) => {
      // Validate sheet ID
      if (!sheetBuffer.isValidSheetId(sheetId)) {
        socket.emit('error', { message: 'Invalid sheet ID (1-64 characters, no . / \\ allowed).' });
        return;
      }

      // Normalize to lowercase for case-insensitive matching
      const normalizedId = sheetBuffer.normalizeSheetId(sheetId);

      // Leave previous room if any
      if (currentRoom) {
        socket.leave(currentRoom);
        const oldRoomSize = getRoomSize(io, currentRoom);
        broadcastUserCount(io, currentRoom);

        // If room is now empty, evict from buffer
        if (oldRoomSize === 0) {
          await sheetBuffer.evictSheet(currentRoom);
        }
      }

      // Join new room (using normalized ID)
      currentRoom = normalizedId;
      socket.join(normalizedId);

      console.log(`Client ${socket.id} joined room: ${normalizedId}`);

      // Get or create sheet data (using normalized ID)
      const { data, isNew } = await sheetBuffer.getSheet(normalizedId);

      // Send initial data to the client
      socket.emit('sheet-data', {
        set_by_gm: data.set_by_gm,
        set_by_player: data.set_by_player,
        gmHash: data.gmHash,
        stateToken: data.stateToken,
        isNew
      });

      // Broadcast updated user count
      broadcastUserCount(io, normalizedId);
    });

    // Handle sheet updates
    socket.on('sheet-update', ({ set_by_gm, set_by_player, gmHash, stateToken }) => {
      if (!currentRoom) {
        socket.emit('error', { message: 'Not in a room. Join a room first.' });
        return;
      }

      // Try to update the buffer (with optimistic concurrency check)
      const { accepted, data } = sheetBuffer.updateSheet(
        currentRoom,
        set_by_gm,
        set_by_player,
        gmHash,
        stateToken
      );

      if (accepted) {
        // Update accepted - broadcast to ALL clients in the room (including sender)
        io.to(currentRoom).emit('sheet-update', {
          set_by_gm: data.set_by_gm,
          set_by_player: data.set_by_player,
          gmHash: data.gmHash,
          stateToken: data.stateToken
        });
        console.log(`Sheet update in room ${currentRoom}: accepted`);
      } else {
        // Update rejected - send current state back to only this client
        socket.emit('sheet-data', {
          set_by_gm: data.set_by_gm,
          set_by_player: data.set_by_player,
          gmHash: data.gmHash,
          stateToken: data.stateToken,
          isNew: false
        });
        console.log(`Sheet update in room ${currentRoom}: rejected (stale token)`);
      }
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
      console.log(`Client disconnected: ${socket.id}`);

      if (currentRoom) {
        const roomSize = getRoomSize(io, currentRoom);
        broadcastUserCount(io, currentRoom);

        // If room is now empty, evict from buffer (saves to DB)
        if (roomSize === 0) {
          await sheetBuffer.evictSheet(currentRoom);
        }
      }
    });
  });
}

module.exports = { setupSocketHandlers };
