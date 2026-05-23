const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { MongoClient } = require('mongodb');

const root = __dirname;
const port = Number(process.env.PORT || 10000);
const host = process.env.HOST || '0.0.0.0';

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jsonl': 'application/x-ndjson; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://jprinsloo2022_db_user:BJJdZDC!4qKC6zB@cluster0.gqsgshy.mongodb.net/?appName=Cluster0';
const mongoClient = new MongoClient(mongoUri);
const mongoDbName = process.env.MONGODB_DB || 'safeInternetApp';
const mongoCollectionName = process.env.MONGODB_COLLECTION || 'websites';
let mongoReady = false;

mongoClient.connect()
  .then(() => {
    mongoReady = true;
    console.log('Connected to MongoDB');
  })
  .catch(error => {
    console.error('MongoDB connection failed:', error);
  });

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function resolveRequestPath(url) {
  const requestPath = decodeURIComponent(new URL(url, `http://${host}:${port}`).pathname);
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const filePath = path.resolve(root, relativePath);

  if (!filePath.startsWith(root + path.sep) && filePath !== root) {
    return null;
  }

  return filePath;
}

const server = http.createServer(async (req, res) => {
  const requestPath = new URL(req.url, `http://${host}:${port}`).pathname;

  if (requestPath === '/api/website') {
    if (req.method !== 'POST') {
      send(res, 405, 'Method not allowed');
      return;
    }

    try {
      const body = await readJsonBody(req);
      const url = cleanUrl(body.url);
      if (!/^https?:\/\//i.test(url)) {
        send(res, 400, JSON.stringify({ error: 'Invalid website URL' }), 'application/json; charset=utf-8');
        return;
      }

      const item = {
        url,
        name: cleanText(body.name) || displayName(url),
        category: normalizeCategory(body.category) || categoryFor(url),
        description: cleanText(body.description) || fallbackDescription(url, body.name || displayName(url), body.category),
        favorite: Boolean(body.favorite),
        updatedAt: new Date()
      };

      const collection = mongoClient.db(mongoDbName).collection(mongoCollectionName);
      await collection.updateOne(
        { url: item.url },
        {
          $set: {
            name: item.name,
            category: item.category,
            description: item.description,
            favorite: item.favorite,
            updatedAt: item.updatedAt
          },
          $setOnInsert: { createdAt: new Date() }
        },
        { upsert: true }
      );

      send(res, 200, JSON.stringify({ ok: true }), 'application/json; charset=utf-8');
    } catch (error) {
      console.error('API /api/website error:', error);
      send(res, 500, JSON.stringify({ error: 'Could not save website' }), 'application/json; charset=utf-8');
    }

    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'Method not allowed');
    return;
  }

  if (requestPath === '/db-status') {
    const status = mongoReady ? 'ready' : 'connecting';
    send(res, 200, JSON.stringify({ mongodb: status }), 'application/json; charset=utf-8');
    return;
  }

  if (requestPath === '/db-test') {
    if (!mongoReady) {
      send(res, 503, JSON.stringify({ error: 'MongoDB not connected yet' }), 'application/json; charset=utf-8');
      return;
    }

    mongoClient.db('admin').command({ ping: 1 })
      .then(() => {
        send(res, 200, JSON.stringify({ mongodb: 'pong' }), 'application/json; charset=utf-8');
      })
      .catch(error => {
        console.error('MongoDB ping failed:', error);
        send(res, 500, JSON.stringify({ error: 'MongoDB ping failed' }), 'application/json; charset=utf-8');
      });
    return;
  }

  const filePath = resolveRequestPath(req.url);
  if (!filePath) {
    send(res, 403, 'Forbidden');
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      send(res, 404, 'Not found');
      return;
    }

    const type = contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stats.size,
      'Cache-Control': 'no-store'
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Safe Internet App is listening publicly on port ${port}`);
});
