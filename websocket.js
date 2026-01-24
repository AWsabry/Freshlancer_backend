const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('./models/userModel');

let io = null;

function initializeWebSocket(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Authentication middleware for Socket.IO
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Get user from database
      const user = await User.findById(decoded.id).select('_id name email role active emailVerified');
      
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      if (!user.active) {
        return next(new Error('Authentication error: User account is suspended'));
      }

      if (!user.emailVerified) {
        return next(new Error('Authentication error: Email not verified'));
      }

      // Attach user to socket
      socket.user = {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
      };

      next();
    } catch (error) {
      next(new Error(`Authentication error: ${error.message}`));
    }
  });

  io.on('connection', (socket) => {
    console.log(`✅ WebSocket connected: ${socket.user.name} (${socket.user.id})`);

    // Join appeal room
    socket.on('join-appeal', (appealId) => {
      const room = `appeal-${appealId}`;
      socket.join(room);
      console.log(`📥 User ${socket.user.name} joined appeal room: ${room}`);
      
      // Notify others in the room
      socket.to(room).emit('user-joined', {
        userId: socket.user.id,
        userName: socket.user.name,
        timestamp: new Date(),
      });
    });

    // Leave appeal room
    socket.on('leave-appeal', (appealId) => {
      const room = `appeal-${appealId}`;
      socket.leave(room);
      console.log(`📤 User ${socket.user.name} left appeal room: ${room}`);
    });

    // Send message in appeal chat
    socket.on('send-message', async (data) => {
      try {
        const { appealId, content, attachments } = data;

        if (!appealId || !content) {
          socket.emit('error', { message: 'Appeal ID and content are required' });
          return;
        }

        const room = `appeal-${appealId}`;
        
        // Verify user is in the room
        if (!socket.rooms.has(room)) {
          socket.emit('error', { message: 'You must join the appeal room first' });
          return;
        }

        const messageData = {
          sender: {
            id: socket.user.id,
            name: socket.user.name,
            email: socket.user.email,
            role: socket.user.role,
          },
          content: content.trim(),
          attachments: attachments || [],
          timestamp: new Date(),
        };

        // Broadcast message to all users in the room (including sender)
        io.to(room).emit('new-message', messageData);

        console.log(`💬 Message sent in appeal ${appealId} by ${socket.user.name}`);
      } catch (error) {
        console.error('❌ Error handling send-message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Typing indicator
    socket.on('typing', (data) => {
      const { appealId, isTyping } = data;
      const room = `appeal-${appealId}`;
      
      socket.to(room).emit('user-typing', {
        userId: socket.user.id,
        userName: socket.user.name,
        isTyping,
      });
    });

    // Mark message as read
    socket.on('read-message', (data) => {
      const { appealId, messageId } = data;
      const room = `appeal-${appealId}`;
      
      socket.to(room).emit('message-read', {
        messageId,
        readBy: socket.user.id,
        readAt: new Date(),
      });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`❌ WebSocket disconnected: ${socket.user.name} (${socket.user.id})`);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`❌ Socket error for ${socket.user.name}:`, error);
    });
  });

  console.log('✅ WebSocket server initialized');
  return io;
}

function getIO() {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call initializeWebSocket first.');
  }
  return io;
}

module.exports = {
  initializeWebSocket,
  getIO,
};
