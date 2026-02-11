import OpenAI from 'openai';

export interface YouTubeVideoSuggestion {
  title: string;
  views: number;
  channelTitle: string;
  videoId: string;
  thumbnailUrl: string;
  publishedAt: string;
}

async function extractMainTopicWithAI(trendTitle: string, openaiKey: string): Promise<string> {
  try {
    const openai = new OpenAI({ apiKey: openaiKey });
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a search query optimizer. Extract the main topic/keyword from a news headline that would work best for YouTube search. Return ONLY 2-4 key words, no explanation.'
        },
        {
          role: 'user',
          content: `News headline: "${trendTitle}"\n\nExtract the best YouTube search keyword (2-4 words only):`
        }
      ],
      temperature: 0.3,
      max_tokens: 20
    });
    
    const keyword = response.choices[0].message.content?.trim() || trendTitle;
    return keyword;
  } catch (error) {
    console.error('Error extracting topic with AI:', error);
    // Fallback: simple extraction
    return trendTitle.split(/\s*[-|]\s*/)[0].split(/\s+/).slice(0, 4).join(' ');
  }
}

export async function getYouTubeTitleSuggestionsForShorts(
  query: string,
  youtubeApiKey: string,
  maxResults: number = 20,
  daysBack: number = 7
): Promise<YouTubeVideoSuggestion[]> {
  try {
    // Check if API key is provided
    if (!youtubeApiKey || youtubeApiKey === 'your_youtube_api_key_here') {
      console.warn('⚠️  YouTube API key not configured - skipping YouTube suggestions');
      return [];
    }

    // Calculate date N days ago
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - daysBack);
    const publishedAfter = daysAgo.toISOString();

    // Search for videos matching the query
    const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
    searchUrl.searchParams.append('part', 'snippet');
    searchUrl.searchParams.append('q', query);
    searchUrl.searchParams.append('type', 'video');
    searchUrl.searchParams.append('order', 'viewCount'); // Order by view count
    searchUrl.searchParams.append('publishedAfter', publishedAfter); // Only videos from last N days
    searchUrl.searchParams.append('maxResults', String(maxResults * 2)); // Fetch more to ensure we get enough after filtering
    searchUrl.searchParams.append('key', youtubeApiKey);
    
    console.log(`🔍 YouTube Search: "${query}" (last ${daysBack} days, top ${maxResults})`);

    const searchResponse = await fetch(searchUrl.toString());
    
    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error(`❌ YouTube API Error (${searchResponse.status}):`, errorText);
      return [];
    }

    const searchData: any = await searchResponse.json();
    
    if (!searchData.items || searchData.items.length === 0) {
      console.warn(`⚠️  No YouTube results found for query: "${query}"`);
      return [];
    }

    // Get video IDs
    const videoIds = searchData.items.map((item: any) => item.id.videoId).join(',');

    // Get video statistics (views)
    const statsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
    statsUrl.searchParams.append('part', 'statistics,snippet');
    statsUrl.searchParams.append('id', videoIds);
    statsUrl.searchParams.append('key', youtubeApiKey);

    const statsResponse = await fetch(statsUrl.toString());
    
    if (!statsResponse.ok) {
      console.error('YouTube API stats error:', await statsResponse.text());
      return [];
    }

    const statsData: any = await statsResponse.json();

    // Combine and format results
    const suggestions: YouTubeVideoSuggestion[] = statsData.items.map((item: any) => ({
      title: item.snippet.title,
      views: parseInt(item.statistics.viewCount || '0', 10),
      channelTitle: item.snippet.channelTitle,
      videoId: item.id,
      thumbnailUrl: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || '',
      publishedAt: item.snippet.publishedAt
    }));

    // Sort by views (highest first)
    suggestions.sort((a, b) => b.views - a.views);

    // Return only the requested number of results
    const topSuggestions = suggestions.slice(0, maxResults);
    
    console.log(`   ✅ Returning ${topSuggestions.length} YouTube suggestions (top: ${topSuggestions[0]?.views.toLocaleString()} views)`);
    
    return topSuggestions;
  } catch (error) {
    console.error('Error fetching YouTube suggestions:', error);
    return [];
  }
}

