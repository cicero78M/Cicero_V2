export function notFound(req, res, next) {
  res.status(404).json({ success: false, message: 'Endpoint not found' });
}

export function errorHandler(err, req, res, next) {
  const code = err.statusCode || 500;
  res.status(code).json({
    success: false,
    message: err.message || 'Internal server error'
  });
}
