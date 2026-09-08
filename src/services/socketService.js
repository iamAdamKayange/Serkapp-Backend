let io;

const initSocket = (server) => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:4028',
    'https://serkapp.com',
    'https://serikadmin.vercel.app',
  ];

  io = require('socket.io')(server, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    socket.on('join:landlord', (landlordId) => {
      if (landlordId) socket.join(`landlord:${landlordId}`);
    });

    socket.on('leave:landlord', (landlordId) => {
      if (landlordId) socket.leave(`landlord:${landlordId}`);
    });

    socket.on('disconnect', (reason) => {
      // Socket disconnected
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
