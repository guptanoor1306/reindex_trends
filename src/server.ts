import express from 'express';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { DB } from './db';
import { fetchTrends, generateTrendId, extractKeywords } from './trends';
import { generateEmbedding, cosineSimilarity } from './embeddings';
import { Trend, Video, LLMEvaluation, Recommendation, TrendRecommendations } from './types';
import { getYouTubeTitleSuggestions } from './youtube';
import OpenAI from 'openai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const TOP_CANDIDATES_PER_TREND = 3; // Reduced to top 3 for better quality
const TOP_CHUNKS_FOR_LLM = 3;
const MIN_SEMANTIC_RELEVANCE = 0.65; // Must have solid connection to trend
const MIN_INTRO_SUPPORT = 0.65; // Restored - intro should naturally support the angle
const MAX_HONESTY_RISK = 0.30; // Keep strict to avoid misleading content

// API: Check environment variables
app.get('/api/check-env', (req, res) => {
  res.json({
    openai_configured: !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here',
    youtube_configured: !!process.env.YOUTUBE_API_KEY && process.env.YOUTUBE_API_KEY !== 'your_youtube_api_key_here',
    openai_preview: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.substring(0, 15) + '...' : 'not set',
    youtube_preview: process.env.YOUTUBE_API_KEY ? process.env.YOUTUBE_API_KEY.substring(0, 15) + '...' : 'not set'
  });
});

