/**
 * Flashcards Routes
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const storage = require('../services/storage');
const aiService = require('../services/ai');

const router = express.Router();

/**
 * Get all flashcard decks for current user
 * GET /api/flashcards
 */
router.get('/', async (req, res, next) => {
    try {
        const decks = await storage.findMany('flashcards.json', 
            d => d.userId === req.session.userId
        );

        // Sort by most recent and add stats
        const decksWithStats = decks
            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
            .map(deck => {
                const masteredCount = deck.cards.filter(c => c.mastery === 'mastered').length;
                const familiarCount = deck.cards.filter(c => c.mastery === 'familiar').length;
                const learningCount = deck.cards.filter(c => c.mastery === 'learning').length;

                return {
                    id: deck.id,
                    title: deck.title,
                    subject: deck.subject,
                    topic: deck.topic,
                    cardCount: deck.cards.length,
                    masteredCount,
                    familiarCount,
                    learningCount,
                    lastStudied: deck.lastStudied,
                    createdAt: deck.createdAt,
                    updatedAt: deck.updatedAt
                };
            });

        res.json({
            success: true,
            data: { decks: decksWithStats },
            message: 'Flashcard decks retrieved',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Get single deck with cards
 * GET /api/flashcards/:id
 */
router.get('/:id', async (req, res, next) => {
    try {
        const deck = await storage.findOne('flashcards.json', 
            d => d.id === req.params.id && d.userId === req.session.userId
        );

        if (!deck) {
            return res.status(404).json({
                success: false,
                message: 'Deck not found',
                errors: []
            });
        }

        res.json({
            success: true,
            data: { deck },
            message: 'Deck retrieved',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Create a new deck
 * POST /api/flashcards
 */
router.post('/', async (req, res, next) => {
    try {
        const { title, subject, topic, cards } = req.body;

        if (!title) {
            return res.status(400).json({
                success: false,
                message: 'Title is required',
                errors: []
            });
        }

        const deck = {
            id: uuidv4(),
            userId: req.session.userId,
            title,
            subject: subject || 'General',
            topic: topic || '',
            cards: (cards || []).map(card => ({
                id: uuidv4(),
                front: card.front,
                back: card.back,
                tags: card.tags || [],
                mastery: 'learning', // learning, familiar, mastered
                nextReview: new Date().toISOString(),
                reviewCount: 0,
                correctCount: 0,
                createdAt: new Date().toISOString()
            })),
            lastStudied: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await storage.insert('flashcards.json', deck);

        res.status(201).json({
            success: true,
            data: { deck },
            message: 'Deck created',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Generate flashcards from topic using AI
 * POST /api/flashcards/generate
 */
router.post('/generate', async (req, res, next) => {
    try {
        const { title, topic, count, subject, model } = req.body;

        if (!topic) {
            return res.status(400).json({
                success: false,
                message: 'Topic is required',
                errors: []
            });
        }

        const generatedCards = await aiService.generateFlashcards(topic, count || 10, model);

        const deck = {
            id: uuidv4(),
            userId: req.session.userId,
            title: title || `${topic} Flashcards`,
            subject: subject || 'General',
            topic,
            cards: generatedCards.map(card => ({
                id: uuidv4(),
                front: card.front,
                back: card.back,
                tags: card.tags || [],
                mastery: 'learning',
                nextReview: new Date().toISOString(),
                reviewCount: 0,
                correctCount: 0,
                createdAt: new Date().toISOString()
            })),
            generated: true,
            model: model || 'deepseek-v3',
            lastStudied: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await storage.insert('flashcards.json', deck);

        res.status(201).json({
            success: true,
            data: { deck },
            message: 'Flashcards generated',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Add card to deck
 * POST /api/flashcards/:id/cards
 */
router.post('/:id/cards', async (req, res, next) => {
    try {
        const { front, back, tags } = req.body;

        if (!front || !back) {
            return res.status(400).json({
                success: false,
                message: 'Front and back are required',
                errors: []
            });
        }

        const deck = await storage.findOne('flashcards.json', 
            d => d.id === req.params.id && d.userId === req.session.userId
        );

        if (!deck) {
            return res.status(404).json({
                success: false,
                message: 'Deck not found',
                errors: []
            });
        }

        const card = {
            id: uuidv4(),
            front,
            back,
            tags: tags || [],
            mastery: 'learning',
            nextReview: new Date().toISOString(),
            reviewCount: 0,
            correctCount: 0,
            createdAt: new Date().toISOString()
        };

        deck.cards.push(card);
        deck.updatedAt = new Date().toISOString();

        await storage.update('flashcards.json', d => d.id === req.params.id, deck);

        res.status(201).json({
            success: true,
            data: { card },
            message: 'Card added',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Update card
 * PUT /api/flashcards/:id/cards/:cardId
 */
router.put('/:id/cards/:cardId', async (req, res, next) => {
    try {
        const { front, back, tags } = req.body;

        const deck = await storage.findOne('flashcards.json', 
            d => d.id === req.params.id && d.userId === req.session.userId
        );

        if (!deck) {
            return res.status(404).json({
                success: false,
                message: 'Deck not found',
                errors: []
            });
        }

        const cardIndex = deck.cards.findIndex(c => c.id === req.params.cardId);
        if (cardIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Card not found',
                errors: []
            });
        }

        if (front !== undefined) deck.cards[cardIndex].front = front;
        if (back !== undefined) deck.cards[cardIndex].back = back;
        if (tags !== undefined) deck.cards[cardIndex].tags = tags;

        deck.updatedAt = new Date().toISOString();

        await storage.update('flashcards.json', d => d.id === req.params.id, deck);

        res.json({
            success: true,
            data: { card: deck.cards[cardIndex] },
            message: 'Card updated',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Delete card
 * DELETE /api/flashcards/:id/cards/:cardId
 */
router.delete('/:id/cards/:cardId', async (req, res, next) => {
    try {
        const deck = await storage.findOne('flashcards.json', 
            d => d.id === req.params.id && d.userId === req.session.userId
        );

        if (!deck) {
            return res.status(404).json({
                success: false,
                message: 'Deck not found',
                errors: []
            });
        }

        deck.cards = deck.cards.filter(c => c.id !== req.params.cardId);
        deck.updatedAt = new Date().toISOString();

        await storage.update('flashcards.json', d => d.id === req.params.id, deck);

        res.json({
            success: true,
            data: {},
            message: 'Card deleted',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Review card (spaced repetition)
 * POST /api/flashcards/:id/cards/:cardId/review
 */
router.post('/:id/cards/:cardId/review', async (req, res, next) => {
    try {
        const { rating } = req.body; // 1=again, 2=hard, 3=good, 4=easy

        const deck = await storage.findOne('flashcards.json', 
            d => d.id === req.params.id && d.userId === req.session.userId
        );

        if (!deck) {
            return res.status(404).json({
                success: false,
                message: 'Deck not found',
                errors: []
            });
        }

        const cardIndex = deck.cards.findIndex(c => c.id === req.params.cardId);
        if (cardIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Card not found',
                errors: []
            });
        }

        const card = deck.cards[cardIndex];
        card.reviewCount++;

        // Calculate next review based on rating (simple spaced repetition)
        const now = new Date();
        let daysUntilReview;
        
        switch(rating) {
            case 1: // Again
                daysUntilReview = 0; // Review again today
                card.mastery = 'learning';
                break;
            case 2: // Hard
                daysUntilReview = 1;
                card.mastery = 'learning';
                break;
            case 3: // Good
                daysUntilReview = card.reviewCount * 2;
                card.correctCount++;
                card.mastery = card.correctCount >= 3 ? 'familiar' : 'learning';
                break;
            case 4: // Easy
                daysUntilReview = card.reviewCount * 4;
                card.correctCount++;
                card.mastery = card.correctCount >= 5 ? 'mastered' : 'familiar';
                break;
            default:
                daysUntilReview = 1;
        }

        now.setDate(now.getDate() + daysUntilReview);
        card.nextReview = now.toISOString();
        card.lastReviewed = new Date().toISOString();

        deck.lastStudied = new Date().toISOString();
        deck.updatedAt = new Date().toISOString();

        await storage.update('flashcards.json', d => d.id === req.params.id, deck);

        res.json({
            success: true,
            data: { card },
            message: 'Card reviewed',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Get cards due for review
 * GET /api/flashcards/:id/due
 */
router.get('/:id/due', async (req, res, next) => {
    try {
        const deck = await storage.findOne('flashcards.json', 
            d => d.id === req.params.id && d.userId === req.session.userId
        );

        if (!deck) {
            return res.status(404).json({
                success: false,
                message: 'Deck not found',
                errors: []
            });
        }

        const now = new Date();
        const dueCards = deck.cards.filter(card => {
            return new Date(card.nextReview) <= now;
        });

        // Shuffle due cards
        for (let i = dueCards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [dueCards[i], dueCards[j]] = [dueCards[j], dueCards[i]];
        }

        res.json({
            success: true,
            data: { cards: dueCards, totalDue: dueCards.length },
            message: 'Due cards retrieved',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Update deck
 * PUT /api/flashcards/:id
 */
router.put('/:id', async (req, res, next) => {
    try {
        const { title, subject, topic } = req.body;
        const updates = { updatedAt: new Date().toISOString() };

        if (title !== undefined) updates.title = title;
        if (subject !== undefined) updates.subject = subject;
        if (topic !== undefined) updates.topic = topic;

        const deck = await storage.update('flashcards.json', 
            d => d.id === req.params.id && d.userId === req.session.userId,
            updates
        );

        if (!deck) {
            return res.status(404).json({
                success: false,
                message: 'Deck not found',
                errors: []
            });
        }

        res.json({
            success: true,
            data: { deck },
            message: 'Deck updated',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Delete deck
 * DELETE /api/flashcards/:id
 */
router.delete('/:id', async (req, res, next) => {
    try {
        const deleted = await storage.remove('flashcards.json', 
            d => d.id === req.params.id && d.userId === req.session.userId
        );

        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: 'Deck not found',
                errors: []
            });
        }

        res.json({
            success: true,
            data: {},
            message: 'Deck deleted',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
