// ============================================================
// SPLIT UP — Express Server + Socket.IO
// ============================================================
require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('./server/models/User');
const { log } = require('console');

const app = express();
const server = http.createServer(app);

// ── Socket.IO Setup ────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',')
      : '*',
    methods: ['GET', 'POST']
  }
});

app.set('io', io);

// ── Security Middleware ────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false, // Allow inline scripts for existing frontend
    crossOriginEmbedderPolicy: false
  })
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  message: { success: false, message: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Stricter limit for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts. Please wait 15 minutes.' }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);

// ── CORS ───────────────────────────────────────────────────
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('CORS not allowed'));
  },
  credentials: true
}));

// ── Body Parsing ───────────────────────────────────────────
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Static Files ───────────────────────────────────────────
app.use(express.static(path.join(__dirname, '.')));

// ── API Routes ─────────────────────────────────────────────
app.use('/api/auth', require('./server/routes/auth'));
app.use('/api/groups', require('./server/routes/groups'));
app.use('/api/expenses', require('./server/routes/expenses'));
app.use('/api/polls', require('./server/routes/polls'));

// ── Health Check ───────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// ── SPA Fallback — serve index.html for all non-API routes ─
app.get('/{*splat}', (req, res) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, 'index.html'));
  }
});

// ── Socket.IO Auth & Room Management ──────────────────────
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) {
    // Allow connection without auth; features will be limited
    socket.user = null;
    return next();
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    socket.user = user || null;
    next();
  } catch {
    socket.user = null;
    next();
  }
});

io.on('connection', (socket) => {
  const userId = socket.user ? String(socket.user._id) : socket.id;
  console.log(`Socket connected: ${userId}`);

  // Join a group room for real-time updates
  socket.on('group:join', (groupId) => {
    socket.join(`group:${groupId}`);
    console.log(`${userId} joined room group:${groupId}`);
  });

  // Leave a group room
  socket.on('group:leave', (groupId) => {
    socket.leave(`group:${groupId}`);
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${userId}`);
  });
});

// ── Database Connection & Server Start ─────────────────────
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    console.log("heyy",process.env.MONGODB_URI);
    
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/splitup', {
      serverSelectionTimeoutMS: 5000
    });
    console.log('✅ MongoDB connected:', mongoose.connection.host);

    server.listen(PORT, () => {
      console.log(`
╔═══════════════════════════════════════╗
║  Split Up Server Running               ║
║  URL:  http://localhost:${PORT}          ║
║  DB:   ${mongoose.connection.host}  ║
╚═══════════════════════════════════════╝
      `);
    });
  } catch (err) {
    console('❌ MongoDB connection failed:', err.message);
    console('Make sure MongoDB is running. See README for setup instructions.');
    process.exit(1);
  }
}

startServer();

module.exports = { app, server };
