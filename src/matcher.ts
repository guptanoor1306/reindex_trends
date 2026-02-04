import OpenAI from 'openai';
import { DB } from './db';
import { generateEmbedding, cosineSimilarity } from './embeddings';
import { Trend, Video, LLMEvaluation, Recommendation, RecommendationOutput } from './types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const TOP_CANDIDATES_PER_TREND = 3; // Reduced to top 3 for better quality
const TOP_CHUNKS_FOR_LLM = 3;

// Acceptance thresholds - Balanced for quality creative repackaging
const MIN_SEMANTIC_RELEVANCE = 0.65;
const MIN_INTRO_SUPPORT = 0.65;
const MAX_HONESTY_RISK = 0.30;

export async function matchTrendsToVideos() {
  console.log('🔍 Starting trend-to-video matching...\n');
  
  const db = new DB();
  const trends = db.getAllTrends();
  const videos = db.getAllVideos();
  
  if (trends.length === 0) {
    console.log('⚠️  No trends found. Run "npm run trends" first.');
    db.close();
    return;
  }
  
  if (videos.length === 0) {
    console.log('⚠️  No videos found. Run "npm run ingest" first.');
    db.close();
    return;
  }
  
  console.log(`Processing ${trends.length} trends × ${videos.length} videos pool\n`);
  
  // Clear previous recommendations
  db.clearRecommendations();
  
  let totalEvaluations = 0;
  let acceptedCount = 0;
  
  for (const trend of trends) {
    console.log(`📊 Trend: ${trend.title}`);
    
    // STEP 1: Vector search to get top candidates
    const candidates = await getCandidateVideos(db, trend, videos);
    console.log(`  → Found ${candidates.length} candidate videos via vector search`);
    
    // STEP 2: Single LLM call per candidate
    for (const candidate of candidates) {
      totalEvaluations++;
      
      const topChunks = candidate.topChunks.slice(0, TOP_CHUNKS_FOR_LLM);
      const evaluation = await evaluateWithLLM(trend, candidate.video, topChunks);
      
      // STEP 3: Apply acceptance rules
      const accepted = 
        evaluation.allowed &&
        evaluation.semantic_relevance >= MIN_SEMANTIC_RELEVANCE &&
        evaluation.intro_support >= MIN_INTRO_SUPPORT &&
        evaluation.honesty_risk <= MAX_HONESTY_RISK;
      
      if (accepted) {
        acceptedCount++;
        
        const recommendation: Recommendation = {
          trend_id: trend.trend_id,
          video_id: candidate.video.video_id,
          semantic_relevance: evaluation.semantic_relevance,
          intro_support: evaluation.intro_support,
          honesty_risk: evaluation.honesty_risk,
          titles: JSON.stringify(evaluation.titles),
          thumbnails: JSON.stringify(evaluation.thumbnails),
          notes: evaluation.notes
        };
        
        db.insertRecommendation(recommendation);
        
        console.log(`    ✅ ACCEPTED: ${candidate.video.title_current}`);
        console.log(`       Relevance: ${evaluation.semantic_relevance.toFixed(2)}, Intro: ${evaluation.intro_support.toFixed(2)}, Risk: ${evaluation.honesty_risk.toFixed(2)}`);
      } else {
        console.log(`    ❌ REJECTED: ${candidate.video.title_current}`);
      }
    }
    
    console.log('');
  }
  
  db.close();
  
  console.log(`\n📈 Summary:`);
  console.log(`   Total LLM evaluations: ${totalEvaluations}`);
  console.log(`   Accepted: ${acceptedCount}`);
  console.log(`   Rejected: ${totalEvaluations - acceptedCount}`);
  console.log(`\n✅ Matching complete. Results saved to database.`);
}

interface CandidateVideo {
  video: Video;
  avgSimilarity: number;
  topChunks: string[];
}

async function getCandidateVideos(
  db: DB,
  trend: Trend,
  allVideos: Video[]
): Promise<CandidateVideo[]> {
  // Use broader themes for embedding to capture creative angles
  const enrichedQuery = extractBroaderThemes(trend);
  const trendEmbedding = await generateEmbedding(enrichedQuery);
  
  // Load all chunks with embeddings
  const allChunks = db.getAllChunks();
  
  // Calculate similarity for each chunk
  const chunkScores: Array<{
    video_id: string;
    chunk_text: string;
    similarity: number;
  }> = [];
  
  for (const chunk of allChunks) {
    const chunkEmbedding = Array.from(new Float32Array(chunk.embedding.buffer));
    const similarity = cosineSimilarity(trendEmbedding, chunkEmbedding);
    
    chunkScores.push({
      video_id: chunk.video_id,
      chunk_text: chunk.chunk_text,
      similarity
    });
  }
  
  // Aggregate by video_id
  const videoScores = new Map<string, { scores: number[]; chunks: Array<{ text: string; score: number }> }>();
  
  for (const score of chunkScores) {
    if (!videoScores.has(score.video_id)) {
      videoScores.set(score.video_id, { scores: [], chunks: [] });
    }
    const videoData = videoScores.get(score.video_id)!;
    videoData.scores.push(score.similarity);
    videoData.chunks.push({ text: score.chunk_text, score: score.similarity });
  }
  
  // Calculate average similarity per video
  const candidates: CandidateVideo[] = [];
  
  for (const [video_id, data] of videoScores.entries()) {
    const video = allVideos.find(v => v.video_id === video_id);
    if (!video) continue;
    
    const avgSimilarity = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
    
    // Get top chunks for this video
    const topChunks = data.chunks
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(c => c.text);
    
    candidates.push({
      video,
      avgSimilarity,
      topChunks
    });
  }
  
  // Sort by similarity and take top N
  candidates.sort((a, b) => b.avgSimilarity - a.avgSimilarity);
  
  return candidates.slice(0, TOP_CANDIDATES_PER_TREND);
}

