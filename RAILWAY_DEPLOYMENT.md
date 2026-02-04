# Railway Deployment Guide

## Prerequisites
1. A Railway account (sign up at https://railway.app)
2. Your API keys ready:
   - `OPENAI_API_KEY`
   - `YOUTUBE_API_KEY`

## Deployment Steps

### 1. Push to GitHub (Recommended)
```bash
cd /Users/noorgupta/Downloads/Cursor/reindexation
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

### 2. Deploy on Railway

#### Option A: Via GitHub (Recommended)
1. Go to https://railway.app
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your repository
5. Railway will automatically detect the configuration

#### Option B: Via Railway CLI
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Deploy
railway up
```

### 3. Configure Environment Variables
In Railway dashboard:
1. Go to your project
2. Click on "Variables" tab
3. Add these environment variables:
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `YOUTUBE_API_KEY`: Your YouTube Data API v3 key
   - `NODE_ENV`: `production`

### 4. Run Initial Setup (One-time)
After deployment, you need to ingest your videos:

```bash
# Using Railway CLI
railway run npm run ingest
```

Or use Railway's "Run Command" feature in the dashboard.

## Important Notes

### Database Persistence
The SQLite database (`re-indexer.db`) will be stored in Railway's ephemeral storage. For persistent data:
1. Use Railway's persistent volumes (recommended)
2. Or migrate to PostgreSQL using Railway's database addon

### Persistent Volume Setup
1. In Railway dashboard, go to your service
2. Click "Settings" → "Volumes"
3. Add a volume mounted at `/app/data`
4. Update `src/db.ts` to use `/app/data/re-indexer.db`

### Cost Considerations
- Railway free tier: 500 hours/month, $5 credit
- OpenAI API: Pay per token usage
- YouTube API: 10,000 free quota units/day

## Accessing Your App
After deployment, Railway will provide a URL like:
`https://your-app-name.up.railway.app`

## Troubleshooting

### Build Fails
- Check if all dependencies are in `package.json` (not devDependencies)
- Verify TypeScript builds locally: `npm run build`

### App Crashes
- Check Railway logs: `railway logs`
- Verify environment variables are set correctly
- Ensure database file path is accessible

### API Errors
- Verify API keys are correct in Railway variables
- Check OpenAI usage limits
- Verify YouTube API quota

## Local Testing
Before deploying, test locally:
```bash
export PORT=3000
npm run build
npm start
```

## Updating Deployment
Push changes to GitHub, and Railway will auto-deploy:
```bash
git add .
git commit -m "Update description"
git push
```

Or using Railway CLI:
```bash
railway up
```
