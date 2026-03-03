import { schedules } from "@trigger.dev/sdk";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import ytTranscript from "@danielxceron/youtube-transcript";
const { YoutubeTranscript } = ytTranscript;
import channelsConfig from "./channels.json";

const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    : null;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

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
  transcript: string
): Promise<string | null> {
  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `Vat de volgende YouTube-video samen in 3-5 beknopte bullet points in het Nederlands. Focus op de belangrijkste inzichten en takeaways. Gebruik het formaat "• punt".\n\nVideo: "${title}" van ${channelName}\n\nTranscript:\n${transcript}`,
        },
      ],
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
    pattern: "0 8 * * *", // Dagelijks om 08:00
    timezone: "Europe/Amsterdam",
  },
  maxDuration: 300,
  run: async () => {
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
          summary = await summarizeVideo(video.title, video.channelName, transcript);
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
