# SF/LF Content Type Feature Setup Guide

## ✅ What's Implemented

You can now match trends with **Short-form (SF)** and **Long-form (LF)** videos separately or together.

### Features:
- ✅ Database schema updated with `content_type` column
- ✅ CSV ingestion support for both SF and LF content
- ✅ UI checkboxes to select SF/LF/Both
- ✅ Results show content type badge (⚡ SHORT / 🎬 LONG-FORM)
- ✅ Results show publish date for shorts
- ✅ Vector similarity score displayed

## 📥 How to Ingest Data

### Local Setup

1. **Ingest Long-form videos (LF):**
   ```bash
   npm run build
   npm run ingest zero1-by-zerodha-lifetime.csv
   ```

2. **Ingest Shorts (SF):**
   ```bash
   npm run ingest zero1-shorts_only.csv
   ```

3. **Force re-process all videos:**
   ```bash
   npm run ingest zero1-shorts_only.csv -- --force
   ```

### What Happens During Ingestion:
- Parses CSV file
- Extracts first 200 words as intro
- Chunks transcript into 1000-character segments
- Generates OpenAI embeddings for each chunk
- Stores in SQLite database with content_type

## 🚀 Railway Deployment

### Option 1: Using Railway CLI (Recommended)

```bash
# Install Railway CLI if you haven't
npm i -g @railway/cli

# Login to Railway
railway login

# Link to your project
railway link

# Run ingestion on Railway
railway run npm run ingest zero1-by-zerodha-lifetime.csv
railway run npm run ingest zero1-shorts_only.csv
```

### Option 2: Using the Ingestion API Endpoint

The app already has an ingestion API endpoint. You can trigger it:

```bash
curl -X POST https://your-app.railway.app/api/run-ingestion \
  -H "Content-Type: application/json" \
  -d '{"secret": "your-ingestion-secret"}'
```

**Note:** This endpoint currently ingests from the `data/videos.json` file. You'd need to update it to handle CSV files or upload the CSV to Railway first.

### Option 3: SSH into Railway Container

```bash
# SSH into the running container
railway shell

# Run ingestion
npm run ingest zero1-by-zerodha-lifetime.csv
npm run ingest zero1-shorts_only.csv
```

## 🎯 How to Use in UI

1. **Fetch or add trends** (Step 1)
2. **Select relevant trends** (Step 2)
3. **Choose content type:**
   - ✅ **🎬 Long-form (LF)** - Regular videos
   - ✅ **⚡ Shorts (SF)** - Short-form content
   - Both checked = Match with all content
4. **Click "Match Selected Trends"**
5. **View results** with content type badges and publish dates

## 📊 Database Schema

```sql
CREATE TABLE videos (
  video_id TEXT PRIMARY KEY,
  title_current TEXT NOT NULL,
  transcript_full TEXT NOT NULL,
  transcript_intro TEXT NOT NULL,
  published_at TEXT NOT NULL,
  url TEXT NOT NULL,
  content_type TEXT DEFAULT 'LF'  -- 'LF' or 'SF'
);
```

## 🔄 Migration

The database automatically adds the `content_type` column if it doesn't exist:
- **Existing videos** default to 'LF'
- **New videos** get content type from CSV (`content_type` column)

## 📝 CSV Format

Your `zero1-shorts_only.csv` should have these columns:

```csv
video_id,title,description,transcript,url,published_at,content_type
abc123,Title Here,Description,Full transcript...,https://...,2024-06-25T15:30:13,short
```

The ingestion automatically converts:
- `content_type = "short"` → `SF`
- Any other value → `LF`

## 🎨 UI Display

Results now show:
- **⚡ SHORT** badge (red) for SF content
- **🎬 LONG-FORM** badge (teal) for LF content
- **📅 Publish date** next to badge
- **🎯 Vector Match %** - actual embedding similarity

## ⚠️ Important Notes

1. **Railway Volume:** Make sure your Railway database is stored in a persistent volume (see `RAILWAY_VOLUME_SETUP.md`)
2. **Embeddings:** Generating embeddings costs OpenAI credits (~$0.0001 per 1K tokens)
3. **Incremental Ingestion:** Re-running ingestion only processes new videos (unless you use `--force`)
4. **Existing Data:** All existing videos default to 'LF' content type

## 🐛 Troubleshooting

### "No videos found after filtering"
- Check that you've ingested videos with the correct content type
- Verify checkboxes are selected in UI
- Check database: `SELECT content_type, COUNT(*) FROM videos GROUP BY content_type;`

### "Migration error: duplicate column"
- This is expected if the column already exists - the app handles it gracefully

### CSV parsing issues
- Ensure CSV uses comma separators (not semicolons)
- Check that all required columns exist
- Verify no line breaks inside CSV fields

## 📞 Need Help?

Check these files:
- `src/db.ts` - Database schema and queries
- `src/ingest.ts` - CSV parsing and ingestion logic
- `src/server.ts` - Matching API with content type filtering
- `public/index.html` - UI with SF/LF checkboxes