export async function getYouTubeTitleSuggestions(
  query: string,
  youtubeApiKey: string,
  openaiApiKey: string,
  maxResults: number = 10
): Promise<YouTubeVideoSuggestion[]> {
  try {
    // Check if API key is provided
    if (!youtubeApiKey || youtubeApiKey === 'your_youtube_api_key_here') {
      console.warn('⚠️  YouTube API key not configured - skipping YouTube suggestions');
      return [];
    }

    // Extract main topic using AI
    const searchQuery = await extractMainTopicWithAI(query, openaiApiKey);
    console.log(`🔍 AI-powered YouTube Query: "${query}" → "${searchQuery}"`);

    // Calculate date 14 days ago
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const publishedAfter = fourteenDaysAgo.toISOString();

    // Search for videos matching the query
    const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
    searchUrl.searchParams.append('part', 'snippet');
    searchUrl.searchParams.append('q', searchQuery);
    searchUrl.searchParams.append('type', 'video');
    searchUrl.searchParams.append('order', 'viewCount'); // Order by view count
    searchUrl.searchParams.append('publishedAfter', publishedAfter); // Only videos from last 14 days
    searchUrl.searchParams.append('maxResults', String(maxResults * 2)); // Fetch more to ensure we get enough after filtering
    searchUrl.searchParams.append('key', youtubeApiKey);
    
    console.log(`   📅 Filtering videos published after: ${fourteenDaysAgo.toLocaleDateString()}`);

    const searchResponse = await fetch(searchUrl.toString());
    
    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error(`❌ YouTube API Error (${searchResponse.status}):`, errorText);
      console.error('   Query:', searchQuery);
      console.error('   Check: https://console.cloud.google.com/apis/credentials');
      return [];
    }

    const searchData: any = await searchResponse.json();
    
    console.log(`📺 YouTube Search for "${searchQuery}": Found ${searchData.items?.length || 0} results`);
    
    if (!searchData.items || searchData.items.length === 0) {
      console.warn(`⚠️  No YouTube results found for query: "${searchQuery}"`);
      return [];
    }

    // Get video IDs
    const videoIds = searchData.items.map((item: any) => item.id.videoId).join(',');
    console.log(`   Fetching stats for ${searchData.items.length} videos...`);

    // Get video statistics (views)
    const statsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
    statsUrl.searchParams.append('part', 'statistics,snippet');
    statsUrl.searchParams.append('id', videoIds);
    statsUrl.searchParams.append('key', youtubeApiKey);

    const statsResponse = await fetch(statsUrl.toString());
    
    if (!statsResponse.ok) {
      console.error('YouTube API stats error:', await statsResponse.text());
      return [];
    }

    const statsData: any = await statsResponse.json();

    // Combine and format results
    const suggestions: YouTubeVideoSuggestion[] = statsData.items.map((item: any) => ({
      title: item.snippet.title,
      views: parseInt(item.statistics.viewCount || '0', 10),
      channelTitle: item.snippet.channelTitle,
      videoId: item.id,
      thumbnailUrl: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || '',
      publishedAt: item.snippet.publishedAt
    }));

    // Sort by views (highest first)
    suggestions.sort((a, b) => b.views - a.views);

    // Return only the requested number of results
    const topSuggestions = suggestions.slice(0, maxResults);
    
    console.log(`   ✅ Returning ${topSuggestions.length} YouTube suggestions (top: ${topSuggestions[0]?.views.toLocaleString()} views)`);
    
    return topSuggestions;
  } catch (error) {
    console.error('Error fetching YouTube suggestions:', error);
    return [];
  }
}
