import { schedules } from "@trigger.dev/sdk";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { YoutubeTranscript } from "youtube-transcript-plus";
import channelsConfig from "./channels.json";

let supabase: ReturnType<typeof createClient> | null = null;
let anthropic: Anthropic;
let YOUTUBE_API_KEY: string;

function initClients() {
  if (!supabase && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  }
  anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY!;
}

// --- Interfaces ---

interface ChannelConfig {
  name: string;
  channelId: string;
  uploadsPlaylistId: string;
}

interface CategoryConfig {
  name: string;
  emoji: string;
  channels: ChannelConfig[];
}

interface VideoInfo {
  videoId: string;
  title: string;
  channelName: string;
  channelId: string;
  category: string;
  publishedAt: string;
  thumbnailUrl: string;
  videoUrl: string;
}

interface VideoWithSummary extends VideoInfo {
  summary: string | null;
  transcriptAvailable: boolean;
  viewCount: number;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- Laatste check tijdstip ---

async function getLastCheckTime(): Promise<Date> {
  if (supabase) {
    const { data } = await supabase
      .from("youtube_videos")
      .select("checked_at")
      .order("checked_at", { ascending: false })
      .limit(1)
      .single();

    if (data?.checked_at) return new Date(data.checked_at);
  }

  // Fallback: 24 uur geleden
  const d = new Date();
  d.setHours(d.getHours() - 24);
  return d;
}

// --- YouTube Data API v3 ---

async function fetchRecentVideos(
  channel: ChannelConfig,
  category: string,
  since: Date
): Promise<VideoInfo[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
  url.searchParams.set("part", "snippet,contentDetails");
  url.searchParams.set("playlistId", channel.uploadsPlaylistId);
  url.searchParams.set("maxResults", "10");
  url.searchParams.set("key", YOUTUBE_API_KEY!);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const videos: VideoInfo[] = [];

  for (const item of data.items || []) {
    const publishedAt = item.snippet.publishedAt;
    if (new Date(publishedAt) <= since) continue;

    videos.push({
      videoId: item.contentDetails.videoId,
      title: item.snippet.title,
      channelName: channel.name,
      channelId: channel.channelId,
      category,
      publishedAt,
      thumbnailUrl:
        item.snippet.thumbnails?.high?.url ||
        item.snippet.thumbnails?.medium?.url ||
        item.snippet.thumbnails?.default?.url ||
        "",
      videoUrl: `https://www.youtube.com/watch?v=${item.contentDetails.videoId}`,
    });
  }

  return videos;
}

// --- Transcript ophalen ---

async function fetchTranscript(videoId: string): Promise<string | null> {
  // Volgorde: auto-detect (werkt het best), dan NL, dan EN
  const attempts = [
    () => YoutubeTranscript.fetchTranscript(videoId),
    () => YoutubeTranscript.fetchTranscript(videoId, { lang: "nl" }),
    () => YoutubeTranscript.fetchTranscript(videoId, { lang: "en" }),
  ];

  for (const attempt of attempts) {
    try {
      const transcript = await attempt();
      if (!transcript || transcript.length === 0) continue;

      let fullText = transcript.map((t: any) => t.text).join(" ");
      if (fullText.length > 15000) {
        fullText = fullText.substring(0, 15000) + "...";
      }
      if (fullText.length > 0) return fullText;
    } catch {
      continue;
    }
  }

  return null;
}

// --- Claude AI samenvatting ---

async function summarizeVideo(
  title: string,
  channelName: string,
  transcript: string,
  category: string = ""
): Promise<string | null> {
  try {
    const isEnglish = ["Crypto", "Tech & AI", "Gezondheid", "Podcasts", "Economie"].includes(category);
    const prompt = isEnglish
      ? `Summarize the following YouTube video in 3-5 concise bullet points in English. Focus on the key insights and takeaways. Use the format "• point".\n\nVideo: "${title}" by ${channelName}\n\nTranscript:\n${transcript}`
      : `Vat de volgende YouTube-video samen in 3-5 beknopte bullet points in het Nederlands. Focus op de belangrijkste inzichten en takeaways. Gebruik het formaat "• punt".\n\nVideo: "${title}" van ${channelName}\n\nTranscript:\n${transcript}`;

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    return textBlock ? (textBlock as { type: "text"; text: string }).text : null;
  } catch (err) {
    console.error(`Samenvatting mislukt voor "${title}":`, err instanceof Error ? err.message : err);
    return null;
  }
}

// --- View counts ophalen ---

async function fetchViewCounts(videoIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  // YouTube API accepteert max 50 IDs per request
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "statistics");
    url.searchParams.set("id", batch.join(","));
    url.searchParams.set("key", YOUTUBE_API_KEY!);

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error(`View counts API ${res.status}: ${(await res.text()).slice(0, 200)}`);
      continue;
    }

    const data = await res.json();
    for (const item of data.items || []) {
      counts.set(item.id, parseInt(item.statistics.viewCount || "0", 10));
    }
    if (i + 50 < videoIds.length) await delay(200);
  }
  return counts;
}

