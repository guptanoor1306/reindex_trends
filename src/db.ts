import Database from 'better-sqlite3';
import { Video, VideoChunk, Trend, Recommendation } from './types';
import * as path from 'path';
import * as fs from 'fs';

// Use Railway volume path in production, local path in development
const DB_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || '.';
const DB_PATH = path.join(DB_DIR, 'reindexer.db');

// Ensure directory exists (for Railway volumes)
if (DB_DIR !== '.' && !fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

export class DB {
  public db: Database.Database;

  constructor() {
    console.log(`📂 Database path: ${DB_PATH}`);
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS videos (
        video_id TEXT PRIMARY KEY,
        title_current TEXT NOT NULL,
        transcript_full TEXT NOT NULL,
        transcript_intro TEXT NOT NULL,
        published_at TEXT NOT NULL,
        url TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS video_chunks (
        video_id TEXT NOT NULL,
        chunk_id INTEGER NOT NULL,
        chunk_text TEXT NOT NULL,
        embedding BLOB NOT NULL,
        PRIMARY KEY (video_id, chunk_id),
        FOREIGN KEY (video_id) REFERENCES videos(video_id)
      );

      CREATE INDEX IF NOT EXISTS idx_video_chunks_video_id 
        ON video_chunks(video_id);

      CREATE TABLE IF NOT EXISTS trends (
        trend_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        keywords TEXT NOT NULL,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS recommendations (
        trend_id TEXT NOT NULL,
        video_id TEXT NOT NULL,
        semantic_relevance REAL NOT NULL,
        intro_support REAL NOT NULL,
        honesty_risk REAL NOT NULL,
        titles TEXT NOT NULL,
        thumbnails TEXT NOT NULL,
        notes TEXT NOT NULL,
        PRIMARY KEY (trend_id, video_id),
        FOREIGN KEY (trend_id) REFERENCES trends(trend_id),
        FOREIGN KEY (video_id) REFERENCES videos(video_id)
      );
    `);
  }

  insertVideo(video: Video) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO videos 
      (video_id, title_current, transcript_full, transcript_intro, published_at, url)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      video.video_id,
      video.title_current,
      video.transcript_full,
      video.transcript_intro,
      video.published_at,
      video.url || ''
    );
  }

  insertVideoChunk(chunk: VideoChunk) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO video_chunks 
      (video_id, chunk_id, chunk_text, embedding)
      VALUES (?, ?, ?, ?)
    `);
    const embeddingBlob = Buffer.from(new Float32Array(chunk.embedding).buffer);
    stmt.run(chunk.video_id, chunk.chunk_id, chunk.chunk_text, embeddingBlob);
  }

  insertTrend(trend: Trend) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO trends 
      (trend_id, title, summary, keywords, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      trend.trend_id,
      trend.title,
      trend.summary,
      trend.keywords,
      trend.source,
      trend.created_at
    );
  }

  insertRecommendation(rec: Recommendation) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO recommendations 
      (trend_id, video_id, semantic_relevance, intro_support, honesty_risk, titles, thumbnails, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      rec.trend_id,
      rec.video_id,
      rec.semantic_relevance,
      rec.intro_support,
      rec.honesty_risk,
      rec.titles,
      rec.thumbnails,
      rec.notes
    );
  }

  getAllVideos(): Video[] {
    const stmt = this.db.prepare('SELECT * FROM videos');
    return stmt.all() as Video[];
  }

  getVideo(video_id: string): Video | undefined {
    const stmt = this.db.prepare('SELECT * FROM videos WHERE video_id = ?');
    return stmt.get(video_id) as Video | undefined;
  }

  getAllTrends(): Trend[] {
    const stmt = this.db.prepare('SELECT * FROM trends ORDER BY created_at DESC');
    return stmt.all() as Trend[];
  }

  getTrend(trend_id: string): Trend | undefined {
    const stmt = this.db.prepare('SELECT * FROM trends WHERE trend_id = ?');
    return stmt.get(trend_id) as Trend | undefined;
  }

  getAllChunks(): Array<VideoChunk & { embedding: Buffer }> {
    const stmt = this.db.prepare('SELECT * FROM video_chunks');
    return stmt.all() as Array<VideoChunk & { embedding: Buffer }>;
  }

  getChunksForVideo(video_id: string): Array<{ chunk_text: string }> {
    const stmt = this.db.prepare(
      'SELECT chunk_text FROM video_chunks WHERE video_id = ? ORDER BY chunk_id'
    );
    return stmt.all(video_id) as Array<{ chunk_text: string }>;
  }

  getAllRecommendations(): Recommendation[] {
    const stmt = this.db.prepare(`
      SELECT * FROM recommendations 
      ORDER BY semantic_relevance DESC, intro_support DESC
    `);
    return stmt.all() as Recommendation[];
  }

  clearRecommendations() {
    this.db.prepare('DELETE FROM recommendations').run();
  }

  close() {
    this.db.close();
  }
}
