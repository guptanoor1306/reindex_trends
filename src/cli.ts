#!/usr/bin/env node

import * as dotenv from 'dotenv';
import { ingestVideos } from './ingest';
import { fetchTrends } from './trends';
import { matchTrendsToVideos } from './matcher';
import { generateOutput } from './output';

// Load environment variables
dotenv.config();

const command = process.argv[2];
const inputFile = process.argv[3] || './data/videos.json';

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Error: OPENAI_API_KEY not found in environment');
    console.error('Please create a .env file with your OpenAI API key');
    process.exit(1);
  }

  console.log('🚀 re-indexer POC\n');

  switch (command) {
    case 'ingest':
      await ingestVideos(inputFile);
      break;

    case 'trends':
      await fetchTrends();
      break;

    case 'match':
      await matchTrendsToVideos();
      generateOutput();
      break;

    default:
      console.log('Usage:');
      console.log('  npm run ingest [path/to/videos.json]  - Ingest videos and generate embeddings');
      console.log('  npm run trends                         - Fetch trending topics');
      console.log('  npm run match                          - Match trends to videos and generate output');
      console.log('\nExample workflow:');
      console.log('  npm run ingest');
      console.log('  npm run trends');
      console.log('  npm run match');
      process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
