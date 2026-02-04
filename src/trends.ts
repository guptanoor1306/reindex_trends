import Parser from 'rss-parser';
import { DB } from './db';
import { Trend } from './types';

const RSS_FEEDS = [
  'https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en', // Google News India (All Categories)
];

const MAX_TRENDS = 20;

export async function fetchTrends() {
  console.log('📰 Fetching trending topics from Google News...');
  
  const parser = new Parser();
  const db = new DB();
  
  // Clear existing recommendations first (to avoid foreign key constraint)
  db.clearRecommendations();
  // Then clear existing trends to avoid duplicates
  db.db.prepare('DELETE FROM trends').run();
  
  const trends: Trend[] = [];
  const seenTitles = new Set<string>();
  
  for (const feedUrl of RSS_FEEDS) {
    try {
      const feed = await parser.parseURL(feedUrl);
      
      for (const item of feed.items) {
        if (trends.length >= MAX_TRENDS) break;
        
        const title = item.title || '';
        
        // Normalize title for better duplicate detection
        const normalizedTitle = title.toLowerCase().trim();
        
        if (!title || seenTitles.has(normalizedTitle)) continue;
        
        seenTitles.add(normalizedTitle);
        
        const trend: Trend = {
          trend_id: generateTrendId(title),
          title: title,
          summary: item.contentSnippet || item.content || title,
          keywords: extractKeywords(title),
          source: 'google_news',
          created_at: new Date().toISOString()
        };
        
        trends.push(trend);
        db.insertTrend(trend);
        
        console.log(`  ✓ ${trend.title}`);
      }
      
      if (trends.length >= MAX_TRENDS) break;
    } catch (error) {
      console.error(`Failed to fetch from ${feedUrl}:`, error);
    }
  }
  
  db.close();
  
  console.log(`\n✅ Fetched ${trends.length} unique trending topics`);
  return trends;
}

export function generateTrendId(title: string): string {
  const normalized = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `trend_${normalized.substring(0, 50)}_${Date.now()}`;
}

export function extractKeywords(title: string): string {
  // Simple keyword extraction - remove common words
  const stopWords = new Set([
    'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'this', 'that', 'these', 'those', 'and', 'or', 'but'
  ]);
  
  const words = title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w));
  
  return words.slice(0, 10).join(', ');
}
