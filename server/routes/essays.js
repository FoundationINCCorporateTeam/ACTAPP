/**
 * Essays Routes
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const storage = require('../services/storage');
const aiService = require('../services/ai');

const router = express.Router();

/**
 * Get all essays for current user
 * GET /api/essays
 */
router.get('/', async (req, res, next) => {
    try {
        const { graded, page = 1, limit = 12 } = req.query;
        
        let predicate = (essay) => essay.userId === req.session.userId;

        if (graded !== undefined) {
            const oldPredicate = predicate;
            predicate = (essay) => oldPredicate(essay) && (graded === 'true' ? essay.grading : !essay.grading);
        }

        const result = await storage.paginate('essays.json', predicate, parseInt(page), parseInt(limit), 
            { field: 'createdAt', order: 'desc' }
        );

        res.json({
            success: true,
            data: result,
            message: 'Essays retrieved',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Get essay prompts library
 * GET /api/essays/prompts
 */
router.get('/prompts', async (req, res, next) => {
    try {
        const prompts = [
            {
                id: 'education-1',
                category: 'Education',
                topic: 'Technology in Education',
                introduction: 'The role of technology in education has become increasingly prominent...',
                perspectives: [
                    { name: 'Perspective One', description: 'Technology enhances learning by providing access to vast resources and interactive tools.' },
                    { name: 'Perspective Two', description: 'Over-reliance on technology may diminish critical thinking and interpersonal skills.' },
                    { name: 'Perspective Three', description: 'A balanced approach integrating technology with traditional methods is most effective.' }
                ],
                instructions: 'Write a unified essay in which you evaluate multiple perspectives on technology in education.'
            },
            {
                id: 'society-1',
                category: 'Society',
                topic: 'Social Media Impact',
                introduction: 'Social media platforms have transformed how people communicate and share information...',
                perspectives: [
                    { name: 'Perspective One', description: 'Social media democratizes information and enables global connections.' },
                    { name: 'Perspective Two', description: 'Social media contributes to misinformation and mental health issues.' },
                    { name: 'Perspective Three', description: 'The impact of social media depends largely on how individuals choose to use it.' }
                ],
                instructions: 'Write a unified essay evaluating perspectives on social media\'s impact on society.'
            },
            {
                id: 'environment-1',
                category: 'Environment',
                topic: 'Climate Change Action',
                introduction: 'Climate change presents one of the most pressing challenges facing humanity...',
                perspectives: [
                    { name: 'Perspective One', description: 'Immediate and drastic action is necessary to prevent catastrophic consequences.' },
                    { name: 'Perspective Two', description: 'Economic considerations must be balanced with environmental concerns.' },
                    { name: 'Perspective Three', description: 'Technological innovation will naturally solve environmental problems.' }
                ],
                instructions: 'Write a unified essay evaluating perspectives on addressing climate change.'
            }
        ];

        res.json({
            success: true,
            data: { prompts },
            message: 'Prompts retrieved',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Generate a new essay prompt
 * POST /api/essays/prompts/generate
 */
router.post('/prompts/generate', async (req, res, next) => {
    try {
        const { category, model } = req.body;

        const prompt = await aiService.generateEssayPrompt(category, model);

        res.json({
            success: true,
            data: { prompt },
            message: 'Prompt generated',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Get single essay
 * GET /api/essays/:id
 */
router.get('/:id', async (req, res, next) => {
    try {
        const essay = await storage.findOne('essays.json', 
            e => e.id === req.params.id && e.userId === req.session.userId
        );

        if (!essay) {
            return res.status(404).json({
                success: false,
                message: 'Essay not found',
                errors: []
            });
        }

        res.json({
            success: true,
            data: { essay },
            message: 'Essay retrieved',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Create a new essay (start writing)
 * POST /api/essays
 */
router.post('/', async (req, res, next) => {
    try {
        const { prompt, promptId, customPrompt, timed, timeLimit } = req.body;

        const essay = {
            id: uuidv4(),
            userId: req.session.userId,
            prompt: prompt || customPrompt,
            promptId: promptId || null,
            content: '',
            wordCount: 0,
            timed: timed || false,
            timeLimit: timed ? (timeLimit || 40) : null, // 40 minutes ACT default
            timeSpent: 0,
            status: 'draft', // draft, submitted, graded
            grading: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await storage.insert('essays.json', essay);

        res.status(201).json({
            success: true,
            data: { essay },
            message: 'Essay created',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Save essay content (auto-save)
 * PUT /api/essays/:id
 */
router.put('/:id', async (req, res, next) => {
    try {
        const { content, timeSpent } = req.body;

        const essay = await storage.findOne('essays.json', 
            e => e.id === req.params.id && e.userId === req.session.userId
        );

        if (!essay) {
            return res.status(404).json({
                success: false,
                message: 'Essay not found',
                errors: []
            });
        }

        const updates = { updatedAt: new Date().toISOString() };
        
        if (content !== undefined) {
            updates.content = content;
            updates.wordCount = content.trim().split(/\s+/).filter(w => w).length;
        }
        if (timeSpent !== undefined) {
            updates.timeSpent = timeSpent;
        }

        const updatedEssay = await storage.update('essays.json', 
            e => e.id === req.params.id,
            updates
        );

        res.json({
            success: true,
            data: { essay: updatedEssay },
            message: 'Essay saved',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Submit essay for grading
 * POST /api/essays/:id/submit
 */
router.post('/:id/submit', async (req, res, next) => {
    try {
        const { content, timeSpent, model } = req.body;

        let essay = await storage.findOne('essays.json', 
            e => e.id === req.params.id && e.userId === req.session.userId
        );

        if (!essay) {
            return res.status(404).json({
                success: false,
                message: 'Essay not found',
                errors: []
            });
        }

        // Update content if provided
        if (content) {
            essay.content = content;
            essay.wordCount = content.trim().split(/\s+/).filter(w => w).length;
        }
        if (timeSpent) {
            essay.timeSpent = timeSpent;
        }

        // Validate minimum content
        if (essay.wordCount < 50) {
            return res.status(400).json({
                success: false,
                message: 'Essay too short',
                errors: ['Please write at least 50 words before submitting']
            });
        }

        essay.status = 'submitted';
        essay.submittedAt = new Date().toISOString();

        // Grade the essay using AI
        const grading = await aiService.gradeEssay(essay.prompt, essay.content, model);
        essay.grading = grading;
        essay.status = 'graded';
        essay.gradedAt = new Date().toISOString();
        essay.updatedAt = new Date().toISOString();

        await storage.update('essays.json', e => e.id === req.params.id, essay);

        // Update progress
        const progress = await storage.findOne('progress.json', p => p.userId === req.session.userId);
        if (progress) {
            progress.subjects.writing.essays++;
            const totalScore = grading.scores.overall;
            progress.subjects.writing.averageScore = 
                (progress.subjects.writing.averageScore * (progress.subjects.writing.essays - 1) + totalScore) / 
                progress.subjects.writing.essays;

            progress.activityLog.unshift({
                type: 'essay_graded',
                essayId: essay.id,
                score: totalScore,
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
            data: { essay, grading },
            message: 'Essay submitted and graded',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Request re-grading
 * POST /api/essays/:id/regrade
 */
router.post('/:id/regrade', async (req, res, next) => {
    try {
        const { model } = req.body;

        const essay = await storage.findOne('essays.json', 
            e => e.id === req.params.id && e.userId === req.session.userId
        );

        if (!essay) {
            return res.status(404).json({
                success: false,
                message: 'Essay not found',
                errors: []
            });
        }

        // Grade again
        const grading = await aiService.gradeEssay(essay.prompt, essay.content, model);
        essay.grading = grading;
        essay.gradedAt = new Date().toISOString();
        essay.updatedAt = new Date().toISOString();

        await storage.update('essays.json', e => e.id === req.params.id, essay);

        res.json({
            success: true,
            data: { essay, grading },
            message: 'Essay re-graded',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Delete essay
 * DELETE /api/essays/:id
 */
router.delete('/:id', async (req, res, next) => {
    try {
        const deleted = await storage.remove('essays.json', 
            e => e.id === req.params.id && e.userId === req.session.userId
        );

        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: 'Essay not found',
                errors: []
            });
        }

        res.json({
            success: true,
            data: {},
            message: 'Essay deleted',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
