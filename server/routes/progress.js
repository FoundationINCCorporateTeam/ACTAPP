/**
 * Progress Routes
 */

const express = require('express');
const storage = require('../services/storage');

const router = express.Router();

/**
 * Get user progress summary
 * GET /api/progress
 */
router.get('/', async (req, res, next) => {
    try {
        const progress = await storage.findOne('progress.json', 
            p => p.userId === req.session.userId
        );

        const user = await storage.findOne('users.json', 
            u => u.id === req.session.userId
        );

        if (!progress) {
            return res.status(404).json({
                success: false,
                message: 'Progress not found',
                errors: []
            });
        }

        res.json({
            success: true,
            data: { 
                progress,
                stats: user?.stats || {}
            },
            message: 'Progress retrieved',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Get detailed analytics
 * GET /api/progress/analytics
 */
router.get('/analytics', async (req, res, next) => {
    try {
        const progress = await storage.findOne('progress.json', 
            p => p.userId === req.session.userId
        );

        const user = await storage.findOne('users.json', 
            u => u.id === req.session.userId
        );

        // Get all quizzes for score history
        const quizzes = await storage.findMany('quizzes.json', 
            q => q.userId === req.session.userId && q.status === 'completed'
        );

        // Get all tests for composite score history
        const tests = await storage.findMany('tests.json', 
            t => t.userId === req.session.userId && t.status === 'completed'
        );

        // Calculate analytics
        const scoreHistory = quizzes
            .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt))
            .map(q => ({
                date: q.completedAt,
                subject: q.subject,
                score: q.score.percentage,
                type: 'quiz'
            }));

        tests.forEach(t => {
            scoreHistory.push({
                date: t.completedAt,
                subject: 'Full Test',
                score: t.compositeScore,
                type: 'test',
                compositeScore: t.compositeScore
            });
        });

        scoreHistory.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Calculate estimated ACT score
        let estimatedScore = 18; // Default
        if (tests.length > 0) {
            const recentTests = tests.slice(-3);
            estimatedScore = Math.round(recentTests.reduce((sum, t) => sum + t.compositeScore, 0) / recentTests.length);
        } else if (progress && progress.subjects) {
            const subjectScores = Object.values(progress.subjects)
                .filter(s => s.score > 0)
                .map(s => Math.round(s.score * 0.36)); // Convert percentage to 1-36 scale
            if (subjectScores.length > 0) {
                estimatedScore = Math.round(subjectScores.reduce((a, b) => a + b, 0) / subjectScores.length);
            }
        }

        // Calculate study time by day (last 30 days)
        const studyByDay = {};
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        if (progress && progress.activityLog) {
            progress.activityLog
                .filter(a => new Date(a.timestamp) >= thirtyDaysAgo)
                .forEach(activity => {
                    const day = new Date(activity.timestamp).toLocaleDateString('en-US', { weekday: 'long' });
                    studyByDay[day] = (studyByDay[day] || 0) + 1;
                });
        }

        // Identify strengths and weaknesses
        const topicPerformance = {};
        quizzes.forEach(q => {
            if (!topicPerformance[q.topic]) {
                topicPerformance[q.topic] = { correct: 0, total: 0 };
            }
            topicPerformance[q.topic].correct += q.score.correct;
            topicPerformance[q.topic].total += q.score.total;
        });

        const topicScores = Object.entries(topicPerformance)
            .map(([topic, data]) => ({
                topic,
                accuracy: Math.round((data.correct / data.total) * 100),
                questionsAttempted: data.total
            }))
            .sort((a, b) => b.accuracy - a.accuracy);

        const strengths = topicScores.filter(t => t.accuracy >= 80).slice(0, 5);
        const weaknesses = topicScores.filter(t => t.accuracy < 60).slice(0, 5);

        res.json({
            success: true,
            data: {
                scoreHistory,
                estimatedScore,
                subjects: progress?.subjects || {},
                testScores: progress?.testScores || [],
                studyByDay,
                topicScores,
                strengths,
                weaknesses,
                stats: user?.stats || {},
                recentActivity: (progress?.activityLog || []).slice(0, 20)
            },
            message: 'Analytics retrieved',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Get activity log
 * GET /api/progress/activity
 */
router.get('/activity', async (req, res, next) => {
    try {
        const { page = 1, limit = 20 } = req.query;

        const progress = await storage.findOne('progress.json', 
            p => p.userId === req.session.userId
        );

        if (!progress) {
            return res.json({
                success: true,
                data: { activities: [], total: 0 },
                message: 'No activity',
                errors: []
            });
        }

        const start = (parseInt(page) - 1) * parseInt(limit);
        const activities = progress.activityLog.slice(start, start + parseInt(limit));

        res.json({
            success: true,
            data: { 
                activities,
                total: progress.activityLog.length,
                page: parseInt(page),
                totalPages: Math.ceil(progress.activityLog.length / parseInt(limit))
            },
            message: 'Activity retrieved',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Log study time
 * POST /api/progress/study-time
 */
router.post('/study-time', async (req, res, next) => {
    try {
        const { minutes, subject, activity } = req.body;

        const user = await storage.findOne('users.json', u => u.id === req.session.userId);
        if (user) {
            user.stats.totalStudyTime = (user.stats.totalStudyTime || 0) + (minutes || 0);
            
            // Update streak
            const today = new Date().toDateString();
            const lastStudy = user.stats.lastStudyDate ? new Date(user.stats.lastStudyDate).toDateString() : null;
            
            if (lastStudy !== today) {
                const yesterday = new Date(Date.now() - 86400000).toDateString();
                if (lastStudy === yesterday) {
                    user.stats.streak++;
                } else if (lastStudy !== today) {
                    user.stats.streak = 1;
                }
                user.stats.lastStudyDate = new Date().toISOString();
            }

            await storage.update('users.json', u => u.id === req.session.userId, { stats: user.stats });
        }

        // Log activity
        const progress = await storage.findOne('progress.json', p => p.userId === req.session.userId);
        if (progress) {
            progress.activityLog.unshift({
                type: 'study_session',
                minutes,
                subject,
                activity,
                timestamp: new Date().toISOString()
            });
            progress.activityLog = progress.activityLog.slice(0, 100);
            await storage.update('progress.json', p => p.userId === req.session.userId, { activityLog: progress.activityLog });
        }

        res.json({
            success: true,
            data: { stats: user?.stats },
            message: 'Study time logged',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Get achievements
 * GET /api/progress/achievements
 */
router.get('/achievements', async (req, res, next) => {
    try {
        const user = await storage.findOne('users.json', u => u.id === req.session.userId);

        const allAchievements = [
            { id: 'first_lesson', name: 'First Lesson', description: 'Complete your first lesson', icon: '📚', xp: 50 },
            { id: 'quiz_master', name: 'Quiz Master', description: 'Complete 10 quizzes', icon: '🎯', xp: 100 },
            { id: 'perfect_score', name: 'Perfect Score', description: 'Get 100% on a quiz', icon: '💯', xp: 150 },
            { id: 'test_taker', name: 'Test Taker', description: 'Complete a practice test', icon: '📝', xp: 200 },
            { id: 'week_warrior', name: 'Week Warrior', description: 'Study for 7 days in a row', icon: '🔥', xp: 100 },
            { id: 'month_master', name: 'Month Master', description: 'Study for 30 days in a row', icon: '🏆', xp: 500 },
            { id: 'subject_expert', name: 'Subject Expert', description: 'Score 90%+ in a subject', icon: '⭐', xp: 150 },
            { id: 'early_bird', name: 'Early Bird', description: 'Study before 8 AM', icon: '🌅', xp: 50 },
            { id: 'night_owl', name: 'Night Owl', description: 'Study after 10 PM', icon: '🦉', xp: 50 },
            { id: 'speed_demon', name: 'Speed Demon', description: 'Complete a quiz in under 5 minutes', icon: '⚡', xp: 75 },
            { id: 'perfectionist', name: 'Perfectionist', description: 'Get 5 perfect quiz scores', icon: '✨', xp: 250 },
            { id: 'essay_writer', name: 'Essay Writer', description: 'Submit 5 essays for grading', icon: '✍️', xp: 100 },
            { id: 'flashcard_fan', name: 'Flashcard Fan', description: 'Study 100 flashcards', icon: '🃏', xp: 75 }
        ];

        const userAchievements = user?.stats?.achievements || [];
        const achievements = allAchievements.map(a => ({
            ...a,
            earned: userAchievements.includes(a.id),
            earnedAt: null // Could track this if needed
        }));

        res.json({
            success: true,
            data: { 
                achievements,
                earned: achievements.filter(a => a.earned).length,
                total: achievements.length
            },
            message: 'Achievements retrieved',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Export all user data
 * GET /api/progress/export
 */
router.get('/export', async (req, res, next) => {
    try {
        const userId = req.session.userId;

        const user = await storage.findOne('users.json', u => u.id === userId);
        const progress = await storage.findOne('progress.json', p => p.userId === userId);
        const lessons = await storage.findMany('lessons.json', l => l.userId === userId);
        const quizzes = await storage.findMany('quizzes.json', q => q.userId === userId);
        const tests = await storage.findMany('tests.json', t => t.userId === userId);
        const chats = await storage.findMany('chat_history.json', c => c.userId === userId);
        const plans = await storage.findMany('study_plans.json', p => p.userId === userId);
        const essays = await storage.findMany('essays.json', e => e.userId === userId);
        const flashcards = await storage.findMany('flashcards.json', f => f.userId === userId);

        // Remove sensitive data
        if (user) {
            delete user.password;
        }

        const exportData = {
            exportedAt: new Date().toISOString(),
            user: user ? { ...user, password: undefined } : null,
            progress,
            lessons,
            quizzes,
            tests,
            chats,
            studyPlans: plans,
            essays,
            flashcards
        };

        res.json({
            success: true,
            data: exportData,
            message: 'Data exported',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
