const mongoose = require('mongoose');
const crypto = require('node:crypto');

const SecuritySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: 'passcode' },
  hash: { type: String, required: true },
  salt: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now }
});

// Generate salt and hash for a passcode
SecuritySchema.statics.hashPasscode = function(passcode) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(passcode, salt, 1000, 64, 'sha512').toString('hex');
  return { hash, salt };
};

// Verify if a passcode matches this instance
SecuritySchema.methods.verifyPasscode = function(passcode) {
  const hash = crypto.pbkdf2Sync(passcode, this.salt, 1000, 64, 'sha512').toString('hex');
  return this.hash === hash;
};

module.exports = mongoose.model('Security', SecuritySchema);
