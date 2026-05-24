const mongoose = require('mongoose');
const fs = require('fs');
try {
  require('dotenv').config();
} catch (error) {
  // dotenv is optional; environment variables may already be loaded externally.
}
const Website = require('./models/Website');

const defaultMongoUri = 'mongodb+srv://jprinsloo2022_db_user:BJJdZDC!4qKC6zB@cluster0.gqsgshy.mongodb.net/safeInternetApp?retryWrites=true&w=majority&appName=Cluster0';
const mongoUri = process.env.MONGODB_URI || defaultMongoUri;
const mongoDbName = process.env.MONGODB_DB || 'safeInternetApp';

async function importUrls() {
  try {
    await mongoose.connect(mongoUri, { dbName: mongoDbName });
    console.log('Connected to MongoDB');

    const fileContent = fs.readFileSync('./urls.txt', 'utf-8');
    const lines = fileContent.split('\n');

    const websites = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const parts = trimmed.split(/\s*\|\s*/);
      if (parts.length < 2) continue;

      const url = parts[0].trim();
      const name = parts[1]?.trim() || '';
      const category = parts[2]?.trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || '';
      const description = parts.slice(3).join(' | ').trim() || '';

      if (!/^https?:\/\//i.test(url)) continue;

      websites.push({
        url,
        name,
        category,
        description,
        isFavorite: false
      });
    }

    if (websites.length === 0) {
      console.log('No valid websites found in urls.txt');
      process.exit(1);
    }

    console.log(`Found ${websites.length} websites in urls.txt`);
    console.log('Importing into MongoDB...');

    for (const website of websites) {
      await Website.findOneAndUpdate(
        { url: website.url },
        website,
        { upsert: true, new: true }
      );
    }

    console.log(`✓ Successfully imported ${websites.length} websites into MongoDB`);
    process.exit(0);
  } catch (error) {
    console.error('Import failed:', error.message);
    process.exit(1);
  }
}

importUrls();
