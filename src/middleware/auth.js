export function apiAuth(apiSecret) {
  return (req, res, next) => {
    if (!apiSecret) return next();
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token === apiSecret) return next();
    res.status(401).json({ error: 'Unauthorized' });
  };
}
