# Setup Instructions

## Environment Variables

Create a `.env` file in the `safe-internet-app` directory with:

```env
MONGODB_URI=mongodb+srv://your_username:your_password@your_cluster.mongodb.net/?appName=Cluster0
MONGODB_DB=safeInternetApp
PORT=10000
HOST=0.0.0.0
```

## Security Notes

⚠️ **IMPORTANT**: The MongoDB connection string is currently hardcoded in `server.js` with credentials visible. You should:

1. Move credentials to environment variables ONLY
2. Use `dotenv` package to load from `.env` file
3. Never commit `.env` to git
4. Add `.env` to `.gitignore`

## Installation & Running

```bash
# Install dependencies
npm install

# Start the server
npm start

# Server will be available at:
# http://localhost:10000/
# http://localhost:10000/dashboard.html
```

## Verification

1. Open http://localhost:10000/dashboard.html in a browser
2. You should see "Loading URLs from MongoDB..."
3. If MongoDB has websites, they'll display in the grid
4. Try adding a website to confirm MongoDB persistence

## Production Deployment

For production:
- Use environment variables for all credentials
- Enable MongoDB IP allowlist
- Use HTTPS
- Consider a reverse proxy (nginx)
- Add error logging
- Set NODE_ENV=production
