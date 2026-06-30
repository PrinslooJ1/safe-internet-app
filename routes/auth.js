const express = require('express');
const router = express.Router();
const crypto = require('node:crypto');
const Security = require('../models/Security');
const Session = require('../models/Session');
const authMiddleware = require('../middleware/auth');

// GET /api/auth/status
// Checks if the master passcode is set, and if the current session token is valid
router.get('/auth/status', async (req, res) => {
  try {
    const security = await Security.findOne({ key: 'passcode' });
    const isSet = !!security;

    let isAuthenticated = false;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const session = await Session.findOne({ token });
      if (session && new Date() < session.expiresAt) {
        isAuthenticated = true;
      }
    }

    res.status(200).json({ isSet, isAuthenticated });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Failed to verify system security status.' });
  }
});

// POST /api/auth/setup
// Configures the initial passcode. Only allowed if none is set yet.
router.post('/auth/setup', async (req, res) => {
  try {
    const { passcode } = req.body;
    if (!passcode || String(passcode).trim().length < 4) {
      return res.status(400).json({ error: 'Passcode must be at least 4 characters.' });
    }

    const existing = await Security.findOne({ key: 'passcode' });
    if (existing) {
      return res.status(400).json({ error: 'Passcode has already been configured.' });
    }

    const { hash, salt } = Security.hashPasscode(String(passcode));
    const security = new Security({
      key: 'passcode',
      hash,
      salt
    });
    await security.save();

    // Automatically log in the user and return a session token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Default 7 days session for setup

    const session = new Session({ token, expiresAt });
    await session.save();

    res.status(201).json({
      message: 'Passcode configured and logged in successfully.',
      token,
      expiresAt
    });
  } catch (error) {
    console.error('Setup passcode error:', error);
    res.status(500).json({ error: 'Failed to configure passcode.' });
  }
});

// POST /api/auth/login
// Verifies passcode and creates an active session
router.post('/auth/login', async (req, res) => {
  try {
    const { passcode, rememberMe } = req.body;
    if (!passcode) {
      return res.status(400).json({ error: 'Passcode is required.' });
    }

    const security = await Security.findOne({ key: 'passcode' });
    if (!security) {
      return res.status(400).json({ error: 'System passcode not set. Please complete setup.' });
    }

    const isValid = security.verifyPasscode(String(passcode));
    if (!isValid) {
      return res.status(401).json({ error: 'Incorrect passcode.' });
    }

    // Generate random secure token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    if (rememberMe) {
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 days session
    } else {
      expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours session
    }

    const session = new Session({ token, expiresAt });
    await session.save();

    res.status(200).json({
      message: 'Access granted.',
      token,
      expiresAt
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'An error occurred during authentication.' });
  }
});

// POST /api/auth/logout
// Revokes and deletes the current session token
router.post('/auth/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      await Session.deleteOne({ token });
    }
    res.status(200).json({ message: 'Session successfully revoked.' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Failed to revoke session.' });
  }
});

// POST /api/auth/change
// Modifies master passcode. Requires authentication, matches old passcode, and invalidates other sessions.
router.post('/auth/change', authMiddleware, async (req, res) => {
  try {
    const { currentPasscode, newPasscode } = req.body;
    if (!currentPasscode || !newPasscode) {
      return res.status(400).json({ error: 'Current passcode and new passcode are required.' });
    }
    if (String(newPasscode).trim().length < 4) {
      return res.status(400).json({ error: 'New passcode must be at least 4 characters.' });
    }

    const security = await Security.findOne({ key: 'passcode' });
    if (!security) {
      return res.status(500).json({ error: 'Security configuration missing.' });
    }

    const isValid = security.verifyPasscode(String(currentPasscode));
    if (!isValid) {
      return res.status(400).json({ error: 'Current passcode is incorrect.' });
    }

    // Update with new hash and salt
    const { hash, salt } = Security.hashPasscode(String(newPasscode));
    security.hash = hash;
    security.salt = salt;
    security.updatedAt = new Date();
    await security.save();

    // Revoke all OTHER sessions for security
    const currentToken = req.session.token;
    await Session.deleteMany({ token: { $ne: currentToken } });

    res.status(200).json({ message: 'Passcode successfully changed. Other sessions revoked.' });
  } catch (error) {
    console.error('Change passcode error:', error);
    res.status(500).json({ error: 'Failed to change passcode.' });
  }
});

module.exports = router;