// Extract broader themes from trend for better matching
function extractBroaderThemes(trend: Trend): string {
  const title = trend.title.toLowerCase();
  const summary = trend.summary.toLowerCase();
  const combined = `${title} ${summary}`;
  
  const themes: string[] = [];
  
  if (combined.includes('ai') || combined.includes('artificial intelligence') || 
      combined.includes('chatgpt') || combined.includes('machine learning')) {
    themes.push('artificial intelligence, AI technology, automation, tech innovation');
  }
  
  if (combined.includes('budget') || combined.includes('tax') || 
      combined.includes('income tax') || combined.includes('fiscal')) {
    themes.push('taxation, financial planning, income tax, savings, money management');
  }
  
  if (combined.includes('job') || combined.includes('layoff') || 
      combined.includes('career') || combined.includes('employment')) {
    themes.push('careers, employment, job market, professional growth');
  }
  
  if (combined.includes('stock') || combined.includes('market') || 
      combined.includes('investment') || combined.includes('trading')) {
    themes.push('investing, stock market, wealth building, financial markets');
  }
  
  return themes.length > 0 
    ? `${trend.summary}. Related themes: ${themes.join(', ')}`
    : trend.summary;
}

async function evaluateWithLLM(
  trend: Trend,
  video: Video,
  topChunks: string[]
): Promise<LLMEvaluation> {
  const systemPrompt = `You are a CREATIVE YouTube strategist evaluating whether an EXISTING video can be 
REPACKAGED with a new angle to capitalize on a trending topic. Find CREATIVE CONNECTIONS and THEMATIC OVERLAPS,
even if the video doesn't directly mention the trend.`;

  const userPrompt = `Trend:
- Title: ${trend.title}
- Summary: ${trend.summary}
- Keywords: ${trend.keywords}

Video:
- Current Title: ${video.title_current}
- Transcript Intro (first 45-90s):
${video.transcript_intro}

- Relevant Transcript Excerpts:
${topChunks.map((chunk, i) => `[Excerpt ${i + 1}]\n${chunk}`).join('\n\n')}

CREATIVE REPACKAGING APPROACH:
1) Look for THEMATIC CONNECTIONS between video and trend
2) Consider AUDIENCE OVERLAP - would trend followers care about this topic?
3) Evaluate REPACKAGING POTENTIAL - can we frame this video to tie into the trend honestly?
4) Check HONESTY RISK - would this mislead viewers?

SCORING REQUIREMENTS:
- semantic_relevance 0.65+: Strong thematic connection
- intro_support 0.65+: Intro naturally supports the angle
- honesty_risk <0.30: Honest repackaging

ACCEPT only if STRONG creative angle exists. Be selective.

OUTPUT JSON ONLY:
{
  "semantic_relevance": 0.0-1.0,
  "intro_support": 0.0-1.0,
  "honesty_risk": 0.0-1.0,
  "allowed": true/false,
  "titles": ["creative title with trend angle", "title 2", "title 3"],
  "thumbnails": ["thumbnail 1", "thumbnail 2"],
  "notes": "Explain the creative angle"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });
    
    const content = response.choices[0].message.content || '{}';
    const evaluation = JSON.parse(content) as LLMEvaluation;
    
    // Validate structure
    if (typeof evaluation.semantic_relevance !== 'number' ||
        typeof evaluation.intro_support !== 'number' ||
        typeof evaluation.honesty_risk !== 'number' ||
        typeof evaluation.allowed !== 'boolean') {
      throw new Error('Invalid LLM response structure');
    }
    
    return evaluation;
  } catch (error) {
    console.error('    ⚠️  LLM evaluation failed:', error);
    // Return conservative rejection
    return {
      semantic_relevance: 0,
      intro_support: 0,
      honesty_risk: 1.0,
      allowed: false,
      titles: [],
      thumbnails: [],
      notes: 'Evaluation failed'
    };
  }
}
