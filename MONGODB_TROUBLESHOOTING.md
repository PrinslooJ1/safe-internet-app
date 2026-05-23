# MongoDB Connection Troubleshooting

## Problem
```
✗ MongoDB connection failed: querySrv ECONNREFUSED
```

This means the server cannot reach your MongoDB cluster at `cluster0.gqsgshy.mongodb.net`.

## Solutions

### 1. **Check IP Allowlist (Most Common)**

MongoDB Atlas blocks all IPs by default. You must whitelist your machine's IP:

1. Go to [MongoDB Atlas](https://cloud.mongodb.com)
2. Select your cluster
3. Go to **Network Access** → **IP Access List**
4. Click **Add IP Address**
5. Add **your current IP** or use `0.0.0.0/0` for testing (NOT secure for production)
6. Click **Confirm**
7. Try connecting again

**Find your IP:**
```bash
curl ifconfig.me
```

### 2. **Check Internet Connection**

Verify you can reach the MongoDB cluster:
```bash
nslookup cluster0.gqsgshy.mongodb.net
ping cluster0.gqsgshy.mongodb.net
```

### 3. **Verify Connection String**

Check `.env` file contains correct credentials:
```env
MONGODB_URI=mongodb+srv://username:password@cluster0.gqsgshy.mongodb.net/?appName=Cluster0
```

Make sure:
- Username and password are correct
- No special characters need URL encoding
- Connection string is not truncated

### 4. **Test Connection Directly**

```bash
# In Node.js:
npm install mongoose
node -e "
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://...').then(() => {
  console.log('✓ Connected!');
  process.exit(0);
}).catch(err => {
  console.error('✗ Failed:', err.message);
  process.exit(1);
});
"
```

### 5. **Temporary Workaround: Use CSV Import**

While you fix MongoDB:

1. Start the server: `npm start`
2. Open `http://localhost:10000/dashboard.html`
3. Click **Import JSON/CSV**
4. Select `websites-import.csv`
5. All 115 websites will load locally
6. Data will sync to MongoDB once connection is restored

## Quick Checklist

- [ ] MongoDB cluster is running
- [ ] Your IP is whitelisted in MongoDB Atlas
- [ ] `.env` has correct connection string
- [ ] No proxy/firewall blocking port 27017
- [ ] Internet connectivity is working
- [ ] Credentials are not URL-encoded

## Still Not Working?

1. Check MongoDB Atlas **Cluster Status** — is it running?
2. Try **Creating a New Cluster** if current one is suspended
3. Check **Activity Log** in MongoDB Atlas for connection attempts
4. Reset password and update `.env` if credentials are incorrect
5. Try from a different network (to rule out local firewall issues)

## For Production

Never use `0.0.0.0/0` whitelist. Use specific IP addresses only.
