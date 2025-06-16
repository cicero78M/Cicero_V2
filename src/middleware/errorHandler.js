import { sendDebug } from './debugHandler.js';

export function notFound(req, res, next) {
  sendDebug({ tag: 'ERROR', msg: `NotFound ${req.originalUrl}` });
  res.status(404).json({ success: false, message: 'Endpoint not found' });
}

export function errorHandler(err, req, res, next) {
  sendDebug({ tag: 'ERROR', msg: err.message });
  const code = err.statusCode || 500;
  res.status(code).json({
    success: false,
    message: err.message || 'Internal server error'
  });
}
