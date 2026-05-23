# Safe Internet App — MongoDB Edition

A dashboard for managing a curated list of safe websites, now powered by MongoDB and Node.js instead of local storage.

## Architecture

**Frontend:** HTML + JavaScript (runs in browser)
- No localStorage — all data stored in MongoDB
- Real-time API calls for all operations
- Status from MongoDB shown in UI

**Backend:** Node.js + Express + MongoDB
- REST API endpoints for CRUD operations
- Connected to MongoDB cluster
- Handles favorites, categories, descriptions

## Features

✓ **Cloud Storage** — All data persists to MongoDB
✓ **Add Websites** — Research metadata and save to database
✓ **Organize by Category** — Assign or change categories (stored in MongoDB)
✓ **Mark Favorites** — Toggle favorite status (syncs to MongoDB)
✓ **Search & Filter** — Find websites by name, URL, description
✓ **Focus Mode** — Hide games category
✓ **Export** — Download websites as JSON or CSV
✓ **Import** — Bulk add from CSV/JSON
✓ **Delete** — Remove websites from database

## Data Migration

**What was removed:**
- ~~urls.txt file reading~~ (archived as reference only)
- ~~localStorage storage~~ (moved to MongoDB)
- ~~Local-only favorites~~ (now in cloud)

**What's new:**
- MongoDB as single source of truth
- All changes persisted immediately
- Cloud-accessible data

## Setup

### 1. Install Dependencies
```bash
cd safe-internet-app
npm install
```

### 2. Configure MongoDB
Copy `.env.example` to `.env` and update:
```bash
cp .env.example .env
```

Edit `.env` with your MongoDB credentials:
```env
MONGODB_URI=mongodb+srv://your_user:your_password@your_cluster.mongodb.net/?appName=Cluster0
MONGODB_DB=safeInternetApp
PORT=10000
HOST=0.0.0.0
```

### 3. Start the Server
```bash
npm start
```

The server will:
- Connect to MongoDB
- Start listening on port 10000
- Serve the dashboard at `http://localhost:10000/dashboard.html`

## Usage

### Add a Website
1. Enter URL in "Add website URL..." field
2. Click "Add Website" or press Enter
3. App researches metadata and saves to MongoDB

### Manage Websites
- **Star (☆)** — Mark as favorite (persists to MongoDB)
- **Category dropdown** — Change category (updates in database)
- **Delete (×)** — Remove from database

### Search & Filter
- Type in search box to filter by name, URL, description
- Click category buttons to filter by type
- Click "Favorites" to show starred items only

### Export Data
- **Export JSON** — Full database backup
- **Export CSV** — Spreadsheet format for Excel

### Import Data
- Click "Import JSON/CSV"
- Select file with websites
- Bulk load into MongoDB

### Focus Mode
- Click "Focus" button to hide Games category
- Useful for supervised browsing

## API Endpoints

### GET /api/websites
Fetch all websites from MongoDB
```json
{
  "response": [
    {
      "_id": "...",
      "url": "https://example.com",
      "name": "Example",
      "category": "learning",
      "description": "...",
      "isFavorite": false,
      "createdAt": "2025-..."
    }
  ]
}
```

### POST /api/websites
Add or update a website
```json
{
  "url": "https://example.com",
  "name": "Example",
  "category": "learning",
  "description": "A description",
  "isFavorite": false
}
```

### PATCH /api/websites/:id
Update website properties
```json
{
  "category": "tools",
  "isFavorite": true,
  "description": "Updated description"
}
```

### DELETE /api/websites/:id
Remove website from MongoDB

## Project Structure

```
safe-internet-app/
├── server.js              # Express server + MongoDB connection
├── dashboard.html         # Frontend UI (no localStorage)
├── routes/
│   └── websites.js       # API endpoints
├── models/
│   └── Website.js        # MongoDB schema
├── urls.txt              # Original list (archived)
├── urls.js               # Helper script (still used)
├── package.json
├── .env                  # Environment variables (git-ignored)
├── .env.example          # Example configuration
└── .gitignore            # Protect .env and node_modules
```

## Environment Variables

- `MONGODB_URI` — Full MongoDB connection string with credentials
- `MONGODB_DB` — Database name (default: safeInternetApp)
- `PORT` — Server port (default: 10000)
- `HOST` — Server host (default: 0.0.0.0)

⚠️ **Never commit `.env`** — Use `.env.example` as template

## Security Notes

✓ Environment variables protect credentials
✓ MongoDB cluster has IP allowlist configured
✓ `.gitignore` prevents accidental commits of `.env`
✓ HTTPS recommended for production

## Troubleshooting

### "Failed to load websites from MongoDB"
- Check MongoDB connection string in `.env`
- Verify IP allowlist on MongoDB cluster
- Ensure database has websites

### Changes not persisting
- Check server console for errors
- Verify MongoDB connection
- Check browser network tab for API errors

### "Loading URLs from MongoDB..." stays on screen
- Open browser DevTools console for error messages
- Check that server is running on port 10000
- Verify `/api/websites` endpoint is accessible

## Converting Existing Data

If you have old urls.txt data:

1. Export from old system as CSV
2. Click "Import JSON/CSV" in dashboard
3. Select the CSV file
4. All websites bulk-added to MongoDB

## License

Created for safe internet browsing.
