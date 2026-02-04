export interface Video {
  video_id: string;
  title_current: string;
  transcript_full: string;
  transcript_intro: string;
  published_at: string;
  url?: string;
}

export interface VideoChunk {
  video_id: string;
  chunk_id: number;
  chunk_text: string;
  embedding: number[];
}

export interface Trend {
  trend_id: string;
  title: string;
  summary: string;
  keywords: string;
  source: string;
  created_at: string;
}

export interface LLMEvaluation {
  semantic_relevance: number;
  intro_support: number;
  honesty_risk: number;
  allowed: boolean;
  titles: string[];
  thumbnails: string[];
  notes: string;
}

export interface Recommendation {
  trend_id: string;
  video_id: string;
  semantic_relevance: number;
  intro_support: number;
  honesty_risk: number;
  titles: string;
  thumbnails: string;
  notes: string;
}

export interface YouTubeVideoSuggestion {
  title: string;
  views: number;
  channelTitle: string;
  videoId: string;
}

export interface RecommendationOutput {
  trend: Trend;
  video: Video;
  scores: {
    semantic_relevance: number;
    intro_support: number;
    honesty_risk: number;
  };
  packaging: {
    titles: string[];
    thumbnails: string[];
    notes: string;
  };
}

export interface TrendRecommendations {
  trend: Trend;
  youtubeSuggestions: YouTubeVideoSuggestion[];
  matchedVideos: RecommendationOutput[];
}
