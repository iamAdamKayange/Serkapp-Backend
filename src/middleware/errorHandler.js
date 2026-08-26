const errorHandler = (err, req, res, next) => {
  // Log error details
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const status = err.status || 500;
  const message = isDevelopment ? err.message : 'Internal Server Error';

  res.status(status).json({
    error: message,
    ...(isDevelopment && { stack: err.stack })
  });
};

module.exports = errorHandler;