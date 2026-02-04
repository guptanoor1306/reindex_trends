# re-indexer

Cost-efficient POC for repackaging YouTube videos against trending topics using embeddings + LLM evaluation.

## Core Hypothesis

Every successful video needs topical framing. Trending topics can be used to repackage EXISTING long-form videos ONLY IF:
1. The video transcript genuinely supports the trend angle
2. The INTRO (first ~45–90 seconds) aligns with the trend framing
3. The repackaging is honest (no misleading or "breaking news" claims)

## Architecture

**Cost Control Strategy:**
- ✅ Embeddings + vector search FIRST to narrow candidates
- ✅ LLM called ONLY on top 7 candidates per trend
- ✅ ONE single LLM call per (trend × video) - no chain-of-thought
- ✅ JSON-only responses

**Pipeline:**
1. **Ingest** - Chunk videos, generate embeddings, store in SQLite
2. **Trends** - Fetch top 20 from Google News RSS
3. **Match** - Vector search → LLM evaluation → strict filtering → output

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure OpenAI API Key

```bash
cp .env.example .env
# Edit .env and add your OpenAI API key
```

### 3. Prepare Video Data

Create `data/videos.json` with your video transcripts (see format below)

## Usage

### Complete Workflow

```bash
# Step 1: Ingest videos and generate embeddings
npm run ingest

# Step 2: Fetch current trending topics
npm run trends

# Step 3: Match trends to videos and generate recommendations
npm run match
```

### Individual Commands

```bash
# Ingest videos from custom path
npm run ingest path/to/videos.json

# Fetch trends only
npm run trends

# Run matching and output generation
npm run match
```

## Output

Results are written to:
- `out/recommendations.json` - Full recommendations in JSON format
- Console - Top 5 recommendations with details

## Acceptance Criteria (Hard-Coded)

Videos are accepted ONLY if:
- `semantic_relevance >= 0.65`
- `intro_support >= 0.70`
- `honesty_risk <= 0.30`
- `allowed == true` (from LLM)

**Philosophy: Strong rejection over false positives**

## Database Schema

SQLite database (`reindexer.db`) with:
- `videos` - Video metadata and transcripts
- `video_chunks` - Text chunks with embeddings (BLOB)
- `trends` - Trending topics
- `recommendations` - Accepted matches with packaging

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Database:** SQLite (better-sqlite3)
- **Embeddings:** OpenAI text-embedding-3-small
- **LLM:** OpenAI GPT-4o-mini (JSON mode)
- **Trends:** Google News RSS

## Cost Efficiency Notes

For 20 videos × 20 trends:
- **Embeddings:** ~50-100 chunks per video = ~1,000 chunks total (one-time cost)
- **LLM Calls:** Max 7 candidates × 20 trends = **140 LLM calls** (conservative)
- Actual calls typically lower due to vector filtering

## Project Structure

```
reindexer/
├── src/
│   ├── cli.ts          # CLI entry point
│   ├── db.ts           # SQLite database interface
│   ├── embeddings.ts   # OpenAI embeddings + cosine similarity
│   ├── ingest.ts       # Video chunking and embedding generation
│   ├── matcher.ts      # Vector search + LLM evaluation
│   ├── output.ts       # Results formatting
│   ├── trends.ts       # Google News RSS fetching
│   └── types.ts        # TypeScript interfaces
├── data/
│   └── videos.json     # Your video data (you provide)
├── out/
│   └── recommendations.json  # Generated output
├── package.json
├── tsconfig.json
└── README.md
```

## Video Data Format

See `data/videos.json` - each video requires:
- `video_id` - Unique identifier
- `title_current` - Current video title
- `transcript_full` - Complete transcript text
- `published_at` - ISO date string
- `url` - YouTube URL

The system automatically extracts `transcript_intro` from the first 700-900 characters.
