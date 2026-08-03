// Socket.io setup. Two important ideas here:
//
// 1) We authenticate the socket connection with the same JWT used for REST.
//    Otherwise anyone could connect and listen to any room.
//
// 2) Each user joins a private room named `user:<id>`. When we want to notify
//    a specific user, we emit to that room. This works even if the user has
//    multiple tabs open — all their sockets are in the same room.
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

let io = null;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: process.env.CORS_ORIGIN || '*' },
  });

  // Middleware runs on every new connection. Reject if no valid token.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Missing auth token'));
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = payload; // { sub, email, role, iat, exp }
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.sub;
    socket.join(`user:${userId}`);
    console.log(`[socket] user ${userId} connected (${socket.id})`);

    socket.on('disconnect', () => {
      console.log(`[socket] user ${userId} disconnected (${socket.id})`);
    });
  });

  return io;
}

// Called from anywhere in the app to push events to a specific user.
function notifyUser(userId, event, payload) {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
}

module.exports = { initSocket, notifyUser };
