/**
 * ACT AI Tutor - Main Server
 * Production-ready Express.js server for HestiaCP deployment
 */

require('dotenv').config();

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

// Import routes
const authRoutes = require('./routes/auth');
const lessonsRoutes = require('./routes/lessons');
const quizzesRoutes = require('./routes/quizzes');
const testsRoutes = require('./routes/tests');
const chatRoutes = require('./routes/chat');
const studyPlansRoutes = require('./routes/studyplans');
const essaysRoutes = require('./routes/essays');
const flashcardsRoutes = require('./routes/flashcards');
const progressRoutes = require('./routes/progress');
const settingsRoutes = require('./routes/settings');

// Import middleware
const { authMiddleware } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
            connectSrc: ["'self'"],
            frameSrc: ["'self'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
        }
    },
    crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? `https://${process.env.DOMAIN}` 
        : true,
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per 15 minutes
    message: { success: false, message: 'Too many requests, please try again later.', errors: [] },
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        sameSite: 'lax'
    }
}));

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/lessons', authMiddleware, lessonsRoutes);
app.use('/api/quizzes', authMiddleware, quizzesRoutes);
app.use('/api/tests', authMiddleware, testsRoutes);
app.use('/api/chat', authMiddleware, chatRoutes);
app.use('/api/study-plans', authMiddleware, studyPlansRoutes);
app.use('/api/essays', authMiddleware, essaysRoutes);
app.use('/api/flashcards', authMiddleware, flashcardsRoutes);
app.use('/api/progress', authMiddleware, progressRoutes);
app.use('/api/settings', authMiddleware, settingsRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ success: true, data: { status: 'healthy', timestamp: new Date().toISOString() }, message: 'Server is running', errors: [] });
});

// Serve HTML pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'register.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'dashboard.html'));
});

app.get('/lessons', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'lessons.html'));
});

app.get('/lesson/:id', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'lesson-viewer.html'));
});

app.get('/quizzes', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'quizzes.html'));
});

app.get('/quiz/:id', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'quiz-taker.html'));
});

app.get('/quiz-results/:id', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'quiz-results.html'));
});

app.get('/tests', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'tests.html'));
});

app.get('/test/:id', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'test-taker.html'));
});

app.get('/test-results/:id', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'test-results.html'));
});

app.get('/chat', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'chat.html'));
});

app.get('/study-plan', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'study-plan.html'));
});

app.get('/essays', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'essays.html'));
});

app.get('/flashcards', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'flashcards.html'));
});

app.get('/progress', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'progress.html'));
});

app.get('/settings', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'settings.html'));
});

app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'profile.html'));
});

app.get('/help', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'help.html'));
});

// 404 handler
app.use((req, res) => {
    if (req.accepts('html')) {
        res.status(404).sendFile(path.join(__dirname, '..', 'public', 'pages', '404.html'));
    } else {
        res.status(404).json({ success: false, message: 'Not found', errors: [] });
    }
});

// Error handler
app.use(errorHandler);

// Set server timeout for long AI requests (5 minutes)
const server = app.listen(PORT, () => {
    console.log(`ACT AI Tutor server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    if (process.send) {
        process.send('ready');
    }
});

server.timeout = 300000; // 5 minutes
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

module.exports = app;
