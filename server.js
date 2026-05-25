const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const websiteRoutes = require('./routes/websites');

const app = express();
const root = __dirname;

function loadEnvFile() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();

const port = Number(process.env.PORT || 10000);
const host = process.env.HOST || '0.0.0.0';
const mongoUri = process.env.MONGODB_URI;
const mongoDbName = process.env.MONGODB_DB || 'safeInternetApp';

let mongoConnected = false;
let mongoError = '';

if (!mongoUri) {
  mongoError = 'MONGODB_URI is missing. Create .env from .env.example and add your MongoDB Atlas connection string.';
  console.error(`MongoDB connection skipped: ${mongoError}`);
} else {
  mongoose.connect(mongoUri, {
    dbName: mongoDbName,
    serverSelectionTimeoutMS: 10000
  })
    .then(() => {
      mongoConnected = true;
      mongoError = '';
      console.log(`Connected to MongoDB database: ${mongoDbName}`);
    })
    .catch(error => {
      mongoError = error.message;
      mongoConnected = false;
      console.error('MongoDB connection failed:', error.message);
      console.error('Check .env, MongoDB Atlas username/password, and Network Access IP allowlist.');
    });
}

mongoose.connection.on('connected', () => {
  mongoConnected = true;
  mongoError = '';
});

mongoose.connection.on('disconnected', () => {
  mongoConnected = false;
});

mongoose.connection.on('error', error => {
  mongoConnected = false;
  mongoError = error.message;
});

function mongoStatus() {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const state = states[mongoose.connection.readyState] || 'unknown';
  return {
    status: mongoConnected ? 'connected' : state,
    readyState: mongoose.connection.readyState,
    database: mongoDbName,
    message: mongoConnected ? 'MongoDB connected' : (mongoError || `MongoDB is ${state}`)
  };
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/status', (req, res) => {
  res.json(mongoStatus());
});

app.use('/api', websiteRoutes);
app.use(express.static(root));

app.listen(port, host, () => {
  console.log(`Safe Internet App is listening on http://${host}:${port}`);
  console.log(`Open http://localhost:${port}/dashboard.html in your browser`);
  console.log(`MongoDB status: ${mongoStatus().message}`);
});