// --- View counts updaten voor recente video's ---

async function updateRecentViewCounts(): Promise<number> {
  if (!supabase) return 0;

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const { data: recentVideos } = await supabase
    .from("youtube_videos")
    .select("video_id")
    .gte("published_at", weekAgo.toISOString());

  if (!recentVideos || recentVideos.length === 0) return 0;

  const videoIds = recentVideos.map((v: any) => v.video_id);
  const counts = await fetchViewCounts(videoIds);

  let updated = 0;
  for (const [videoId, viewCount] of counts) {
    const { error } = await supabase
      .from("youtube_videos")
      .update({ view_count: viewCount })
      .eq("video_id", videoId);

    if (!error) updated++;
  }

  console.log(`View counts bijgewerkt voor ${updated}/${videoIds.length} recente video's`);
  return updated;
}

// --- Category Briefing Config ---

interface BriefingConfig {
  category: string;
  briefingTable: string;
  yearlyTable: string;
  weeklyPrompt: (summaries: string) => string;
  yearlyPrompt: (summaries: string) => string;
}

const BRIEFING_CONFIGS: BriefingConfig[] = [
  {
    category: "Crypto",
    briefingTable: "crypto_briefings",
    yearlyTable: "crypto_yearly_overview",
    weeklyPrompt: (videoSummaries) => `You are a crypto market analyst. Below are summaries of recent crypto podcasts from the past week.

Analyze all summaries and create a structured briefing. Identify the 3-7 most important topics discussed across multiple podcasts or that are particularly relevant.

Focus on FUNDAMENTAL developments: regulation, technology, institutional adoption, infrastructure, and industry events. Do NOT focus on price action, trading patterns, or short-term market movements.

For each topic:
1. Give a short, catchy title (max 10 words)
2. Write a clear paragraph (3-5 sentences) explaining what's going on
3. Indicate which podcasts discussed this topic (use the exact video_id's from the data)
4. Add context from your own knowledge: is what the podcasters say accurate? Are they missing something? Are there counterarguments?
5. Give a sentiment indicator: "bullish", "bearish", or "neutral"

Also write an overarching "market mood" paragraph of 2-3 sentences summarizing the general tone.

IMPORTANT: Respond ONLY with valid JSON (no markdown code fences) in exactly this format:
{
  "overview": "Overarching market mood paragraph here...",
  "topics": [
    {
      "topic": "Short catchy title",
      "summary": "Clear paragraph about what's going on...",
      "sentiment": "bullish",
      "source_video_ids": ["video_id_1", "video_id_2"],
      "news_context": "What your own knowledge adds: verification, nuance, missing context..."
    }
  ]
}

--- PODCAST SUMMARIES ---

${videoSummaries}`,
    yearlyPrompt: (briefingSummaries) => `You are a senior crypto analyst writing a comprehensive 12-month overview of the most important FUNDAMENTAL developments in cryptocurrency and blockchain.

You have two sources of information:
1. Weekly briefings from crypto podcasts (provided below) — use these as primary source where available
2. Your own knowledge of crypto events from the past 12 months — use this to fill gaps and add context

Focus EXCLUSIVELY on fundamentals. Include:
- Regulation: ETF approvals, legal frameworks, government stances, enforcement actions
- Technology: Layer 2 scaling, protocol upgrades (e.g. Ethereum Dencun), new consensus mechanisms
- Institutional adoption: Corporate treasuries, bank integrations, payment processors
- Infrastructure: Stablecoin growth, DeFi milestones, cross-chain bridges
- Industry events: Exchange collapses, major hacks, mergers & acquisitions, key personnel changes

Do NOT include: price predictions, trading patterns, short-term market movements, or speculation.

Identify the 5-10 most significant developments. For each:
1. Give a clear, descriptive title (max 10 words)
2. Write a thorough paragraph (4-6 sentences) explaining what happened and why it matters
3. Rate significance: "high" (industry-changing) or "medium" (notable development)
4. Add your analysis: what are the long-term implications?

Also write an overarching summary paragraph (3-4 sentences) of the major themes shaping crypto over the past year.

IMPORTANT: Respond ONLY with valid JSON (no markdown code fences) in exactly this format:
{
  "overview": "Overarching summary of major themes...",
  "topics": [
    {
      "topic": "Short descriptive title",
      "summary": "Thorough paragraph about what happened and why it matters...",
      "significance": "high",
      "analysis": "Long-term implications and your assessment..."
    }
  ]
}

--- WEEKLY BRIEFINGS (if available) ---

${briefingSummaries || "No weekly briefings available yet. Use your own knowledge to compile the overview."}`,
  },
  {
    category: "Tech & AI",
    briefingTable: "ai_briefings",
    yearlyTable: "ai_yearly_overview",
    weeklyPrompt: (videoSummaries) => `You are a tech and AI industry analyst. Below are summaries of recent tech/AI YouTube channels from the past week.

Analyze all summaries and create a structured briefing. Identify the 3-7 most important topics discussed across multiple channels or that are particularly relevant.

Focus on FUNDAMENTAL developments: new model releases, framework updates, developer tooling breakthroughs, AI agent developments, startup launches, open-source milestones, and industry shifts. Do NOT focus on hype, speculation, or superficial product demos.

For each topic:
1. Give a short, catchy title (max 10 words)
2. Write a clear paragraph (3-5 sentences) explaining what's going on
3. Indicate which channels discussed this topic (use the exact video_id's from the data)
4. Add context from your own knowledge: is what the creators say accurate? Are they missing something? Are there counterarguments?
5. Give a sentiment indicator: "bullish", "bearish", or "neutral"

Also write an overarching "industry mood" paragraph of 2-3 sentences summarizing the general tone.

IMPORTANT: Respond ONLY with valid JSON (no markdown code fences) in exactly this format:
{
  "overview": "Overarching industry mood paragraph here...",
  "topics": [
    {
      "topic": "Short catchy title",
      "summary": "Clear paragraph about what's going on...",
      "sentiment": "bullish",
      "source_video_ids": ["video_id_1", "video_id_2"],
      "news_context": "What your own knowledge adds: verification, nuance, missing context..."
    }
  ]
}

--- VIDEO SUMMARIES ---

${videoSummaries}`,
    yearlyPrompt: (briefingSummaries) => `You are a senior technology analyst writing a comprehensive 12-month overview of the most important FUNDAMENTAL developments in AI, developer tools, and the tech industry.

You have two sources of information:
1. Weekly briefings from tech/AI YouTube channels (provided below) — use these as primary source where available
2. Your own knowledge of tech/AI events from the past 12 months — use this to fill gaps and add context

Focus EXCLUSIVELY on fundamentals. Include:
- Model releases: Major LLM launches (GPT-4o, Claude 3.5/4, Gemini, Llama, etc.), capability breakthroughs
- Developer tools: New frameworks, IDEs, coding assistants, deployment platforms
- AI agents: Autonomous agent frameworks, multi-agent systems, tool use advances
- Open source: Major open-source releases, community milestones, licensing changes
- Industry shifts: Acquisitions, funding rounds, company pivots, regulatory developments
- Infrastructure: GPU availability, cloud AI services, edge AI, training innovations

Do NOT include: hype cycles, speculation about AGI timelines, or superficial product comparisons.

Identify the 5-10 most significant developments. For each:
1. Give a clear, descriptive title (max 10 words)
2. Write a thorough paragraph (4-6 sentences) explaining what happened and why it matters
3. Rate significance: "high" (industry-changing) or "medium" (notable development)
4. Add your analysis: what are the long-term implications?

Also write an overarching summary paragraph (3-4 sentences) of the major themes shaping tech/AI over the past year.

IMPORTANT: Respond ONLY with valid JSON (no markdown code fences) in exactly this format:
{
  "overview": "Overarching summary of major themes...",
  "topics": [
    {
      "topic": "Short descriptive title",
      "summary": "Thorough paragraph about what happened and why it matters...",
      "significance": "high",
      "analysis": "Long-term implications and your assessment..."
    }
  ]
}

--- WEEKLY BRIEFINGS (if available) ---

${briefingSummaries || "No weekly briefings available yet. Use your own knowledge to compile the overview."}`,
  },
  {
    category: "Gezondheid",
    briefingTable: "gezondheid_briefings",
    yearlyTable: "gezondheid_yearly_overview",
    weeklyPrompt: (videoSummaries) => `You are a health science and longevity analyst. Below are summaries of recent health-focused YouTube channels from the past week.

Analyze all summaries and create a structured briefing. Identify the 3-7 most important topics discussed across multiple channels or that are particularly relevant.

Focus on EVIDENCE-BASED developments: neuroscience protocols, longevity research, supplement science, sleep optimization, exercise physiology, biomarker tracking, and biohacking innovations. Do NOT focus on anecdotal claims, unverified hacks, or product promotions without scientific backing.

For each topic:
1. Give a short, catchy title (max 10 words)
2. Write a clear paragraph (3-5 sentences) explaining what's going on
3. Indicate which channels discussed this topic (use the exact video_id's from the data)
4. Add context from your own knowledge: is what the creators say backed by peer-reviewed research? Are they oversimplifying? Are there risks or counterarguments?
5. Give a sentiment indicator: "bullish", "bearish", or "neutral"

Also write an overarching "health science mood" paragraph of 2-3 sentences summarizing the general tone and themes.

IMPORTANT: Respond ONLY with valid JSON (no markdown code fences) in exactly this format:
{
  "overview": "Overarching health science mood paragraph here...",
  "topics": [
    {
      "topic": "Short catchy title",
      "summary": "Clear paragraph about what's going on...",
      "sentiment": "bullish",
      "source_video_ids": ["video_id_1", "video_id_2"],
      "news_context": "What your own knowledge adds: verification, nuance, missing context..."
    }
  ]
}

--- VIDEO SUMMARIES ---

${videoSummaries}`,
    yearlyPrompt: (briefingSummaries) => `You are a senior health science analyst writing a comprehensive 12-month overview of the most important developments in health optimization, longevity research, and biohacking.

You have two sources of information:
1. Weekly briefings from health-focused YouTube channels (provided below) — use these as primary source where available
2. Your own knowledge of health science developments from the past 12 months — use this to fill gaps and add context

Focus EXCLUSIVELY on evidence-based developments. Include:
- Neuroscience: Sleep protocols, dopamine management, stress optimization, cognitive enhancement
- Longevity: Aging biomarkers, caloric restriction research, senolytic therapies, NAD+ pathways
- Exercise physiology: Training protocols, recovery science, cardiovascular health findings
- Nutrition: Supplement research updates, gut microbiome discoveries, metabolic health
- Biohacking: Wearable tech advances, blood testing innovations, light therapy, cold/heat exposure research
- Clinical research: Major study results, meta-analyses, guideline changes

Do NOT include: unverified health claims, influencer product promotions, or anecdotal protocols without research backing.

Identify the 5-10 most significant developments. For each:
1. Give a clear, descriptive title (max 10 words)
2. Write a thorough paragraph (4-6 sentences) explaining what happened and why it matters
3. Rate significance: "high" (field-changing) or "medium" (notable development)
4. Add your analysis: what are the long-term implications?

Also write an overarching summary paragraph (3-4 sentences) of the major themes shaping health science over the past year.

IMPORTANT: Respond ONLY with valid JSON (no markdown code fences) in exactly this format:
{
  "overview": "Overarching summary of major themes...",
  "topics": [
    {
      "topic": "Short descriptive title",
      "summary": "Thorough paragraph about what happened and why it matters...",
      "significance": "high",
      "analysis": "Long-term implications and your assessment..."
    }
  ]
}

--- WEEKLY BRIEFINGS (if available) ---

${briefingSummaries || "No weekly briefings available yet. Use your own knowledge to compile the overview."}`,
  },
  {
    category: "Podcasts",
    briefingTable: "podcasts_briefings",
    yearlyTable: "podcasts_yearly_overview",
    weeklyPrompt: (videoSummaries) => `You are a cultural commentary and interview analyst. Below are summaries of recent podcast episodes from the past week.

Analyze all summaries and create a structured briefing. Identify the 3-7 most important topics, guest insights, or cultural themes discussed across episodes or that are particularly thought-provoking.

Focus on SUBSTANTIVE content: notable guest revelations, contrarian viewpoints, cultural shifts, entrepreneurship insights, psychological frameworks, and societal observations. Do NOT focus on entertainment gossip, clickbait moments, or superficial celebrity content.

For each topic:
1. Give a short, catchy title (max 10 words)
2. Write a clear paragraph (3-5 sentences) explaining the key insight or discussion
3. Indicate which episodes discussed this topic (use the exact video_id's from the data)
4. Add context from your own knowledge: is the guest's perspective well-founded? Are there important counterpoints or nuances they missed?
5. Give a sentiment indicator: "bullish", "bearish", or "neutral"

Also write an overarching "podcast landscape" paragraph of 2-3 sentences summarizing the general themes and tone.

IMPORTANT: Respond ONLY with valid JSON (no markdown code fences) in exactly this format:
{
  "overview": "Overarching podcast landscape paragraph here...",
  "topics": [
    {
      "topic": "Short catchy title",
      "summary": "Clear paragraph about what's going on...",
      "sentiment": "bullish",
      "source_video_ids": ["video_id_1", "video_id_2"],
      "news_context": "What your own knowledge adds: verification, nuance, missing context..."
    }
  ]
}

--- VIDEO SUMMARIES ---

${videoSummaries}`,
    yearlyPrompt: (briefingSummaries) => `You are a senior media analyst writing a comprehensive 12-month overview of the most important themes, guest insights, and cultural discussions from long-form podcast interviews.

You have two sources of information:
1. Weekly briefings from podcast channels (provided below) — use these as primary source where available
2. Your own knowledge of major cultural and intellectual discussions from the past 12 months — use this to fill gaps and add context

Focus EXCLUSIVELY on substantive content. Include:
- Guest insights: Breakthrough ideas, personal revelations, or expert perspectives that shaped discourse
- Cultural commentary: Free speech debates, identity politics, media criticism, societal trends
- Entrepreneurship: Business lessons, startup wisdom, career frameworks shared by guests
- Psychology & self-improvement: Mental health discussions, behavioral science, habit formation
- Contrarian viewpoints: Important challenges to mainstream narratives, heterodox thinking
- Interviews of note: Particularly impactful or viral conversations that shaped public discourse

Do NOT include: entertainment gossip, superficial celebrity moments, or clickbait controversies.

Identify the 5-10 most significant themes or discussions. For each:
1. Give a clear, descriptive title (max 10 words)
2. Write a thorough paragraph (4-6 sentences) explaining the theme and why it matters
3. Rate significance: "high" (discourse-shaping) or "medium" (notable discussion)
4. Add your analysis: what are the long-term cultural implications?

Also write an overarching summary paragraph (3-4 sentences) of the major themes in the podcast landscape over the past year.

IMPORTANT: Respond ONLY with valid JSON (no markdown code fences) in exactly this format:
{
  "overview": "Overarching summary of major themes...",
  "topics": [
    {
      "topic": "Short descriptive title",
      "summary": "Thorough paragraph about what happened and why it matters...",
      "significance": "high",
      "analysis": "Long-term implications and your assessment..."
    }
  ]
}

--- WEEKLY BRIEFINGS (if available) ---

${briefingSummaries || "No weekly briefings available yet. Use your own knowledge to compile the overview."}`,
  },
  {
    category: "Nieuws",
    briefingTable: "nieuws_briefings",
    yearlyTable: "nieuws_yearly_overview",
    weeklyPrompt: (videoSummaries) => `Je bent een Nederlandse nieuwsanalist. Hieronder staan samenvattingen van recente nieuwsvideo's van de afgelopen week.

Analyseer alle samenvattingen en maak een gestructureerde briefing. Identificeer de 3-7 belangrijkste onderwerpen die besproken zijn.

Focus op FUNDAMENTELE ontwikkelingen: geopolitiek, Nederlandse politiek, economisch beleid, mediakritiek, maatschappelijke verschuivingen en wereldgebeurtenissen. Focus NIET op sensatie, complottheorieen zonder onderbouwing, of oppervlakkige meningen.

Per onderwerp:
1. Geef een korte, pakkende titel (max 10 woorden)
2. Schrijf een duidelijke paragraaf (3-5 zinnen) over wat er speelt
3. Geef aan welke video's dit onderwerp bespraken (gebruik de exacte video_id's uit de data)
4. Voeg context toe vanuit je eigen kennis: klopt wat er gezegd wordt? Missen ze iets? Zijn er tegenargumenten?
5. Geef een sentiment-indicator: "bullish", "bearish", of "neutral"

Schrijf ook een overkoepelende "nieuwsstemming" paragraaf van 2-3 zinnen over de algemene toon.

BELANGRIJK: Antwoord ALLEEN met geldige JSON (geen markdown code fences) in exact dit formaat:
{
  "overview": "Overkoepelende nieuwsstemming paragraaf hier...",
  "topics": [
    {
      "topic": "Korte pakkende titel",
      "summary": "Duidelijke paragraaf over wat er speelt...",
      "sentiment": "bullish",
      "source_video_ids": ["video_id_1", "video_id_2"],
      "news_context": "Wat je eigen kennis toevoegt: verificatie, nuance, ontbrekende context..."
    }
  ]
}

--- VIDEO SAMENVATTINGEN ---

${videoSummaries}`,
    yearlyPrompt: (briefingSummaries) => `Je bent een senior nieuwsanalist die een uitgebreid 12-maanden overzicht schrijft van de belangrijkste ontwikkelingen in het Nederlandse en wereldnieuws.

Je hebt twee informatiebronnen:
1. Wekelijkse briefings van nieuwskanalen (hieronder) — gebruik deze als primaire bron waar beschikbaar
2. Je eigen kennis van nieuwsgebeurtenissen van de afgelopen 12 maanden — gebruik dit om gaten te vullen en context toe te voegen

Focus UITSLUITEND op fundamentele ontwikkelingen. Inclusief:
- Geopolitiek: Internationale conflicten, diplomatieke verschuivingen, handelsoorlogen, machtsblokken
- Nederlandse politiek: Kabinetsbeleid, verkiezingen, coalitiedynamiek, controversiele wetgeving
- Economisch beleid: Inflatie, ECB-beleid, woningmarkt, energietransitie
- Mediakritiek: Mainstream vs alternatieve media, censuurdebatten, journalistieke integriteit
- Maatschappij: Migratiedebatten, culturele verschuivingen, protestbewegingen
- Technologie & privacy: Digitalisering overheid, AI-regulering, surveillancediscussies

Identificeer de 5-10 meest significante ontwikkelingen. Per onderwerp:
1. Geef een duidelijke, beschrijvende titel (max 10 woorden)
2. Schrijf een grondige paragraaf (4-6 zinnen) over wat er gebeurde en waarom het ertoe doet
3. Beoordeel significantie: "high" (maatschappijveranderend) of "medium" (noemenswaardige ontwikkeling)
4. Voeg je analyse toe: wat zijn de langetermijngevolgen?

Schrijf ook een overkoepelende samenvattingsparagraaf (3-4 zinnen) van de grote thema's van het afgelopen jaar.

BELANGRIJK: Antwoord ALLEEN met geldige JSON (geen markdown code fences) in exact dit formaat:
{
  "overview": "Overkoepelende samenvatting van grote thema's...",
  "topics": [
    {
      "topic": "Korte beschrijvende titel",
      "summary": "Grondige paragraaf over wat er gebeurde en waarom het ertoe doet...",
      "significance": "high",
      "analysis": "Langetermijngevolgen en je beoordeling..."
    }
  ]
}

--- WEKELIJKSE BRIEFINGS (indien beschikbaar) ---

${briefingSummaries || "Nog geen wekelijkse briefings beschikbaar. Gebruik je eigen kennis om het overzicht samen te stellen."}`,
  },
  {
    category: "Economie",
    briefingTable: "economie_briefings",
    yearlyTable: "economie_yearly_overview",
    weeklyPrompt: (videoSummaries) => `You are a macroeconomics analyst. Below are summaries of recent economics-focused YouTube channels from the past week.

Analyze all summaries and create a structured briefing. Identify the 3-7 most important topics discussed across multiple channels or that are particularly relevant.

Focus on FUNDAMENTAL developments: macroeconomic trends, central bank policy, housing markets, wealth inequality, labor markets, fiscal policy, and structural economic shifts. Do NOT focus on stock tips, day-trading strategies, or short-term market noise.

For each topic:
1. Give a short, catchy title (max 10 words)
2. Write a clear paragraph (3-5 sentences) explaining what's going on
3. Indicate which channels discussed this topic (use the exact video_id's from the data)
4. Add context from your own knowledge: is what the creators say backed by economic data? Are they oversimplifying complex dynamics? Are there counterarguments from other schools of economic thought?
5. Give a sentiment indicator: "bullish", "bearish", or "neutral"

Also write an overarching "economic outlook" paragraph of 2-3 sentences summarizing the general tone and themes.

IMPORTANT: Respond ONLY with valid JSON (no markdown code fences) in exactly this format:
{
  "overview": "Overarching economic outlook paragraph here...",
  "topics": [
    {
      "topic": "Short catchy title",
      "summary": "Clear paragraph about what's going on...",
      "sentiment": "bullish",
      "source_video_ids": ["video_id_1", "video_id_2"],
      "news_context": "What your own knowledge adds: verification, nuance, missing context..."
    }
  ]
}

--- VIDEO SUMMARIES ---

${videoSummaries}`,
    yearlyPrompt: (briefingSummaries) => `You are a senior macroeconomics analyst writing a comprehensive 12-month overview of the most important economic developments, policy shifts, and structural trends.

You have two sources of information:
1. Weekly briefings from economics YouTube channels (provided below) — use these as primary source where available
2. Your own knowledge of economic events from the past 12 months — use this to fill gaps and add context

Focus EXCLUSIVELY on fundamentals. Include:
- Central bank policy: Interest rate decisions, quantitative tightening/easing, forward guidance shifts
- Housing markets: Affordability crises, mortgage rate impacts, construction trends, policy interventions
- Wealth inequality: Wealth concentration data, wage stagnation, cost-of-living developments
- Labor markets: Employment trends, remote work shifts, automation impacts, gig economy evolution
- Fiscal policy: Government spending, taxation changes, debt levels, stimulus programs
- Structural shifts: De-globalization, energy transition economics, demographic challenges, trade realignments

Do NOT include: stock picks, day-trading advice, or short-term market speculation.

Identify the 5-10 most significant developments. For each:
1. Give a clear, descriptive title (max 10 words)
2. Write a thorough paragraph (4-6 sentences) explaining what happened and why it matters
3. Rate significance: "high" (economy-changing) or "medium" (notable development)
4. Add your analysis: what are the long-term implications?

Also write an overarching summary paragraph (3-4 sentences) of the major economic themes over the past year.

IMPORTANT: Respond ONLY with valid JSON (no markdown code fences) in exactly this format:
{
  "overview": "Overarching summary of major themes...",
  "topics": [
    {
      "topic": "Short descriptive title",
      "summary": "Thorough paragraph about what happened and why it matters...",
      "significance": "high",
      "analysis": "Long-term implications and your assessment..."
    }
  ]
}

--- WEEKLY BRIEFINGS (if available) ---

${briefingSummaries || "No weekly briefings available yet. Use your own knowledge to compile the overview."}`,
  },
];

