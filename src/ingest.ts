import * as fs from 'fs';
import { DB } from './db';
import { Video, VideoChunk } from './types';
import { generateEmbeddings } from './embeddings';

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;
const INTRO_WORDS = 200; // First 200 words as intro

export async function ingestVideos(inputPath: string) {
  console.log(`📥 Loading videos from ${inputPath}...`);
  
  const rawData = fs.readFileSync(inputPath, 'utf-8');
  const videos = JSON.parse(rawData) as Video[];
  
  console.log(`Found ${videos.length} videos`);
  
  const db = new DB();
  
  for (const video of videos) {
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
    const chunks = chunkText(video.transcript_full);
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
  console.log(`\n✅ Ingestion complete. ${videos.length} videos processed.`);
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
