import * as fs from 'fs';
import * as path from 'path';
import { DB } from './db';
import { RecommendationOutput } from './types';

const OUTPUT_DIR = './out';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'recommendations.json');

export function generateOutput() {
  console.log('📝 Generating output...\n');
  
  const db = new DB();
  const recommendations = db.getAllRecommendations();
  
  if (recommendations.length === 0) {
    console.log('⚠️  No recommendations found.');
    db.close();
    return;
  }
  
  const output: RecommendationOutput[] = [];
  
  for (const rec of recommendations) {
    const trend = db.getTrend(rec.trend_id);
    const video = db.getVideo(rec.video_id);
    
    if (!trend || !video) continue;
    
    output.push({
      trend,
      video,
      scores: {
        semantic_relevance: rec.semantic_relevance,
        intro_support: rec.intro_support,
        honesty_risk: rec.honesty_risk
      },
      packaging: {
        titles: JSON.parse(rec.titles),
        thumbnails: JSON.parse(rec.thumbnails),
        notes: rec.notes
      }
    });
  }
  
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // Write to file
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  
  console.log(`✅ Wrote ${output.length} recommendations to ${OUTPUT_FILE}\n`);
  
  // Print top 5 to console
  console.log('🏆 TOP 5 RECOMMENDATIONS:\n');
  
  const top5 = output.slice(0, 5);
  
  for (let i = 0; i < top5.length; i++) {
    const item = top5[i];
    console.log(`${i + 1}. TREND: ${item.trend.title}`);
    console.log(`   VIDEO: ${item.video.title_current}`);
    console.log(`   SCORES: Relevance=${item.scores.semantic_relevance.toFixed(2)}, Intro=${item.scores.intro_support.toFixed(2)}, Risk=${item.scores.honesty_risk.toFixed(2)}`);
    console.log(`   NEW TITLES:`);
    item.packaging.titles.forEach(t => console.log(`     - ${t}`));
    console.log(`   THUMBNAILS:`);
    item.packaging.thumbnails.forEach(t => console.log(`     - ${t}`));
    console.log(`   NOTES: ${item.packaging.notes}`);
    console.log('');
  }
  
  db.close();
}
