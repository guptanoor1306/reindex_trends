# Railway Volume Setup Guide

## 🗂️ Setting Up Persistent Storage for Database

Follow these steps to create a Railway volume that persists your SQLite database across deployments.

---

## Step 1: Create Volume in Railway Dashboard

1. **Go to Railway Dashboard:**
   - Visit: https://railway.app/dashboard
   - Click on your `reindex_trends` project

2. **Select Your Service:**
   - Click on the `reindex_trends` service

3. **Navigate to Volumes:**
   - Click on the "**Settings**" tab
   - Scroll down to find "**Volumes**" section

4. **Create New Volume:**
   - Click "**+ New Volume**"
   - **Mount Path:** `/data`
   - Click "**Add**"

---

## Step 2: Add Environment Variable

1. **Go to Variables Tab:**
   - Click on the "**Variables**" tab

2. **Add Volume Path Variable:**
   - Click "**+ New Variable**"
   - **Name:** `RAILWAY_VOLUME_MOUNT_PATH`
   - **Value:** `/data`
   - Click "**Add**"

---

## Step 3: Redeploy

After adding the volume and variable:
- Railway will automatically redeploy your app
- Wait for deployment to complete (~2-3 minutes)

---

## Step 4: Run Ingestion on Railway

Once deployment is complete, run ingestion to populate the database in the persistent volume:

```bash
railway run npm run ingest
```

This will:
- Create `reindexer.db` in the `/data` volume
- Process all 150 videos
- Generate embeddings
- Take 5-10 minutes

---

## Step 5: Verify It Works

1. **Try matching a trend** in your Railway app URL
2. **Check logs for:**
   ```
   📂 Database path: /data/reindexer.db
   🔍 Vector Search Debug:
      - Total videos in DB: 150
      - Total chunks in DB: 1800+
   ```

---

## ✅ Benefits of Volumes

- ✅ **Database persists** across deployments
- ✅ **No data loss** on container restarts
- ✅ **Run ingestion once** and keep forever
- ✅ **Faster redeployments** (no need to re-ingest)

---

## 💡 Volume Storage Limits

Railway volumes:
- **Free tier:** 5GB storage
- **Pro tier:** Higher limits available

Your database size:
- ~150 videos with embeddings ≈ **100-200MB**
- Plenty of room for growth!

---

## 🔄 Adding New Videos Later

When you add new videos to `videos.json`:

```bash
# 1. Push code to GitHub
git add .
git commit -m "Add new videos"
git push

# 2. Run incremental ingestion (only processes new videos)
railway run npm run ingest
```

The volume ensures your existing data stays intact! 🎉

---

## 🚨 Troubleshooting

### Volume Not Working?
1. Check volume is mounted at `/data` in Railway Settings → Volumes
2. Verify `RAILWAY_VOLUME_MOUNT_PATH=/data` in Variables
3. Check logs for: `📂 Database path: /data/reindexer.db`

### Still Getting 0 Chunks?
1. Wait for full deployment after volume setup
2. Re-run ingestion: `railway run npm run ingest`
3. Check it processed videos (not skipped all 150)
