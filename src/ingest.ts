import * as fs from 'fs';
import { parse } from 'csv-parse/sync';
import { DB } from './db';
import { Video, VideoChunk } from './types';
import { generateEmbeddings } from './embeddings';

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;
const INTRO_WORDS = 200; // First 200 words as intro

export async function ingestVideos(inputPath: string, forceReprocess: boolean = false) {
  console.log(`📥 Loading videos from ${inputPath}...`);
  
  const rawData = fs.readFileSync(inputPath, 'utf-8');
  
  // Determine if input is JSON or CSV
  let videos: Video[];
  if (inputPath.endsWith('.csv')) {
    // Parse CSV with proper handling of commas in fields
    const records = parse(rawData, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });
    
    videos = records.map((rec: any) => ({
      video_id: rec.video_id || '',
      title_current: rec.title || '',
      transcript_full: rec.transcript || '',
      transcript_intro: '', // Will be generated
      published_at: rec.published_at || new Date().toISOString(),
      url: rec.url || '',
      content_type: (rec.content_type === 'short' ? 'SF' : 'LF') as 'LF' | 'SF'
    })).filter((v: any) => v.video_id && v.transcript_full) as Video[]; // Filter out invalid rows
  } else {
    videos = JSON.parse(rawData) as Video[];
  }
  
  console.log(`Found ${videos.length} videos`);
  
  const db = new DB();
  
  // Get list of existing video IDs
  const existingVideos = db.getAllVideos();
  const existingVideoIds = new Set(existingVideos.map(v => v.video_id));
  
  let processedCount = 0;
  let skippedCount = 0;
  
  for (const video of videos) {
    // Skip if video already exists (unless force reprocess)
    if (!forceReprocess && existingVideoIds.has(video.video_id)) {
      skippedCount++;
      console.log(`\n ⏭️  Skipping: ${video.video_id} - ${video.title_current} (already exists)`);
      continue;
    }
    
    processedCount++;
    console.log(`\n Processing: ${video.video_id} - ${video.title_current}`);
    
    // Extract intro (first 200 words)
    const words = video.transcript_full.split(/\s+/);
    const introWords = words.slice(0, INTRO_WORDS);
    const introText = introWords.join(' ');
    
    const videoWithIntro: Video = {
      ...video,
      url: video.url || `https://youtube.com/watch?v=${video.video_id}`,
      transcript_intro: introText
    };
    
    // Insert video
    db.insertVideo(videoWithIntro);
    
    // Chunk transcript
    const chunks = chunkText(video.transcript_full).filter(c => c.trim().length > 0);
    
    if (chunks.length === 0) {
      console.log(`  ⚠️  Skipping - no valid chunks (empty transcript)`);
      continue;
    }
    
    console.log(`  - Created ${chunks.length} chunks`);
    
    // Generate embeddings in batch
    console.log(`  - Generating embeddings...`);
    const embeddings = await generateEmbeddings(chunks);
    
    // Insert chunks with embeddings
    for (let i = 0; i < chunks.length; i++) {
      const chunk: VideoChunk = {
        video_id: video.video_id,
        chunk_id: i,
        chunk_text: chunks[i],
        embedding: embeddings[i]
      };
      db.insertVideoChunk(chunk);
    }
    
    console.log(`  ✅ Completed`);
  }
  
  db.close();
  console.log(`\n✅ Ingestion complete!`);
  console.log(`   📊 Total videos in file: ${videos.length}`);
  console.log(`   ✨ Newly processed: ${processedCount}`);
  console.log(`   ⏭️  Skipped (already exist): ${skippedCount}`);
}

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.substring(start, end));
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  
  return chunks;
}
