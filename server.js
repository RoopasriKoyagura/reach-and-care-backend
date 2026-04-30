require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/db');

// Route imports
const ivrRoutes = require('./routes/ivr');
const elderlyRoutes = require('./routes/elderly');
const volunteerRoutes = require('./routes/volunteers');
const requestRoutes = require('./routes/requests');
const adminRoutes = require('./routes/admin');

// Connect to MongoDB
connectDB();

const app = express();
const server = http.createServer(app);

// ================================
// SOCKET.IO - Real-time notifications
// ================================
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST'],
  },
});

// Make io accessible in routes
app.set('io', io);

io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  // Volunteer joins their personal room to receive notifications
  socket.on('join_volunteer', (volunteerId) => {
    socket.join(`volunteer_${volunteerId}`);
    console.log(`Volunteer ${volunteerId} joined their room`);
  });

  // Admin joins admin room
  socket.on('join_admin', () => {
    socket.join('admin_room');
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Socket disconnected: ${socket.id}`);
  });
});

// ================================
// MIDDLEWARE
// ================================
app.use(helmet());
app.set('trust proxy', 1);
app.use(morgan('dev'));
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests, please try again later.',
});
app.use('/api/', apiLimiter);

// Body parsers
// Important: IVR routes need urlencoded (Twilio sends form data)
app.use('/api/ivr', express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ================================
// ROUTES
// ================================
app.use('/api/ivr', ivrRoutes);
app.use('/api/elderly', elderlyRoutes);
app.use('/api/volunteers', volunteerRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Reach & Care API is running ✅',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// Root
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Reach & Care API 🤝' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

// ================================
// START SERVER
// ================================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║   🤝 Reach & Care API Running        ║
  ║   Port: ${PORT}                         ║
  ║   Mode: ${process.env.NODE_ENV || 'development'}              ║
  ╚══════════════════════════════════════╝
  `);
});

module.exports = { app, server, io };
