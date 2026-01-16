/**
 * Authentication Middleware
 */

const authMiddleware = (req, res, next) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required',
            errors: ['Please log in to access this resource']
        });
    }
    next();
};

const optionalAuth = (req, res, next) => {
    // Attach user info if logged in, but don't require it
    next();
};

module.exports = { authMiddleware, optionalAuth };
