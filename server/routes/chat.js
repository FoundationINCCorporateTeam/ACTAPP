/**
 * Chat Routes - AI Tutor Conversations
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const storage = require('../services/storage');
const aiService = require('../services/ai');

const router = express.Router();

/**
 * Get all conversations for current user
 * GET /api/chat/conversations
 */
router.get('/conversations', async (req, res, next) => {
    try {
        const conversations = await storage.findMany('chat_history.json', 
            c => c.userId === req.session.userId
        );

        // Sort by most recent and return basic info
        const sorted = conversations
            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
            .map(c => ({
                id: c.id,
                title: c.title,
                lastMessage: c.messages[c.messages.length - 1]?.content?.slice(0, 100) || '',
                messageCount: c.messages.length,
                model: c.model,
                createdAt: c.createdAt,
                updatedAt: c.updatedAt
            }));

        res.json({
            success: true,
            data: { conversations: sorted },
            message: 'Conversations retrieved',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Get single conversation with messages
 * GET /api/chat/conversations/:id
 */
router.get('/conversations/:id', async (req, res, next) => {
    try {
        const conversation = await storage.findOne('chat_history.json', 
            c => c.id === req.params.id && c.userId === req.session.userId
        );

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found',
                errors: []
            });
        }

        res.json({
            success: true,
            data: { conversation },
            message: 'Conversation retrieved',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Create a new conversation
 * POST /api/chat/conversations
 */
router.post('/conversations', async (req, res, next) => {
    try {
        const { title, model } = req.body;

        const conversation = {
            id: uuidv4(),
            userId: req.session.userId,
            title: title || 'New Conversation',
            model: model || 'deepseek-v3',
            messages: [],
            pinned: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await storage.insert('chat_history.json', conversation);

        res.status(201).json({
            success: true,
            data: { conversation },
            message: 'Conversation created',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Send a message and get AI response
 * POST /api/chat/conversations/:id/messages
 */
router.post('/conversations/:id/messages', async (req, res, next) => {
    try {
        const { content, model } = req.body;

        if (!content || !content.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Message content is required',
                errors: []
            });
        }

        const conversation = await storage.findOne('chat_history.json', 
            c => c.id === req.params.id && c.userId === req.session.userId
        );

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found',
                errors: []
            });
        }

        // Create user message
        const userMessage = {
            id: uuidv4(),
            role: 'user',
            content: content.trim(),
            timestamp: new Date().toISOString()
        };

        conversation.messages.push(userMessage);

        // Get last 10 messages for context
        const contextMessages = conversation.messages
            .slice(-10)
            .map(m => ({ role: m.role, content: m.content }));

        // Get AI response
        const modelToUse = model || conversation.model || 'deepseek-v3';
        const aiResponse = await aiService.chatWithTutor(contextMessages, modelToUse);

        // Create AI message
        const aiMessage = {
            id: uuidv4(),
            role: 'assistant',
            content: aiResponse,
            model: modelToUse,
            timestamp: new Date().toISOString()
        };

        conversation.messages.push(aiMessage);

        // Update title if first message
        if (conversation.messages.length === 2 && conversation.title === 'New Conversation') {
            conversation.title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
        }

        // Update model if changed
        if (model) {
            conversation.model = model;
        }

        conversation.updatedAt = new Date().toISOString();

        await storage.update('chat_history.json', c => c.id === req.params.id, conversation);

        res.json({
            success: true,
            data: { 
                userMessage,
                aiMessage,
                conversation: {
                    id: conversation.id,
                    title: conversation.title,
                    messageCount: conversation.messages.length
                }
            },
            message: 'Message sent',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Regenerate last AI response
 * POST /api/chat/conversations/:id/regenerate
 */
router.post('/conversations/:id/regenerate', async (req, res, next) => {
    try {
        const { model } = req.body;

        const conversation = await storage.findOne('chat_history.json', 
            c => c.id === req.params.id && c.userId === req.session.userId
        );

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found',
                errors: []
            });
        }

        if (conversation.messages.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No messages to regenerate',
                errors: []
            });
        }

        // Remove last AI message if it exists
        if (conversation.messages[conversation.messages.length - 1].role === 'assistant') {
            conversation.messages.pop();
        }

        // Get context and regenerate
        const contextMessages = conversation.messages
            .slice(-10)
            .map(m => ({ role: m.role, content: m.content }));

        const modelToUse = model || conversation.model || 'deepseek-v3';
        const aiResponse = await aiService.chatWithTutor(contextMessages, modelToUse);

        const aiMessage = {
            id: uuidv4(),
            role: 'assistant',
            content: aiResponse,
            model: modelToUse,
            regenerated: true,
            timestamp: new Date().toISOString()
        };

        conversation.messages.push(aiMessage);
        conversation.updatedAt = new Date().toISOString();

        await storage.update('chat_history.json', c => c.id === req.params.id, conversation);

        res.json({
            success: true,
            data: { aiMessage },
            message: 'Response regenerated',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Update conversation (rename, change model)
 * PUT /api/chat/conversations/:id
 */
router.put('/conversations/:id', async (req, res, next) => {
    try {
        const { title, model, pinned } = req.body;
        const updates = { updatedAt: new Date().toISOString() };

        if (title !== undefined) updates.title = title;
        if (model !== undefined) updates.model = model;
        if (pinned !== undefined) updates.pinned = pinned;

        const conversation = await storage.update('chat_history.json', 
            c => c.id === req.params.id && c.userId === req.session.userId,
            updates
        );

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found',
                errors: []
            });
        }

        res.json({
            success: true,
            data: { conversation },
            message: 'Conversation updated',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Delete a message
 * DELETE /api/chat/conversations/:id/messages/:messageId
 */
router.delete('/conversations/:id/messages/:messageId', async (req, res, next) => {
    try {
        const conversation = await storage.findOne('chat_history.json', 
            c => c.id === req.params.id && c.userId === req.session.userId
        );

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found',
                errors: []
            });
        }

        const messageIndex = conversation.messages.findIndex(m => m.id === req.params.messageId);
        if (messageIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Message not found',
                errors: []
            });
        }

        conversation.messages.splice(messageIndex, 1);
        conversation.updatedAt = new Date().toISOString();

        await storage.update('chat_history.json', c => c.id === req.params.id, conversation);

        res.json({
            success: true,
            data: {},
            message: 'Message deleted',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Delete conversation
 * DELETE /api/chat/conversations/:id
 */
router.delete('/conversations/:id', async (req, res, next) => {
    try {
        const deleted = await storage.remove('chat_history.json', 
            c => c.id === req.params.id && c.userId === req.session.userId
        );

        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found',
                errors: []
            });
        }

        res.json({
            success: true,
            data: {},
            message: 'Conversation deleted',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Clear all messages in a conversation
 * POST /api/chat/conversations/:id/clear
 */
router.post('/conversations/:id/clear', async (req, res, next) => {
    try {
        const conversation = await storage.update('chat_history.json', 
            c => c.id === req.params.id && c.userId === req.session.userId,
            { messages: [], updatedAt: new Date().toISOString() }
        );

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found',
                errors: []
            });
        }

        res.json({
            success: true,
            data: { conversation },
            message: 'Conversation cleared',
            errors: []
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Get suggested prompts
 * GET /api/chat/prompts
 */
router.get('/prompts', (req, res) => {
    const prompts = [
        { category: 'Math', text: 'Explain how to solve quadratic equations' },
        { category: 'Math', text: 'Help me understand trigonometric identities' },
        { category: 'Math', text: 'What are the key formulas for the ACT math section?' },
        { category: 'English', text: 'Explain the difference between who and whom' },
        { category: 'English', text: 'Help me with comma rules' },
        { category: 'English', text: 'What are common grammar mistakes on the ACT?' },
        { category: 'Reading', text: 'How do I improve my reading speed?' },
        { category: 'Reading', text: 'Explain strategies for answering inference questions' },
        { category: 'Science', text: 'How do I read scientific graphs quickly?' },
        { category: 'Science', text: 'Explain the conflicting viewpoints question type' },
        { category: 'Writing', text: 'How do I structure an ACT essay?' },
        { category: 'Writing', text: 'Give me tips for writing a strong thesis' },
        { category: 'General', text: 'Create a practice quiz on algebra' },
        { category: 'General', text: 'What score do I need for my target colleges?' }
    ];

    res.json({
        success: true,
        data: { prompts },
        message: 'Prompts retrieved',
        errors: []
    });
});

module.exports = router;