// --- Generic Briefing + Yearly Overview ---

function parseJsonResponse(text: string): any {
  let jsonText = text.trim();
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }
  return JSON.parse(jsonText);
}

async function generateCategoryBriefing(config: BriefingConfig): Promise<void> {
  if (!supabase) return;

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const { data: recentVideos } = await supabase
    .from("youtube_videos")
    .select("video_id, video_title, video_url, channel_name, summary, published_at")
    .eq("category", config.category)
    .eq("transcript_available", true)
    .not("summary", "is", null)
    .gte("published_at", weekAgo.toISOString())
    .order("published_at", { ascending: false });

  if (!recentVideos || recentVideos.length === 0) {
    console.log(`No ${config.category} summaries found for briefing`);
    return;
  }

  console.log(`${config.category} briefing: ${recentVideos.length} videos...`);

  const videoSummaries = recentVideos
    .map((v: any) => `[${v.channel_name}] "${v.video_title}" (video_id: ${v.video_id})\n${v.summary}`)
    .join("\n\n---\n\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    messages: [{ role: "user", content: config.weeklyPrompt(videoSummaries) }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    console.error(`No text in ${config.category} briefing response`);
    return;
  }

  let briefing: any;
  try {
    briefing = parseJsonResponse(textBlock.text);
  } catch {
    console.error(`${config.category} briefing JSON parse failed:`, textBlock.text.slice(0, 200));
    return;
  }

  // Enrich source_video_ids with full video info
  const videoMap = new Map(recentVideos.map((v: any) => [v.video_id, v]));
  for (const topic of briefing.topics) {
    topic.sources = (topic.source_video_ids || [])
      .map((id: string) => videoMap.get(id))
      .filter(Boolean)
      .map((v: any) => ({
        video_id: v.video_id,
        video_title: v.video_title,
        channel_name: v.channel_name,
        video_url: v.video_url,
      }));
    delete topic.source_video_ids;
  }

  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from(config.briefingTable).upsert(
    {
      briefing_date: today,
      overview: briefing.overview,
      topics: briefing.topics,
      videos_used: recentVideos.length,
      channels_used: [...new Set(recentVideos.map((v: any) => v.channel_name))],
    },
    { onConflict: "briefing_date" }
  );

  if (error) {
    console.error(`${config.category} briefing save failed:`, error);
  } else {
    console.log(`${config.category} briefing saved (${briefing.topics.length} topics)`);
  }
}

