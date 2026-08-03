// Central error handler. Any next(err) or throw in async controllers lands here.
function errorHandler(err, req, res, next) {
  console.error('[error]', err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.publicMessage || 'Internal server error',
  });
}

module.exports = { errorHandler };
