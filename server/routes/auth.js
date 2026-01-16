/**
 * Authentication Routes
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const storage = require('../services/storage');

const router = express.Router();

// Configure multer for avatar uploads
const avatarStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'avatars');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `avatar-${Date.now()}${ext}`);
    }
});

const upload = multer({
    storage: avatarStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'));
        }
    }
});

/**
 * Register a new user
 * POST /api/auth/register
 */
router.post('/register', async (req, res, next) => {
    try {
        const { username, email, password, name } = req.body;

        // Validation
        if (!username || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: ['Username, email, and password are required']
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: ['Password must be at least 8 characters long']
            });
        }

        // Check if user already exists
        const existingUser = await storage.findOne('users.json', 
            u => u.email === email || u.username === username
        );

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User already exists',
                errors: ['A user with this email or username already exists']
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const user = {
            id: uuidv4(),
            username,
            email,
            password: hashedPassword,
            name: name || username,
            avatar: null,
            bio: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            settings: {
                theme: 'light',
                notifications: true,
                studyReminders: true,
                defaultModel: 'deepseek-v3',
                timezone: 'America/New_York'
            },
            stats: {
                xp: 0,
                level: 1,
                streak: 0,
                lastStudyDate: null,
                lessonsCompleted: 0,
                quizzesTaken: 0,
                testsTaken: 0,
                totalStudyTime: 0,
                achievements: []
            }
        };

        await storage.insert('users.json', user);

        // Initialize user progress
        const progress = {
            userId: user.id,
            subjects: {
                english: { score: 0, quizzesTaken: 0, correctAnswers: 0, totalQuestions: 0 },
                math: { score: 0, quizzesTaken: 0, correctAnswers: 0, totalQuestions: 0 },
                reading: { score: 0, quizzesTaken: 0, correctAnswers: 0, totalQuestions: 0 },
                science: { score: 0, quizzesTaken: 0, correctAnswers: 0, totalQuestions: 0 },
                writing: { essays: 0, averageScore: 0 }
            },
            testScores: [],
            activityLog: [],
            createdAt: new Date().toISOString()
        };

        await storage.insert('progress.json', progress);

        // Create session
        req.session.userId = user.id;
        req.session.username = user.username;

        // Return user without password
        const { password: _, ...userWithoutPassword } = user;

        res.status(201).json({
            success: true,
            data: { user: userWithoutPassword },
            message: 'Registration successful',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Login user
 * POST /api/auth/login
 */
router.post('/login', async (req, res, next) => {
    try {
        const { email, password, remember } = req.body;

        // Validation
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: ['Email and password are required']
            });
        }

        // Find user
        const user = await storage.findOne('users.json', 
            u => u.email === email || u.username === email
        );

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials',
                errors: ['Invalid email or password']
            });
        }

        // Check password
        const isValidPassword = await bcrypt.compare(password, user.password);

        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials',
                errors: ['Invalid email or password']
            });
        }

        // Update streak
        const today = new Date().toDateString();
        const lastStudy = user.stats.lastStudyDate ? new Date(user.stats.lastStudyDate).toDateString() : null;
        const yesterday = new Date(Date.now() - 86400000).toDateString();

        if (lastStudy !== today) {
            user.stats.lastStudyDate = new Date().toISOString();
            if (lastStudy === yesterday) {
                user.stats.streak++;
            } else if (lastStudy !== today) {
                user.stats.streak = 1;
            }
            await storage.update('users.json', u => u.id === user.id, { stats: user.stats });
        }

        // Create session
        req.session.userId = user.id;
        req.session.username = user.username;

        if (remember) {
            req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
        }

        // Return user without password
        const { password: _, ...userWithoutPassword } = user;

        res.json({
            success: true,
            data: { user: userWithoutPassword },
            message: 'Login successful',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Logout user
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Logout failed',
                errors: ['Failed to destroy session']
            });
        }

        res.clearCookie('connect.sid');
        res.json({
            success: true,
            data: {},
            message: 'Logout successful',
            errors: []
        });
    });
});

/**
 * Get current user
 * GET /api/auth/me
 */
router.get('/me', async (req, res, next) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: 'Not authenticated',
                errors: ['Please log in']
            });
        }

        const user = await storage.findOne('users.json', u => u.id === req.session.userId);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found',
                errors: ['User session is invalid']
            });
        }

        const { password: _, ...userWithoutPassword } = user;

        res.json({
            success: true,
            data: { user: userWithoutPassword },
            message: 'User retrieved',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Update user profile
 * PUT /api/auth/profile
 */
router.put('/profile', async (req, res, next) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: 'Not authenticated',
                errors: ['Please log in']
            });
        }

        const { name, bio, email } = req.body;
        const updates = { updatedAt: new Date().toISOString() };

        if (name) updates.name = name;
        if (bio !== undefined) updates.bio = bio;
        if (email) {
            // Check if email is taken by another user
            const existingUser = await storage.findOne('users.json', 
                u => u.email === email && u.id !== req.session.userId
            );
            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: 'Email already in use',
                    errors: ['This email is already associated with another account']
                });
            }
            updates.email = email;
        }

        const user = await storage.update('users.json', u => u.id === req.session.userId, updates);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
                errors: []
            });
        }

        const { password: _, ...userWithoutPassword } = user;

        res.json({
            success: true,
            data: { user: userWithoutPassword },
            message: 'Profile updated',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Upload avatar
 * POST /api/auth/avatar
 */
router.post('/avatar', upload.single('avatar'), async (req, res, next) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: 'Not authenticated',
                errors: ['Please log in']
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded',
                errors: ['Please select an image file']
            });
        }

        const avatarUrl = `/uploads/avatars/${req.file.filename}`;

        // Get current user to delete old avatar
        const currentUser = await storage.findOne('users.json', u => u.id === req.session.userId);
        if (currentUser && currentUser.avatar) {
            const oldAvatarPath = path.join(__dirname, '..', '..', currentUser.avatar);
            if (fs.existsSync(oldAvatarPath)) {
                fs.unlinkSync(oldAvatarPath);
            }
        }

        const user = await storage.update('users.json', u => u.id === req.session.userId, {
            avatar: avatarUrl,
            updatedAt: new Date().toISOString()
        });

        const { password: _, ...userWithoutPassword } = user;

        res.json({
            success: true,
            data: { user: userWithoutPassword, avatarUrl },
            message: 'Avatar uploaded',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Change password
 * PUT /api/auth/password
 */
router.put('/password', async (req, res, next) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: 'Not authenticated',
                errors: ['Please log in']
            });
        }

        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: ['Current password and new password are required']
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: ['New password must be at least 8 characters long']
            });
        }

        const user = await storage.findOne('users.json', u => u.id === req.session.userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
                errors: []
            });
        }

        const isValidPassword = await bcrypt.compare(currentPassword, user.password);

        if (!isValidPassword) {
            return res.status(400).json({
                success: false,
                message: 'Invalid password',
                errors: ['Current password is incorrect']
            });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await storage.update('users.json', u => u.id === req.session.userId, {
            password: hashedPassword,
            updatedAt: new Date().toISOString()
        });

        res.json({
            success: true,
            data: {},
            message: 'Password changed successfully',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
