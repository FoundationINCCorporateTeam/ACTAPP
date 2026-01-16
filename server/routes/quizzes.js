/**
 * Quizzes Routes
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const storage = require('../services/storage');
const aiService = require('../services/ai');

const router = express.Router();

/**
 * Get all quizzes for current user
 * GET /api/quizzes
 */
router.get('/', async (req, res, next) => {
    try {
        const { subject, status, page = 1, limit = 12 } = req.query;
        
        let predicate = (quiz) => quiz.userId === req.session.userId;

        if (subject) {
            const oldPredicate = predicate;
            predicate = (quiz) => oldPredicate(quiz) && quiz.subject === subject;
        }
        if (status) {
            const oldPredicate = predicate;
            predicate = (quiz) => oldPredicate(quiz) && quiz.status === status;
        }

        const result = await storage.paginate('quizzes.json', predicate, parseInt(page), parseInt(limit), 
            { field: 'createdAt', order: 'desc' }
        );

        res.json({
            success: true,
            data: result,
            message: 'Quizzes retrieved',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Get single quiz
 * GET /api/quizzes/:id
 */
router.get('/:id', async (req, res, next) => {
    try {
        const quiz = await storage.findOne('quizzes.json', 
            q => q.id === req.params.id && q.userId === req.session.userId
        );

        if (!quiz) {
            return res.status(404).json({
                success: false,
                message: 'Quiz not found',
                errors: []
            });
        }

        res.json({
            success: true,
            data: { quiz },
            message: 'Quiz retrieved',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Generate a new quiz
 * POST /api/quizzes/generate
 */
router.post('/generate', async (req, res, next) => {
    try {
        const { subject, topic, customTopic, numQuestions, difficulty, timed, timeLimit, model } = req.body;

        // Validation
        if (!subject) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: ['Subject is required']
            });
        }

        const topicToUse = customTopic || topic || 'General';
        const questionsCount = Math.min(Math.max(numQuestions || 10, 5), 30);

        // Generate quiz questions using AI
        const questions = await aiService.generateQuiz(
            subject,
            topicToUse,
            questionsCount,
            difficulty || 'Intermediate',
            model
        );

        // Create quiz object
        const quiz = {
            id: uuidv4(),
            userId: req.session.userId,
            title: `${subject}: ${topicToUse} Quiz`,
            subject,
            topic: topicToUse,
            difficulty: difficulty || 'Intermediate',
            timed: timed || false,
            timeLimit: timed ? (timeLimit || questionsCount * 2) : null, // 2 minutes per question default
            questions: questions.map((q, index) => ({
                id: uuidv4(),
                number: index + 1,
                ...q,
                userAnswer: null,
                flagged: false
            })),
            status: 'not_started', // not_started, in_progress, completed
            score: null,
            answers: {},
            startedAt: null,
            completedAt: null,
            timeSpent: null,
            model: model || 'deepseek-v3',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await storage.insert('quizzes.json', quiz);

        res.status(201).json({
            success: true,
            data: { quiz },
            message: 'Quiz generated successfully',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Start a quiz
 * POST /api/quizzes/:id/start
 */
router.post('/:id/start', async (req, res, next) => {
    try {
        const quiz = await storage.findOne('quizzes.json', 
            q => q.id === req.params.id && q.userId === req.session.userId
        );

        if (!quiz) {
            return res.status(404).json({
                success: false,
                message: 'Quiz not found',
                errors: []
            });
        }

        if (quiz.status === 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Quiz already completed',
                errors: ['This quiz has already been completed']
            });
        }

        const updates = {
            status: 'in_progress',
            startedAt: quiz.startedAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const updatedQuiz = await storage.update('quizzes.json', 
            q => q.id === req.params.id, 
            updates
        );

        res.json({
            success: true,
            data: { quiz: updatedQuiz },
            message: 'Quiz started',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Save quiz answers (auto-save)
 * PUT /api/quizzes/:id/answers
 */
router.put('/:id/answers', async (req, res, next) => {
    try {
        const { answers, flagged } = req.body;

        const quiz = await storage.findOne('quizzes.json', 
            q => q.id === req.params.id && q.userId === req.session.userId
        );

        if (!quiz) {
            return res.status(404).json({
                success: false,
                message: 'Quiz not found',
                errors: []
            });
        }

        if (quiz.status === 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Quiz already completed',
                errors: ['Cannot update answers for a completed quiz']
            });
        }

        const updates = {
            answers: { ...quiz.answers, ...answers },
            updatedAt: new Date().toISOString()
        };

        // Update flagged questions if provided
        if (flagged) {
            updates.questions = quiz.questions.map(q => ({
                ...q,
                flagged: flagged[q.id] !== undefined ? flagged[q.id] : q.flagged
            }));
        }

        const updatedQuiz = await storage.update('quizzes.json', 
            q => q.id === req.params.id, 
            updates
        );

        res.json({
            success: true,
            data: { quiz: updatedQuiz },
            message: 'Answers saved',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Submit quiz
 * POST /api/quizzes/:id/submit
 */
router.post('/:id/submit', async (req, res, next) => {
    try {
        const { answers, timeSpent } = req.body;

        const quiz = await storage.findOne('quizzes.json', 
            q => q.id === req.params.id && q.userId === req.session.userId
        );

        if (!quiz) {
            return res.status(404).json({
                success: false,
                message: 'Quiz not found',
                errors: []
            });
        }

        if (quiz.status === 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Quiz already completed',
                errors: []
            });
        }

        // Merge final answers
        const finalAnswers = { ...quiz.answers, ...answers };

        // Calculate score
        let correct = 0;
        let incorrect = 0;
        let skipped = 0;

        const gradedQuestions = quiz.questions.map(q => {
            const userAnswer = finalAnswers[q.id];
            let status = 'skipped';

            if (!userAnswer) {
                skipped++;
            } else if (userAnswer === q.correctAnswer) {
                correct++;
                status = 'correct';
            } else {
                incorrect++;
                status = 'incorrect';
            }

            return {
                ...q,
                userAnswer,
                status
            };
        });

        const score = {
            correct,
            incorrect,
            skipped,
            total: quiz.questions.length,
            percentage: Math.round((correct / quiz.questions.length) * 100)
        };

        const updates = {
            status: 'completed',
            answers: finalAnswers,
            questions: gradedQuestions,
            score,
            timeSpent: timeSpent || null,
            completedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const updatedQuiz = await storage.update('quizzes.json', 
            q => q.id === req.params.id, 
            updates
        );

        // Update user stats
        const user = await storage.findOne('users.json', u => u.id === req.session.userId);
        if (user) {
            const bonusXp = Math.floor(score.percentage / 10) * 5; // 5 XP per 10% score
            user.stats.xp += 25 + bonusXp;
            user.stats.quizzesTaken = (user.stats.quizzesTaken || 0) + 1;
            
            // Check for achievements
            if (score.percentage === 100 && !user.stats.achievements.includes('perfect_score')) {
                user.stats.achievements.push('perfect_score');
            }
            if (user.stats.quizzesTaken >= 10 && !user.stats.achievements.includes('quiz_master')) {
                user.stats.achievements.push('quiz_master');
            }

            // Check for level up
            const xpForNextLevel = user.stats.level * 100;
            if (user.stats.xp >= xpForNextLevel) {
                user.stats.level++;
            }

            await storage.update('users.json', u => u.id === req.session.userId, { stats: user.stats });
        }

        // Update progress
        const progress = await storage.findOne('progress.json', p => p.userId === req.session.userId);
        if (progress) {
            const subjectKey = quiz.subject.toLowerCase();
            if (progress.subjects[subjectKey]) {
                progress.subjects[subjectKey].quizzesTaken++;
                progress.subjects[subjectKey].correctAnswers += correct;
                progress.subjects[subjectKey].totalQuestions += quiz.questions.length;
                progress.subjects[subjectKey].score = Math.round(
                    (progress.subjects[subjectKey].correctAnswers / progress.subjects[subjectKey].totalQuestions) * 100
                );
            }

            progress.activityLog.unshift({
                type: 'quiz_completed',
                subject: quiz.subject,
                topic: quiz.topic,
                quizId: quiz.id,
                score: score.percentage,
                timestamp: new Date().toISOString()
            });
            progress.activityLog = progress.activityLog.slice(0, 100);

            await storage.update('progress.json', p => p.userId === req.session.userId, {
                subjects: progress.subjects,
                activityLog: progress.activityLog
            });
        }

        res.json({
            success: true,
            data: { quiz: updatedQuiz, score },
            message: 'Quiz submitted successfully',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Get quiz results
 * GET /api/quizzes/:id/results
 */
router.get('/:id/results', async (req, res, next) => {
    try {
        const quiz = await storage.findOne('quizzes.json', 
            q => q.id === req.params.id && q.userId === req.session.userId
        );

        if (!quiz) {
            return res.status(404).json({
                success: false,
                message: 'Quiz not found',
                errors: []
            });
        }

        if (quiz.status !== 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Quiz not completed',
                errors: ['Complete the quiz to see results']
            });
        }

        res.json({
            success: true,
            data: { 
                quiz,
                score: quiz.score,
                questions: quiz.questions
            },
            message: 'Results retrieved',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Retry a quiz (create a copy)
 * POST /api/quizzes/:id/retry
 */
router.post('/:id/retry', async (req, res, next) => {
    try {
        const originalQuiz = await storage.findOne('quizzes.json', 
            q => q.id === req.params.id && q.userId === req.session.userId
        );

        if (!originalQuiz) {
            return res.status(404).json({
                success: false,
                message: 'Quiz not found',
                errors: []
            });
        }

        // Create a new quiz with the same questions but reset answers
        const newQuiz = {
            ...originalQuiz,
            id: uuidv4(),
            status: 'not_started',
            score: null,
            answers: {},
            startedAt: null,
            completedAt: null,
            timeSpent: null,
            questions: originalQuiz.questions.map(q => ({
                ...q,
                userAnswer: null,
                flagged: false,
                status: undefined
            })),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await storage.insert('quizzes.json', newQuiz);

        res.status(201).json({
            success: true,
            data: { quiz: newQuiz },
            message: 'Quiz retry created',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Delete quiz
 * DELETE /api/quizzes/:id
 */
router.delete('/:id', async (req, res, next) => {
    try {
        const deleted = await storage.remove('quizzes.json', 
            q => q.id === req.params.id && q.userId === req.session.userId
        );

        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: 'Quiz not found',
                errors: []
            });
        }

        res.json({
            success: true,
            data: {},
            message: 'Quiz deleted',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
