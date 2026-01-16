/**
 * Study Plans Routes
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const storage = require('../services/storage');
const aiService = require('../services/ai');

const router = express.Router();

/**
 * Get all study plans for current user
 * GET /api/study-plans
 */
router.get('/', async (req, res, next) => {
    try {
        const plans = await storage.findMany('study_plans.json', 
            p => p.userId === req.session.userId
        );

        // Sort by most recent
        plans.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json({
            success: true,
            data: { plans },
            message: 'Study plans retrieved',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Get single study plan
 * GET /api/study-plans/:id
 */
router.get('/:id', async (req, res, next) => {
    try {
        const plan = await storage.findOne('study_plans.json', 
            p => p.id === req.params.id && p.userId === req.session.userId
        );

        if (!plan) {
            return res.status(404).json({
                success: false,
                message: 'Study plan not found',
                errors: []
            });
        }

        res.json({
            success: true,
            data: { plan },
            message: 'Study plan retrieved',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Generate a new study plan
 * POST /api/study-plans/generate
 */
router.post('/generate', async (req, res, next) => {
    try {
        const {
            currentScore,
            targetScore,
            testDate,
            hoursPerDay,
            daysPerWeek,
            weakSubjects,
            strongSubjects,
            learningStyle,
            timePreference,
            otherCommitments,
            model
        } = req.body;

        // Validation
        if (!targetScore || !testDate) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: ['Target score and test date are required']
            });
        }

        // Generate plan using AI
        const generatedPlan = await aiService.generateStudyPlan({
            currentScore,
            targetScore,
            testDate,
            hoursPerDay: hoursPerDay || 2,
            daysPerWeek: daysPerWeek || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
            weakSubjects: weakSubjects || [],
            strongSubjects: strongSubjects || [],
            learningStyle: learningStyle || 'Visual',
            timePreference: timePreference || ['Evening'],
            otherCommitments
        }, model);

        // Create study plan object
        const plan = {
            id: uuidv4(),
            userId: req.session.userId,
            title: `Study Plan for ${targetScore} Target`,
            currentScore,
            targetScore,
            testDate,
            hoursPerDay,
            daysPerWeek,
            weakSubjects,
            strongSubjects,
            learningStyle,
            timePreference,
            generatedPlan,
            completedTasks: [],
            customTasks: [],
            active: true,
            model: model || 'deepseek-v3',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await storage.insert('study_plans.json', plan);

        res.status(201).json({
            success: true,
            data: { plan },
            message: 'Study plan generated successfully',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Mark a task as complete
 * POST /api/study-plans/:id/complete-task
 */
router.post('/:id/complete-task', async (req, res, next) => {
    try {
        const { week, day, taskIndex } = req.body;

        const plan = await storage.findOne('study_plans.json', 
            p => p.id === req.params.id && p.userId === req.session.userId
        );

        if (!plan) {
            return res.status(404).json({
                success: false,
                message: 'Study plan not found',
                errors: []
            });
        }

        const taskId = `${week}-${day}-${taskIndex}`;
        
        if (!plan.completedTasks.includes(taskId)) {
            plan.completedTasks.push(taskId);
        }

        plan.updatedAt = new Date().toISOString();

        await storage.update('study_plans.json', p => p.id === req.params.id, plan);

        // Update user XP
        const user = await storage.findOne('users.json', u => u.id === req.session.userId);
        if (user) {
            user.stats.xp += 10;
            await storage.update('users.json', u => u.id === req.session.userId, { stats: user.stats });
        }

        res.json({
            success: true,
            data: { completedTasks: plan.completedTasks },
            message: 'Task completed',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Add a custom task
 * POST /api/study-plans/:id/tasks
 */
router.post('/:id/tasks', async (req, res, next) => {
    try {
        const { date, time, subject, activity, duration } = req.body;

        const plan = await storage.findOne('study_plans.json', 
            p => p.id === req.params.id && p.userId === req.session.userId
        );

        if (!plan) {
            return res.status(404).json({
                success: false,
                message: 'Study plan not found',
                errors: []
            });
        }

        const task = {
            id: uuidv4(),
            date,
            time,
            subject,
            activity,
            duration,
            completed: false,
            createdAt: new Date().toISOString()
        };

        plan.customTasks.push(task);
        plan.updatedAt = new Date().toISOString();

        await storage.update('study_plans.json', p => p.id === req.params.id, plan);

        res.status(201).json({
            success: true,
            data: { task },
            message: 'Task added',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Update custom task
 * PUT /api/study-plans/:id/tasks/:taskId
 */
router.put('/:id/tasks/:taskId', async (req, res, next) => {
    try {
        const { completed, date, time, subject, activity, duration } = req.body;

        const plan = await storage.findOne('study_plans.json', 
            p => p.id === req.params.id && p.userId === req.session.userId
        );

        if (!plan) {
            return res.status(404).json({
                success: false,
                message: 'Study plan not found',
                errors: []
            });
        }

        const taskIndex = plan.customTasks.findIndex(t => t.id === req.params.taskId);
        if (taskIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Task not found',
                errors: []
            });
        }

        if (completed !== undefined) plan.customTasks[taskIndex].completed = completed;
        if (date !== undefined) plan.customTasks[taskIndex].date = date;
        if (time !== undefined) plan.customTasks[taskIndex].time = time;
        if (subject !== undefined) plan.customTasks[taskIndex].subject = subject;
        if (activity !== undefined) plan.customTasks[taskIndex].activity = activity;
        if (duration !== undefined) plan.customTasks[taskIndex].duration = duration;

        plan.updatedAt = new Date().toISOString();

        await storage.update('study_plans.json', p => p.id === req.params.id, plan);

        res.json({
            success: true,
            data: { task: plan.customTasks[taskIndex] },
            message: 'Task updated',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Delete custom task
 * DELETE /api/study-plans/:id/tasks/:taskId
 */
router.delete('/:id/tasks/:taskId', async (req, res, next) => {
    try {
        const plan = await storage.findOne('study_plans.json', 
            p => p.id === req.params.id && p.userId === req.session.userId
        );

        if (!plan) {
            return res.status(404).json({
                success: false,
                message: 'Study plan not found',
                errors: []
            });
        }

        plan.customTasks = plan.customTasks.filter(t => t.id !== req.params.taskId);
        plan.updatedAt = new Date().toISOString();

        await storage.update('study_plans.json', p => p.id === req.params.id, plan);

        res.json({
            success: true,
            data: {},
            message: 'Task deleted',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Set plan as active/inactive
 * PUT /api/study-plans/:id
 */
router.put('/:id', async (req, res, next) => {
    try {
        const { active, title } = req.body;
        const updates = { updatedAt: new Date().toISOString() };

        if (active !== undefined) updates.active = active;
        if (title !== undefined) updates.title = title;

        const plan = await storage.update('study_plans.json', 
            p => p.id === req.params.id && p.userId === req.session.userId,
            updates
        );

        if (!plan) {
            return res.status(404).json({
                success: false,
                message: 'Study plan not found',
                errors: []
            });
        }

        res.json({
            success: true,
            data: { plan },
            message: 'Study plan updated',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Delete study plan
 * DELETE /api/study-plans/:id
 */
router.delete('/:id', async (req, res, next) => {
    try {
        const deleted = await storage.remove('study_plans.json', 
            p => p.id === req.params.id && p.userId === req.session.userId
        );

        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: 'Study plan not found',
                errors: []
            });
        }

        res.json({
            success: true,
            data: {},
            message: 'Study plan deleted',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Get today's tasks from active plan
 * GET /api/study-plans/today
 */
router.get('/today', async (req, res, next) => {
    try {
        const activePlan = await storage.findOne('study_plans.json', 
            p => p.userId === req.session.userId && p.active
        );

        if (!activePlan) {
            return res.json({
                success: true,
                data: { tasks: [], hasPlan: false },
                message: 'No active study plan',
                errors: []
            });
        }

        // Get today's day name
        const today = new Date();
        const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
        const currentWeek = Math.ceil((today - new Date(activePlan.createdAt)) / (7 * 24 * 60 * 60 * 1000));

        // Find today's tasks from the generated plan
        let todaysTasks = [];
        if (activePlan.generatedPlan && activePlan.generatedPlan.weeks) {
            const weekData = activePlan.generatedPlan.weeks.find(w => w.week === currentWeek);
            if (weekData && weekData.days) {
                const dayData = weekData.days.find(d => d.day === dayName);
                if (dayData && dayData.tasks) {
                    todaysTasks = dayData.tasks.map((task, index) => ({
                        ...task,
                        id: `${currentWeek}-${dayName}-${index}`,
                        completed: activePlan.completedTasks.includes(`${currentWeek}-${dayName}-${index}`)
                    }));
                }
            }
        }

        // Add custom tasks for today
        const todayStr = today.toISOString().split('T')[0];
        const customTasksToday = activePlan.customTasks
            .filter(t => t.date === todayStr)
            .map(t => ({ ...t, isCustom: true }));

        res.json({
            success: true,
            data: { 
                tasks: [...todaysTasks, ...customTasksToday],
                hasPlan: true,
                planId: activePlan.id,
                currentWeek,
                dayName
            },
            message: "Today's tasks retrieved",
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
