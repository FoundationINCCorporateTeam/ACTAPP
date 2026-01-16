/**
 * Settings Routes
 */

const express = require('express');
const storage = require('../services/storage');

const router = express.Router();

/**
 * Get user settings
 * GET /api/settings
 */
router.get('/', async (req, res, next) => {
    try {
        const user = await storage.findOne('users.json', u => u.id === req.session.userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
                errors: []
            });
        }

        res.json({
            success: true,
            data: { settings: user.settings || {} },
            message: 'Settings retrieved',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Update user settings
 * PUT /api/settings
 */
router.put('/', async (req, res, next) => {
    try {
        const {
            theme,
            notifications,
            studyReminders,
            reminderTime,
            reminderDays,
            defaultModel,
            timezone,
            profileVisibility,
            dataSharing,
            fontSize,
            highContrast,
            language
        } = req.body;

        const user = await storage.findOne('users.json', u => u.id === req.session.userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
                errors: []
            });
        }

        const settings = user.settings || {};

        if (theme !== undefined) settings.theme = theme;
        if (notifications !== undefined) settings.notifications = notifications;
        if (studyReminders !== undefined) settings.studyReminders = studyReminders;
        if (reminderTime !== undefined) settings.reminderTime = reminderTime;
        if (reminderDays !== undefined) settings.reminderDays = reminderDays;
        if (defaultModel !== undefined) settings.defaultModel = defaultModel;
        if (timezone !== undefined) settings.timezone = timezone;
        if (profileVisibility !== undefined) settings.profileVisibility = profileVisibility;
        if (dataSharing !== undefined) settings.dataSharing = dataSharing;
        if (fontSize !== undefined) settings.fontSize = fontSize;
        if (highContrast !== undefined) settings.highContrast = highContrast;
        if (language !== undefined) settings.language = language;

        await storage.update('users.json', u => u.id === req.session.userId, {
            settings,
            updatedAt: new Date().toISOString()
        });

        res.json({
            success: true,
            data: { settings },
            message: 'Settings updated',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Get available timezones
 * GET /api/settings/timezones
 */
router.get('/timezones', (req, res) => {
    const timezones = [
        'America/New_York',
        'America/Chicago',
        'America/Denver',
        'America/Los_Angeles',
        'America/Anchorage',
        'Pacific/Honolulu',
        'Europe/London',
        'Europe/Paris',
        'Europe/Berlin',
        'Asia/Tokyo',
        'Asia/Shanghai',
        'Asia/Singapore',
        'Australia/Sydney',
        'UTC'
    ];

    res.json({
        success: true,
        data: { timezones },
        message: 'Timezones retrieved',
        errors: []
    });
});

/**
 * Delete user account
 * DELETE /api/settings/account
 */
router.delete('/account', async (req, res, next) => {
    try {
        const { password } = req.body;
        const bcrypt = require('bcryptjs');

        const user = await storage.findOne('users.json', u => u.id === req.session.userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
                errors: []
            });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(400).json({
                success: false,
                message: 'Invalid password',
                errors: ['Password is incorrect']
            });
        }

        // Delete all user data
        const userId = req.session.userId;

        await storage.remove('users.json', u => u.id === userId);
        await storage.remove('progress.json', p => p.userId === userId);
        
        // Remove all user content
        const lessons = await storage.findMany('lessons.json', l => l.userId === userId);
        for (const lesson of lessons) {
            await storage.remove('lessons.json', l => l.id === lesson.id);
        }

        const quizzes = await storage.findMany('quizzes.json', q => q.userId === userId);
        for (const quiz of quizzes) {
            await storage.remove('quizzes.json', q => q.id === quiz.id);
        }

        const tests = await storage.findMany('tests.json', t => t.userId === userId);
        for (const test of tests) {
            await storage.remove('tests.json', t => t.id === test.id);
        }

        const chats = await storage.findMany('chat_history.json', c => c.userId === userId);
        for (const chat of chats) {
            await storage.remove('chat_history.json', c => c.id === chat.id);
        }

        const plans = await storage.findMany('study_plans.json', p => p.userId === userId);
        for (const plan of plans) {
            await storage.remove('study_plans.json', p => p.id === plan.id);
        }

        const essays = await storage.findMany('essays.json', e => e.userId === userId);
        for (const essay of essays) {
            await storage.remove('essays.json', e => e.id === essay.id);
        }

        const flashcards = await storage.findMany('flashcards.json', f => f.userId === userId);
        for (const deck of flashcards) {
            await storage.remove('flashcards.json', f => f.id === deck.id);
        }

        // Destroy session
        req.session.destroy();

        res.json({
            success: true,
            data: {},
            message: 'Account deleted successfully',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