async function generateCategoryYearlyOverview(config: BriefingConfig): Promise<void> {
  if (!supabase) return;

  // Check if last yearly overview is recent enough (< 30 days)
  const { data: existing } = await supabase
    .from(config.yearlyTable)
    .select("generated_at")
    .order("generated_at", { ascending: false })
    .limit(1)
    .single();

  if (existing?.generated_at) {
    const daysSince = (Date.now() - new Date(existing.generated_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 30) {
      console.log(`${config.category} yearly overview is ${Math.floor(daysSince)} days old, skipping`);
      return;
    }
  }

  const yearAgo = new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);

  const { data: briefings } = await supabase
    .from(config.briefingTable)
    .select("briefing_date, overview, topics")
    .gte("briefing_date", yearAgo.toISOString().slice(0, 10))
    .order("briefing_date", { ascending: false });

  const briefingSummaries = (briefings || [])
    .map((b: any) => {
      const topicSummary = (b.topics || [])
        .map((t: any) => `- ${t.topic}: ${t.summary}`)
        .join("\n");
      return `[${b.briefing_date}]\n${b.overview}\n${topicSummary}`;
    })
    .join("\n\n---\n\n");

  console.log(`${config.category} yearly overview: ${(briefings || []).length} briefings...`);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: config.yearlyPrompt(briefingSummaries) }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    console.error(`No text in ${config.category} yearly overview response`);
    return;
  }

  let overview: any;
  try {
    overview = parseJsonResponse(textBlock.text);
  } catch {
    console.error(`${config.category} yearly overview JSON parse failed:`, textBlock.text.slice(0, 200));
    return;
  }

  const { error } = await supabase.from(config.yearlyTable).insert({
    overview: overview.overview,
    topics: overview.topics,
    briefings_used: (briefings || []).length,
  });

  if (error) {
    console.error(`${config.category} yearly overview save failed:`, error);
  } else {
    console.log(`${config.category} yearly overview saved (${overview.topics.length} topics)`);
  }
}

