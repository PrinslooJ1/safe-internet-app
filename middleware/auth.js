const Session = require('../models/Session');

module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required. No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    const session = await Session.findOne({ token });

    if (!session) {
      return res.status(401).json({ error: 'Session invalid or expired.' });
    }

    // Double-check expiration time in case MongoDB TTL has not swept the record yet
    if (new Date() > session.expiresAt) {
      await Session.deleteOne({ _id: session._id });
      return res.status(401).json({ error: 'Session has expired.' });
    }

    req.session = session;
    next();
  } catch (error) {
    console.error('Authentication middleware error:', error);
    res.status(500).json({ error: 'Internal server security error.' });
  }
};
