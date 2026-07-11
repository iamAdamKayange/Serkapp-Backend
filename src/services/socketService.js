let io;

const initSocket = (server) => {
  io = require('socket.io')(server, {
    cors: {
      origin: process.env.SOCKET_CORS_ORIGIN || '*',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('join:landlord', (landlordId) => {
      if (landlordId) socket.join(`landlord:${landlordId}`);
    });

    socket.on('leave:landlord', (landlordId) => {
      if (landlordId) socket.leave(`landlord:${landlordId}`);
    });

    socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected: ${socket.id} (${reason})`);
    });
  });

  return io;
};

const emitToAll = (event, payload = {}) => {
  if (!io) return;
  io.emit(event, {
    ...payload,
    emittedAt: new Date().toISOString(),
  });
};

const emitToLandlord = (landlordId, event, payload = {}) => {
  if (!io || !landlordId) return;
  io.to(`landlord:${landlordId}`).emit(event, {
    ...payload,
    emittedAt: new Date().toISOString(),
  });
};

module.exports = {
  initSocket,
  emitToAll,
  emitToLandlord,
};