// --- Supabase opslag ---

async function saveToSupabase(videos: VideoWithSummary[]): Promise<void> {
  if (!supabase || videos.length === 0) return;

  const rows = videos.map((v) => ({
    channel_name: v.channelName,
    channel_id: v.channelId,
    category: v.category,
    video_id: v.videoId,
    video_title: v.title,
    video_url: v.videoUrl,
    published_at: v.publishedAt,
    thumbnail_url: v.thumbnailUrl,
    transcript_available: v.transcriptAvailable,
    summary: v.summary,
    view_count: v.viewCount,
    checked_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("youtube_videos")
    .upsert(rows, { onConflict: "video_id" });

  if (error) {
    console.error("Supabase upsert mislukt:", error);
  } else {
    console.log(`${rows.length} video's opgeslagen in Supabase`);
  }
}

// --- Scheduled task ---

export const youtubeMonitor = schedules.task({
  id: "youtube-monitor",
  cron: {
    pattern: "0 8 * * 1", // Weekly on Monday at 08:00
    timezone: "Europe/Amsterdam",
  },
  maxDuration: 300,
  run: async () => {
    initClients();
    console.log("YouTube Monitor gestart");

    if (!YOUTUBE_API_KEY) {
      throw new Error("YOUTUBE_API_KEY niet geconfigureerd");
    }

    const lastCheck = await getLastCheckTime();
    console.log(`Laatste check: ${lastCheck.toISOString()}`);

    const categories = channelsConfig.categories as CategoryConfig[];
    const videosByCategory = new Map<string, VideoWithSummary[]>();
    let totalNewVideos = 0;
    const errors: string[] = [];

    for (const category of categories) {
      const categoryVideos: VideoInfo[] = [];

      for (const channel of category.channels) {
        try {
          console.log(`Checking: ${channel.name} (${category.name})`);
          const videos = await fetchRecentVideos(channel, category.name, lastCheck);
          categoryVideos.push(...videos);
          console.log(`  → ${videos.length} nieuwe video's`);
          await delay(200);
        } catch (err) {
          const msg = `${channel.name}: ${err instanceof Error ? err.message : String(err)}`;
          console.error(`  FOUT: ${msg}`);
          errors.push(msg);
        }
      }

      const videosWithSummaries: VideoWithSummary[] = [];

      for (const video of categoryVideos) {
        console.log(`  Transcript ophalen: "${video.title}"`);
        const transcript = await fetchTranscript(video.videoId);
        const transcriptAvailable = transcript !== null;

        let summary: string | null = null;
        if (transcript) {
          console.log(`  Samenvatting genereren...`);
          summary = await summarizeVideo(video.title, video.channelName, transcript, video.category);
          await delay(500);
        }

        videosWithSummaries.push({ ...video, summary, transcriptAvailable, viewCount: 0 });
      }

      videosByCategory.set(category.name, videosWithSummaries);
      totalNewVideos += videosWithSummaries.length;
    }

    // View counts ophalen voor nieuwe video's
    const allVideos = Array.from(videosByCategory.values()).flat();
    if (allVideos.length > 0) {
      const viewCounts = await fetchViewCounts(allVideos.map((v) => v.videoId));
      for (const v of allVideos) {
        v.viewCount = viewCounts.get(v.videoId) || 0;
      }
    }

    // Opslaan in Supabase
    await saveToSupabase(allVideos);

    // View counts updaten voor alle video's van afgelopen week
    const viewsUpdated = await updateRecentViewCounts();

    // Generate briefings + yearly overviews for configured categories
    for (const config of BRIEFING_CONFIGS) {
      const catVideos = videosByCategory.get(config.category) || [];
      if (catVideos.length > 0) {
        try {
          await generateCategoryBriefing(config);
        } catch (err) {
          console.error(`${config.category} briefing failed:`, err instanceof Error ? err.message : err);
        }
      }
      try {
        await generateCategoryYearlyOverview(config);
      } catch (err) {
        console.error(`${config.category} yearly overview failed:`, err instanceof Error ? err.message : err);
      }
    }

    console.log(`${totalNewVideos} nieuwe video('s) opgeslagen, ${viewsUpdated} view counts bijgewerkt`);

    if (errors.length > 0) {
      console.warn(`${errors.length} fouten opgetreden:`, errors);
    }

    return {
      channelsChecked: categories.reduce((sum, c) => sum + c.channels.length, 0),
      newVideos: totalNewVideos,
      errors: errors.length,
    };
  },
});
