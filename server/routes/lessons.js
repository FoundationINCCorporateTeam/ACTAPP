/**
 * Lessons Routes
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const storage = require('../services/storage');
const aiService = require('../services/ai');

const router = express.Router();

// ACT subjects and topics
const ACT_TOPICS = {
    english: [
        'Grammar and Usage', 'Punctuation', 'Sentence Structure', 'Rhetorical Skills',
        'Style', 'Organization', 'Strategy', 'Subject-Verb Agreement', 'Pronoun Usage',
        'Verb Tenses', 'Modifiers', 'Parallel Structure', 'Comma Usage', 'Apostrophes',
        'Colons and Semicolons', 'Dashes and Parentheses'
    ],
    math: [
        'Pre-Algebra', 'Elementary Algebra', 'Intermediate Algebra', 'Coordinate Geometry',
        'Plane Geometry', 'Trigonometry', 'Linear Equations', 'Quadratic Equations',
        'Functions', 'Matrices', 'Probability', 'Statistics', 'Number Properties',
        'Ratios and Proportions', 'Percentages', 'Exponents and Logarithms'
    ],
    reading: [
        'Prose Fiction', 'Social Science', 'Humanities', 'Natural Science',
        'Main Idea', 'Supporting Details', 'Inferences', 'Author\'s Purpose',
        'Vocabulary in Context', 'Comparative Reading', 'Tone and Style',
        'Textual Evidence', 'Summarization', 'Literary Analysis'
    ],
    science: [
        'Data Representation', 'Research Summaries', 'Conflicting Viewpoints',
        'Biology', 'Chemistry', 'Physics', 'Earth Science', 'Scientific Method',
        'Experimental Design', 'Data Analysis', 'Graph Interpretation',
        'Variables and Controls', 'Scientific Reasoning'
    ],
    writing: [
        'Essay Structure', 'Thesis Development', 'Argument Building',
        'Evidence and Examples', 'Counterarguments', 'Transitions',
        'Introduction Techniques', 'Conclusion Strategies', 'Perspective Analysis'
    ]
};

/**
 * Get all lessons for current user
 * GET /api/lessons
 */
