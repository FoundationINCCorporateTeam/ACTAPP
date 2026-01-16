/**
 * Practice Tests Routes
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const storage = require('../services/storage');
const aiService = require('../services/ai');

const router = express.Router();

// ACT section configurations
const SECTION_CONFIG = {
    english: { name: 'English', questions: 75, time: 45, description: 'Grammar, punctuation, and rhetorical skills' },
    math: { name: 'Mathematics', questions: 60, time: 60, description: 'Pre-algebra through trigonometry' },
    reading: { name: 'Reading', questions: 40, time: 35, description: 'Reading comprehension across four passages' },
    science: { name: 'Science', questions: 40, time: 35, description: 'Data analysis and scientific reasoning' }
};

/**
 * Get all tests for current user
 * GET /api/tests
 */
router.get('/', async (req, res, next) => {
    try {
        const { status, page = 1, limit = 12 } = req.query;
        
        let predicate = (test) => test.userId === req.session.userId;

        if (status) {
            const oldPredicate = predicate;
            predicate = (test) => oldPredicate(test) && test.status === status;
        }

        const result = await storage.paginate('tests.json', predicate, parseInt(page), parseInt(limit), 
            { field: 'createdAt', order: 'desc' }
        );

        res.json({
            success: true,
            data: result,
            message: 'Tests retrieved',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Get section configuration
 * GET /api/tests/sections
 */
router.get('/sections', (req, res) => {
    res.json({
        success: true,
        data: { sections: SECTION_CONFIG },
        message: 'Sections retrieved',
        errors: []
    });
});

/**
 * Get single test
 * GET /api/tests/:id
 */
router.get('/:id', async (req, res, next) => {
    try {
        const test = await storage.findOne('tests.json', 
            t => t.id === req.params.id && t.userId === req.session.userId
        );

        if (!test) {
            return res.status(404).json({
                success: false,
                message: 'Test not found',
                errors: []
            });
        }

        res.json({
            success: true,
            data: { test },
            message: 'Test retrieved',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Generate a new practice test
 * POST /api/tests/generate
 */
router.post('/generate', async (req, res, next) => {
    try {
        const { sections, fullTest, model } = req.body;

        // Determine which sections to generate
        let sectionsToGenerate = [];
        if (fullTest) {
            sectionsToGenerate = ['english', 'math', 'reading', 'science'];
        } else if (sections && sections.length > 0) {
            sectionsToGenerate = sections.filter(s => SECTION_CONFIG[s]);
        }

        if (sectionsToGenerate.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: ['At least one section is required']
            });
        }

        // Generate each section
        const generatedSections = {};
        for (const section of sectionsToGenerate) {
            const config = SECTION_CONFIG[section];
            // For demo, generate fewer questions to save time/tokens
            const questionCount = Math.min(config.questions, 10); 
            const sectionData = await aiService.generateTestSection(section, questionCount, model);
            generatedSections[section] = {
                ...config,
                ...sectionData,
                status: 'not_started',
                answers: {},
                startedAt: null,
                completedAt: null,
                timeSpent: null,
                score: null
            };
        }

        // Calculate total time
        const totalTime = sectionsToGenerate.reduce((sum, s) => sum + SECTION_CONFIG[s].time, 0);

        // Create test object
        const test = {
            id: uuidv4(),
            userId: req.session.userId,
            title: fullTest ? 'Full ACT Practice Test' : `ACT ${sectionsToGenerate.map(s => SECTION_CONFIG[s].name).join(' + ')}`,
            type: fullTest ? 'full' : 'section',
            sections: generatedSections,
            sectionOrder: sectionsToGenerate,
            currentSection: sectionsToGenerate[0],
            totalTime,
            status: 'not_started', // not_started, in_progress, completed
            scores: null,
            compositeScore: null,
            startedAt: null,
            completedAt: null,
            model: model || 'deepseek-v3',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await storage.insert('tests.json', test);

        res.status(201).json({
            success: true,
            data: { test },
            message: 'Practice test generated successfully',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Start a test
 * POST /api/tests/:id/start
 */
router.post('/:id/start', async (req, res, next) => {
    try {
        const test = await storage.findOne('tests.json', 
            t => t.id === req.params.id && t.userId === req.session.userId
        );

        if (!test) {
            return res.status(404).json({
                success: false,
                message: 'Test not found',
                errors: []
            });
        }

        if (test.status === 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Test already completed',
                errors: []
            });
        }

        const firstSection = test.sectionOrder[0];
        const updates = {
            status: 'in_progress',
            startedAt: test.startedAt || new Date().toISOString(),
            [`sections.${firstSection}.status`]: 'in_progress',
            [`sections.${firstSection}.startedAt`]: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // Apply updates manually for nested properties
        test.status = 'in_progress';
        test.startedAt = test.startedAt || new Date().toISOString();
        test.sections[firstSection].status = 'in_progress';
        test.sections[firstSection].startedAt = new Date().toISOString();
        test.updatedAt = new Date().toISOString();

        await storage.update('tests.json', t => t.id === req.params.id, test);

        res.json({
            success: true,
            data: { test },
            message: 'Test started',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Save section answers
 * PUT /api/tests/:id/section/:section/answers
 */
router.put('/:id/section/:section/answers', async (req, res, next) => {
    try {
        const { answers } = req.body;
        const { id, section } = req.params;

        const test = await storage.findOne('tests.json', 
            t => t.id === id && t.userId === req.session.userId
        );

        if (!test) {
            return res.status(404).json({
                success: false,
                message: 'Test not found',
                errors: []
            });
        }

        if (!test.sections[section]) {
            return res.status(400).json({
                success: false,
                message: 'Invalid section',
                errors: []
            });
        }

        test.sections[section].answers = { ...test.sections[section].answers, ...answers };
        test.updatedAt = new Date().toISOString();

        await storage.update('tests.json', t => t.id === id, test);

        res.json({
            success: true,
            data: { section: test.sections[section] },
            message: 'Answers saved',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Complete a section and move to next
 * POST /api/tests/:id/section/:section/complete
 */
router.post('/:id/section/:section/complete', async (req, res, next) => {
    try {
        const { answers, timeSpent } = req.body;
        const { id, section } = req.params;

        const test = await storage.findOne('tests.json', 
            t => t.id === id && t.userId === req.session.userId
        );

        if (!test) {
            return res.status(404).json({
                success: false,
                message: 'Test not found',
                errors: []
            });
        }

        if (!test.sections[section]) {
            return res.status(400).json({
                success: false,
                message: 'Invalid section',
                errors: []
            });
        }

        // Save final answers for section
        const finalAnswers = { ...test.sections[section].answers, ...answers };
        test.sections[section].answers = finalAnswers;
        test.sections[section].status = 'completed';
        test.sections[section].completedAt = new Date().toISOString();
        test.sections[section].timeSpent = timeSpent;

        // Calculate section score
        let correct = 0;
        let total = 0;
        
        if (test.sections[section].passages) {
            test.sections[section].passages.forEach(passage => {
                passage.questions.forEach(q => {
                    total++;
                    if (finalAnswers[q.question] === q.correctAnswer) {
                        correct++;
                    }
                });
            });
        }

        // Convert to ACT scale (1-36)
        const rawScore = total > 0 ? correct / total : 0;
        const scaledScore = Math.round(rawScore * 35) + 1; // 1-36 scale
        test.sections[section].score = {
            correct,
            total,
            rawPercentage: Math.round(rawScore * 100),
            scaledScore
        };

        // Move to next section
        const currentIndex = test.sectionOrder.indexOf(section);
        if (currentIndex < test.sectionOrder.length - 1) {
            const nextSection = test.sectionOrder[currentIndex + 1];
            test.currentSection = nextSection;
            test.sections[nextSection].status = 'in_progress';
            test.sections[nextSection].startedAt = new Date().toISOString();
        }

        test.updatedAt = new Date().toISOString();
        await storage.update('tests.json', t => t.id === id, test);

        res.json({
            success: true,
            data: { 
                test,
                sectionScore: test.sections[section].score,
                nextSection: test.currentSection !== section ? test.currentSection : null
            },
            message: 'Section completed',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Submit entire test
 * POST /api/tests/:id/submit
 */
router.post('/:id/submit', async (req, res, next) => {
    try {
        const test = await storage.findOne('tests.json', 
            t => t.id === req.params.id && t.userId === req.session.userId
        );

        if (!test) {
            return res.status(404).json({
                success: false,
                message: 'Test not found',
                errors: []
            });
        }

        // Calculate composite score
        const sectionScores = {};
        let totalScaled = 0;
        let scoredSections = 0;

        for (const section of test.sectionOrder) {
            if (test.sections[section].score) {
                sectionScores[section] = test.sections[section].score.scaledScore;
                totalScaled += test.sections[section].score.scaledScore;
                scoredSections++;
            } else {
                // Section not completed, score as 1
                sectionScores[section] = 1;
                totalScaled += 1;
                scoredSections++;
            }
        }

        const compositeScore = Math.round(totalScaled / scoredSections);

        // Calculate percentile (approximate)
        const percentile = Math.min(99, Math.max(1, Math.round((compositeScore - 1) * 3)));

        test.status = 'completed';
        test.scores = sectionScores;
        test.compositeScore = compositeScore;
        test.percentile = percentile;
        test.completedAt = new Date().toISOString();
        test.updatedAt = new Date().toISOString();

        await storage.update('tests.json', t => t.id === req.params.id, test);

        // Update user stats
        const user = await storage.findOne('users.json', u => u.id === req.session.userId);
        if (user) {
            user.stats.xp += 200;
            user.stats.testsTaken = (user.stats.testsTaken || 0) + 1;
            
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
            progress.testScores.push({
                testId: test.id,
                compositeScore,
                sectionScores,
                date: new Date().toISOString()
            });

            progress.activityLog.unshift({
                type: 'test_completed',
                testId: test.id,
                compositeScore,
                timestamp: new Date().toISOString()
            });
            progress.activityLog = progress.activityLog.slice(0, 100);

            await storage.update('progress.json', p => p.userId === req.session.userId, {
                testScores: progress.testScores,
                activityLog: progress.activityLog
            });
        }

        res.json({
            success: true,
            data: { 
                test,
                compositeScore,
                sectionScores,
                percentile
            },
            message: 'Test submitted successfully',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Get test results
 * GET /api/tests/:id/results
 */
router.get('/:id/results', async (req, res, next) => {
    try {
        const test = await storage.findOne('tests.json', 
            t => t.id === req.params.id && t.userId === req.session.userId
        );

        if (!test) {
            return res.status(404).json({
                success: false,
                message: 'Test not found',
                errors: []
            });
        }

        if (test.status !== 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Test not completed',
                errors: ['Complete the test to see results']
            });
        }

        res.json({
            success: true,
            data: { 
                test,
                compositeScore: test.compositeScore,
                sectionScores: test.scores,
                percentile: test.percentile
            },
            message: 'Results retrieved',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Delete test
 * DELETE /api/tests/:id
 */
router.delete('/:id', async (req, res, next) => {
    try {
        const deleted = await storage.remove('tests.json', 
            t => t.id === req.params.id && t.userId === req.session.userId
        );

        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: 'Test not found',
                errors: []
            });
        }

        res.json({
            success: true,
            data: {},
            message: 'Test deleted',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
