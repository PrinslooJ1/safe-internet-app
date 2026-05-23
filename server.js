const express = require('express');
const path = require('node:path');
const mongoose = require('mongoose');
const websiteRoutes = require('./routes/websites');

const app = express();
const root = __dirname;
const port = Number(process.env.PORT || 10000);
const host = process.env.HOST || '0.0.0.0';
const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://jprinsloo2022_db_user:BJJdZDC!4qKC6zB@cluster0.gqsgshy.mongodb.net/?appName=Cluster0';
const mongoDbName = process.env.MONGODB_DB || 'safeInternetApp';

let mongoConnected = false;

mongoose.connect(mongoUri, { dbName: mongoDbName })
  .then(() => {
    mongoConnected = true;
    console.log(`✓ Connected to MongoDB database: ${mongoDbName}`);
  })
  .catch(error => {
    console.error('✗ MongoDB connection failed:', error.message);
    console.error('  → Check your .env file and MongoDB Atlas IP allowlist');
    console.error('  → Or ensure you have internet connectivity to the cluster');
    mongoConnected = false;
  });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/status', (req, res) => {
  res.json({
    status: mongoConnected ? 'connected' : 'disconnected',
    message: mongoConnected ? 'MongoDB connected' : 'MongoDB connection failed'
  });
});

app.use('/api', websiteRoutes);
app.use(express.static(root));

app.listen(port, host, () => {
  console.log(`Safe Internet App is listening on http://${host}:${port}`);
  console.log(`Open http://localhost:${port}/dashboard.html in your browser`);
  if (!mongoConnected) {
    console.log('\n⚠️  WARNING: MongoDB is not connected');
    console.log('   The app will not function until MongoDB is accessible.');
  }
});