router.get('/', async (req, res, next) => {
    try {
        const { subject, topic, difficulty, completed, favorite, search, sort, page = 1, limit = 12 } = req.query;
        
        let predicate = (lesson) => lesson.userId === req.session.userId;

        // Apply filters
        if (subject) {
            const oldPredicate = predicate;
            predicate = (lesson) => oldPredicate(lesson) && lesson.subject === subject;
        }
        if (topic) {
            const oldPredicate = predicate;
            predicate = (lesson) => oldPredicate(lesson) && lesson.topic === topic;
        }
        if (difficulty) {
            const oldPredicate = predicate;
            predicate = (lesson) => oldPredicate(lesson) && lesson.difficulty === difficulty;
        }
        if (completed !== undefined) {
            const oldPredicate = predicate;
            predicate = (lesson) => oldPredicate(lesson) && lesson.completed === (completed === 'true');
        }
        if (favorite !== undefined) {
            const oldPredicate = predicate;
            predicate = (lesson) => oldPredicate(lesson) && lesson.favorite === (favorite === 'true');
        }
        if (search) {
            const oldPredicate = predicate;
            const searchLower = search.toLowerCase();
            predicate = (lesson) => oldPredicate(lesson) && (
                lesson.title.toLowerCase().includes(searchLower) ||
                lesson.content.toLowerCase().includes(searchLower) ||
                lesson.topic.toLowerCase().includes(searchLower)
            );
        }

        // Determine sort options
        let sortOptions = null;
        if (sort === 'newest') {
            sortOptions = { field: 'createdAt', order: 'desc' };
        } else if (sort === 'oldest') {
            sortOptions = { field: 'createdAt', order: 'asc' };
        } else if (sort === 'title') {
            sortOptions = { field: 'title', order: 'asc' };
        }

        const result = await storage.paginate('lessons.json', predicate, parseInt(page), parseInt(limit), sortOptions);

        res.json({
            success: true,
            data: result,
            message: 'Lessons retrieved',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Get available topics
 * GET /api/lessons/topics
 */
router.get('/topics', (req, res) => {
    res.json({
        success: true,
        data: { topics: ACT_TOPICS },
        message: 'Topics retrieved',
        errors: []
    });
});

/**
 * Get AI models
 * GET /api/lessons/models
 */
router.get('/models', (req, res) => {
    res.json({
        success: true,
        data: { models: aiService.getModels() },
        message: 'Models retrieved',
        errors: []
    });
});

/**
 * Get single lesson
 * GET /api/lessons/:id
 */
router.get('/:id', async (req, res, next) => {
    try {
        const lesson = await storage.findOne('lessons.json', 
            l => l.id === req.params.id && l.userId === req.session.userId
        );

        if (!lesson) {
            return res.status(404).json({
                success: false,
                message: 'Lesson not found',
                errors: []
            });
        }

        res.json({
            success: true,
            data: { lesson },
            message: 'Lesson retrieved',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Generate a new lesson
 * POST /api/lessons/generate
 */
router.post('/generate', async (req, res, next) => {
    try {
        const { subject, topic, customTopic, difficulty, length, focusAreas, model } = req.body;

        // Validation
        if (!subject) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: ['Subject is required']
            });
        }

        const topicToUse = customTopic || topic;
        if (!topicToUse) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: ['Topic is required']
            });
        }

        // Generate lesson content using AI
        const content = await aiService.generateLesson(
            subject,
            topicToUse,
            difficulty || 'Intermediate',
            length || 'Medium',
            focusAreas || ['Concepts', 'Examples', 'Practice Problems'],
            model
        );

        // Create lesson object
        const lesson = {
            id: uuidv4(),
            userId: req.session.userId,
            title: `${subject}: ${topicToUse}`,
            subject,
            topic: topicToUse,
            difficulty: difficulty || 'Intermediate',
            length: length || 'Medium',
            focusAreas: focusAreas || ['Concepts', 'Examples', 'Practice Problems'],
            content,
            notes: '',
            completed: false,
            favorite: false,
            model: model || 'deepseek-v3',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await storage.insert('lessons.json', lesson);

        // Update user stats
        const user = await storage.findOne('users.json', u => u.id === req.session.userId);
        if (user) {
            user.stats.xp += 50;
            user.stats.lessonsCompleted = (user.stats.lessonsCompleted || 0) + 1;
            
            // Check for level up
            const xpForNextLevel = user.stats.level * 100;
            if (user.stats.xp >= xpForNextLevel) {
                user.stats.level++;
            }

            await storage.update('users.json', u => u.id === req.session.userId, { stats: user.stats });
        }

        // Log activity
        const progress = await storage.findOne('progress.json', p => p.userId === req.session.userId);
        if (progress) {
            progress.activityLog.unshift({
                type: 'lesson_generated',
                subject,
                topic: topicToUse,
                lessonId: lesson.id,
                timestamp: new Date().toISOString()
            });
            // Keep only last 100 activities
            progress.activityLog = progress.activityLog.slice(0, 100);
            await storage.update('progress.json', p => p.userId === req.session.userId, { activityLog: progress.activityLog });
        }

        res.status(201).json({
            success: true,
            data: { lesson },
            message: 'Lesson generated successfully',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Update lesson
 * PUT /api/lessons/:id
 */
router.put('/:id', async (req, res, next) => {
    try {
        const { notes, completed, favorite } = req.body;
        const updates = { updatedAt: new Date().toISOString() };

        if (notes !== undefined) updates.notes = notes;
        if (completed !== undefined) updates.completed = completed;
        if (favorite !== undefined) updates.favorite = favorite;

        const lesson = await storage.update('lessons.json', 
            l => l.id === req.params.id && l.userId === req.session.userId,
            updates
        );

        if (!lesson) {
            return res.status(404).json({
                success: false,
                message: 'Lesson not found',
                errors: []
            });
        }

        res.json({
            success: true,
            data: { lesson },
            message: 'Lesson updated',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Delete lesson
 * DELETE /api/lessons/:id
 */
router.delete('/:id', async (req, res, next) => {
    try {
        const deleted = await storage.remove('lessons.json', 
            l => l.id === req.params.id && l.userId === req.session.userId
        );

        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: 'Lesson not found',
                errors: []
            });
        }

        res.json({
            success: true,
            data: {},
            message: 'Lesson deleted',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Bulk delete lessons
 * POST /api/lessons/bulk-delete
 */
router.post('/bulk-delete', async (req, res, next) => {
    try {
        const { ids } = req.body;

        if (!ids || !Array.isArray(ids)) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: ['IDs array is required']
            });
        }

        let deletedCount = 0;
        for (const id of ids) {
            const deleted = await storage.remove('lessons.json', 
                l => l.id === id && l.userId === req.session.userId
            );
            if (deleted) deletedCount++;
        }

        res.json({
            success: true,
            data: { deletedCount },
            message: `${deletedCount} lessons deleted`,
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
