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

mongoose.connect(mongoUri, { dbName: mongoDbName })
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch(error => {
    console.error('MongoDB connection failed:', error);
  });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api', websiteRoutes);
app.use(express.static(root));

app.listen(port, host, () => {
  console.log(`Safe Internet App is listening publicly on port ${port}`);
});
