/**
 * Error Handler Middleware
 */

const errorHandler = (err, req, res, next) => {
    console.error('Error:', err);

    // Default error
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal server error';
    let errors = err.errors || [];

    // Handle specific error types
    if (err.name === 'ValidationError') {
        statusCode = 400;
        message = 'Validation error';
        errors = Object.values(err.errors || {}).map(e => e.message);
    }

    if (err.name === 'SyntaxError' && err.status === 400 && 'body' in err) {
        statusCode = 400;
        message = 'Invalid JSON';
        errors = ['Request body contains invalid JSON'];
    }

    // Don't leak error details in production
    if (process.env.NODE_ENV === 'production' && statusCode === 500) {
        message = 'Internal server error';
        errors = [];
    }

    res.status(statusCode).json({
        success: false,
        message,
        errors
    });
};

module.exports = { errorHandler };
