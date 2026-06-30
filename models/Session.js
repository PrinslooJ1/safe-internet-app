const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
});

module.exports = mongoose.model('Session', SessionSchema);