// API: Test YouTube API key
app.get('/api/test-youtube', async (req, res) => {
  try {
    const apiKey = process.env.YOUTUBE_API_KEY;
    
    if (!apiKey || apiKey === 'your_youtube_api_key_here') {
      return res.json({ 
        success: false, 
        error: 'YouTube API key not configured in .env file' 
      });
    }

    // Test with a simple search
    const testQuery = 'news';
    const testUrl = new URL('https://www.googleapis.com/youtube/v3/search');
    testUrl.searchParams.append('part', 'snippet');
    testUrl.searchParams.append('q', testQuery);
    testUrl.searchParams.append('type', 'video');
    testUrl.searchParams.append('maxResults', '1');
    testUrl.searchParams.append('key', apiKey);

    const response = await fetch(testUrl.toString());
    
    if (response.ok) {
      return res.json({ 
        success: true, 
        message: 'YouTube API key is valid and working!' 
      });
    } else {
      const errorText = await response.text();
      return res.json({ 
        success: false, 
        status: response.status,
        error: errorText,
        hint: response.status === 403 
          ? 'API key may have restrictions or quota exceeded'
          : response.status === 401
          ? 'Invalid API key or YouTube Data API v3 not enabled'
          : 'Unknown error'
      });
    }
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

// API: Fetch trends
app.post('/api/fetch-trends', async (req, res) => {
  try {
    await fetchTrends();
    const db = new DB();
    const trends = db.getAllTrends();
    db.close();
    res.json({ success: true, trends });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Get all trends
app.get('/api/trends', (req, res) => {
  try {
    const db = new DB();
    const trends = db.getAllTrends();
    db.close();
    res.json({ success: true, trends });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Add manual trend
app.post('/api/add-manual-trend', (req, res) => {
  try {
    const { title, description } = req.body;
    
    if (!title || title.trim() === '') {
      return res.status(400).json({ success: false, error: 'Title is required' });
    }
    
    const trend: Trend = {
      trend_id: generateTrendId(title),
      title: title.trim(),
      summary: description && description.trim() !== '' ? description.trim() : title.trim(),
      keywords: extractKeywords(title),
      source: 'manual',
      created_at: new Date().toISOString()
    };
    
    const db = new DB();
    db.insertTrend(trend);
    db.close();
    
    res.json({ success: true, trend });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Match selected trends with SSE streaming
app.post('/api/match-selected', async (req, res) => {
  try {
    const { trendIds } = req.body;
    
    if (!trendIds || trendIds.length === 0) {
      return res.status(400).json({ success: false, error: 'No trends selected' });
    }

    // Set up Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (data: any) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const db = new DB();
    const allVideos = db.getAllVideos();
    
    let totalEvaluations = 0;
    let acceptedCount = 0;
    const trendResults: TrendRecommendations[] = [];

    // Clear previous recommendations
    db.clearRecommendations();

    sendEvent({ type: 'start', message: `Processing ${trendIds.length} selected trends...` });

    for (const trendId of trendIds) {
      const trend = db.getTrend(trendId);
      if (!trend) continue;

      sendEvent({ 
        type: 'trend', 
        trend: trend.title,
        message: `📊 Processing: ${trend.title}`
      });

      // Fetch YouTube title suggestions for this trend
      sendEvent({ 
        type: 'youtube', 
        message: `  🔍 Fetching YouTube title suggestions...`
      });
      
      let youtubeSuggestions: any[] = [];
      try {
        youtubeSuggestions = await getYouTubeTitleSuggestions(
          trend.title,
          process.env.YOUTUBE_API_KEY || '',
          process.env.OPENAI_API_KEY || '',
          10
        );
        
        if (youtubeSuggestions.length > 0) {
          sendEvent({ 
            type: 'youtube', 
            count: youtubeSuggestions.length,
            message: `  ✅ Found ${youtubeSuggestions.length} YouTube title suggestions`
          });
        } else {
          sendEvent({ 
            type: 'youtube', 
            message: `  ⚠️  YouTube API unavailable - continuing with video matching`
          });
        }
      } catch (error: any) {
        console.error('YouTube API error:', error.message);
        sendEvent({ 
          type: 'youtube', 
          message: `  ⚠️  YouTube API error - continuing with video matching`
        });
      }

      const candidates = await getCandidateVideos(db, trend, allVideos);
      
      sendEvent({ 
        type: 'candidates', 
        count: candidates.length,
        message: `  → Found ${candidates.length} candidate videos`
      });

      const matchedVideos: any[] = [];

      for (const candidate of candidates) {
        totalEvaluations++;
        
        const topChunks = candidate.topChunks.slice(0, TOP_CHUNKS_FOR_LLM);
        const evaluation = await evaluateWithLLM(trend, candidate.video, topChunks);
        
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
          
          const result = {
            trend: trend.title,
            video: candidate.video.title_current,
            video_intro: candidate.video.transcript_intro,
            scores: {
              semantic_relevance: evaluation.semantic_relevance,
              intro_support: evaluation.intro_support,
              honesty_risk: evaluation.honesty_risk
            },
            packaging: {
              titles: evaluation.titles,
              thumbnails: evaluation.thumbnails,
              notes: evaluation.notes
            }
          };
          
          matchedVideos.push(result);
          
          sendEvent({ 
            type: 'accepted',
            video: candidate.video.title_current,
            scores: result.scores,
            message: `    ✅ ACCEPTED: ${candidate.video.title_current}`
          });
        } else {
          sendEvent({ 
            type: 'rejected',
            video: candidate.video.title_current,
            message: `    ❌ REJECTED: ${candidate.video.title_current}`
          });
        }
      }

      // Add trend result with YouTube suggestions and matched videos
      trendResults.push({
        trend,
        youtubeSuggestions,
        matchedVideos
      });
    }

    db.close();

    sendEvent({
      type: 'complete',
      summary: {
        totalEvaluations,
        accepted: acceptedCount,
        rejected: totalEvaluations - acceptedCount
      },
      results: trendResults
    });

    res.end();
  } catch (error: any) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    res.end();
  }
});

// API: Get recommendations
app.get('/api/recommendations', (req, res) => {
  try {
    const db = new DB();
    const recommendations = db.getAllRecommendations();
    
    const output = recommendations.map(rec => {
      const trend = db.getTrend(rec.trend_id);
      const video = db.getVideo(rec.video_id);
      
      return {
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
      };
    });
    
    db.close();
    res.json({ success: true, recommendations: output });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Extract broader themes from trend for better matching
function extractBroaderThemes(trend: Trend): string {
  const title = trend.title.toLowerCase();
  const summary = trend.summary.toLowerCase();
  const combined = `${title} ${summary}`;
  
  // Extract core themes for broader matching
  const themes: string[] = [];
  
  // AI-related
  if (combined.includes('ai') || combined.includes('artificial intelligence') || 
      combined.includes('chatgpt') || combined.includes('machine learning')) {
    themes.push('artificial intelligence, AI technology, automation, tech innovation, digital transformation');
  }
  
  // Budget/Tax related
  if (combined.includes('budget') || combined.includes('tax') || 
      combined.includes('income tax') || combined.includes('fiscal')) {
    themes.push('taxation, financial planning, income tax, savings, money management, personal finance');
  }
  
  // Jobs/Career related
  if (combined.includes('job') || combined.includes('layoff') || 
      combined.includes('career') || combined.includes('employment')) {
    themes.push('careers, employment, job market, professional growth, work opportunities');
  }
  
  // Investment/Market related
  if (combined.includes('stock') || combined.includes('market') || 
      combined.includes('investment') || combined.includes('trading')) {
    themes.push('investing, stock market, wealth building, financial markets, trading');
  }
  
  // Real Estate/Property
  if (combined.includes('real estate') || combined.includes('property') || 
      combined.includes('housing') || combined.includes('home')) {
    themes.push('real estate, property investment, housing market, home ownership');
  }
  
  // Add the themes to the search query
  return themes.length > 0 
    ? `${trend.summary}. Related themes: ${themes.join(', ')}`
    : trend.summary;
}

async function getCandidateVideos(
  db: DB,
  trend: Trend,
  allVideos: Video[]
): Promise<Array<{ video: Video; avgSimilarity: number; topChunks: string[] }>> {
  // Use broader themes for embedding to capture creative angles
  const enrichedQuery = extractBroaderThemes(trend);
  const trendEmbedding = await generateEmbedding(enrichedQuery);
  const allChunks = db.getAllChunks();
  
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
  
  const videoScores = new Map<string, { scores: number[]; chunks: Array<{ text: string; score: number }> }>();
  
  for (const score of chunkScores) {
    if (!videoScores.has(score.video_id)) {
      videoScores.set(score.video_id, { scores: [], chunks: [] });
    }
    const videoData = videoScores.get(score.video_id)!;
    videoData.scores.push(score.similarity);
    videoData.chunks.push({ text: score.chunk_text, score: score.similarity });
  }
  
  const candidates: Array<{ video: Video; avgSimilarity: number; topChunks: string[] }> = [];
  
  for (const [video_id, data] of videoScores.entries()) {
    const video = allVideos.find(v => v.video_id === video_id);
    if (!video) continue;
    
    const avgSimilarity = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
    const topChunks = data.chunks
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(c => c.text);
    
    candidates.push({ video, avgSimilarity, topChunks });
  }
  
  candidates.sort((a, b) => b.avgSimilarity - a.avgSimilarity);
  return candidates.slice(0, TOP_CANDIDATES_PER_TREND);
}

async function evaluateWithLLM(
  trend: Trend,
  video: Video,
  topChunks: string[]
): Promise<LLMEvaluation> {
  // NOTE: We're sending ONLY the intro (first 200 words) + top 3 relevant chunks
  // NOT the full transcript - this keeps costs low and focus high
  
  const systemPrompt = `You are a CREATIVE YouTube strategist evaluating whether an EXISTING video can be 
REPACKAGED with a new angle to capitalize on a trending topic.

Your goal is to find CREATIVE CONNECTIONS and THEMATIC OVERLAPS between the video content and the trend,
even if the video doesn't directly mention the trend topic. Think like a content strategist who can spot
opportunities to reframe existing content for timely relevance.`;

  const userPrompt = `Trend:
- Title: ${trend.title}
- Summary: ${trend.summary}
- Keywords: ${trend.keywords}

Video:
- Current Title: ${video.title_current}
- Transcript Intro (first 200 words):
${video.transcript_intro}

- Relevant Transcript Excerpts:
${topChunks.map((chunk, i) => `[Excerpt ${i + 1}]\n${chunk}`).join('\n\n')}

CREATIVE REPACKAGING APPROACH:
1) Look for THEMATIC CONNECTIONS: Does the video's topic intersect with the trend in any meaningful way?
   - Example: "AI Layoffs" + "MBA Worth It" → Both about career security and job market decisions
   - Example: "Budget Tax Slabs" + "Salary CTC" → Both about income, taxes, and money management
   
2) Consider AUDIENCE OVERLAP: Would people interested in this trend care about this video's topic?

3) Evaluate REPACKAGING POTENTIAL: Can we frame this video to tie into the trend WITHOUT being misleading?
   - The video doesn't need to mention the trend explicitly
   - Look for conceptual bridges and creative angles
   - Focus on honest connections, not forced ones

4) Check HONESTY RISK: Would the repackaging mislead viewers or imply false timeliness?

SCORING GUIDANCE:
- semantic_relevance: 0.6-0.8 = Creative angle exists, 0.8+ = Strong direct connection
- intro_support: 0.5-0.6 = Video can be angled to trend, 0.7+ = Intro naturally leads to trend
- honesty_risk: <0.3 = Safe honest repackaging, >0.5 = Too forced or misleading

SCORING REQUIREMENTS:
- semantic_relevance 0.65+: Strong thematic connection exists
- intro_support 0.65+: Intro naturally leads into or supports the trend angle (doesn't need to mention trend explicitly, but should discuss related concepts)
- honesty_risk <0.30: Repackaging is honest and not misleading

ACCEPT only if there's a STRONG creative angle that genuinely serves the audience.
REJECT if connection is forced, weak, or dishonest. Be selective about quality matches.

OUTPUT JSON ONLY. NO EXPLANATION TEXT.

Required JSON format:
{
  "semantic_relevance": 0.0-1.0,
  "intro_support": 0.0-1.0,
  "honesty_risk": 0.0-1.0,
  "allowed": true/false,
  "titles": ["creative title 1 with trend angle", "creative title 2", "creative title 3"],
  "thumbnails": ["thumbnail description 1", "thumbnail description 2"],
  "notes": "Explain the creative angle and how to frame this video for the trend"
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
    
    if (typeof evaluation.semantic_relevance !== 'number' ||
        typeof evaluation.intro_support !== 'number' ||
        typeof evaluation.honesty_risk !== 'number' ||
        typeof evaluation.allowed !== 'boolean') {
      throw new Error('Invalid LLM response structure');
    }
    
    return evaluation;
  } catch (error: any) {
    console.error('❌ OpenAI API Error:', error.message || error);
    console.error('   Status:', error.status || 'unknown');
    console.error('   Check your OPENAI_API_KEY in .env file');
    return {
      semantic_relevance: 0,
      intro_support: 0,
      honesty_risk: 1.0,
      allowed: false,
      titles: [],
      thumbnails: [],
      notes: `Evaluation failed: ${error.message || 'OpenAI API error'}`
    };
  }
}

app.listen(PORT, () => {
  console.log(`\n🚀 re-indexer UI running at http://localhost:${PORT}`);
  console.log(`\n📝 Workflow:`);
  console.log(`   1. Fetch trends from Google News`);
  console.log(`   2. Select relevant trends for your channel`);
  console.log(`   3. Match selected trends to your videos`);
  console.log(`   4. Review recommendations\n`);
});
