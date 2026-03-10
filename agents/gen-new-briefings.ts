import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const configs = [
  {
    category: "Gezondheid",
    briefingTable: "gezondheid_briefings",
    yearlyTable: "gezondheid_yearly_overview",
    weeklyPrompt: (vs: string) => `You are a health science and longevity analyst. Below are summaries of recent health-focused YouTube channels from the past week.

Analyze all summaries and create a structured briefing. Identify the 3-7 most important topics discussed across multiple channels or that are particularly relevant.

Focus on EVIDENCE-BASED developments: neuroscience protocols, longevity research, supplement science, sleep optimization, exercise physiology, biomarker tracking, and biohacking innovations. Do NOT focus on anecdotal claims, unverified hacks, or product promotions without scientific backing.

For each topic:
1. Give a short, catchy title (max 10 words)
2. Write a clear paragraph (3-5 sentences) explaining what's going on
3. Indicate which channels discussed this topic (use the exact video_id's from the data)
4. Add context from your own knowledge: is what the creators say backed by peer-reviewed research? Are they oversimplifying? Are there risks or counterarguments?
5. Give a sentiment indicator: "bullish", "bearish", or "neutral"

Also write an overarching "health science mood" paragraph of 2-3 sentences.

IMPORTANT: Respond ONLY with valid JSON (no markdown code fences) in exactly this format:
{
  "overview": "Overarching mood paragraph...",
  "topics": [{ "topic": "Title", "summary": "...", "sentiment": "bullish", "source_video_ids": ["id1"], "news_context": "..." }]
}

--- VIDEO SUMMARIES ---

${vs}`,
    yearlyPrompt: (bs: string) => `You are a senior health science analyst writing a comprehensive 12-month overview of the most important developments in health optimization, longevity research, and biohacking.

You have two sources: 1) Weekly briefings (below) 2) Your own knowledge of the past 12 months.

Focus on: Neuroscience, Longevity, Exercise physiology, Nutrition, Biohacking, Clinical research.

Identify 5-10 most significant developments. For each: title (max 10 words), thorough paragraph (4-6 sentences), significance ("high"/"medium"), analysis of long-term implications.

IMPORTANT: Respond ONLY with valid JSON (no markdown code fences):
{ "overview": "...", "topics": [{ "topic": "Title", "summary": "...", "significance": "high", "analysis": "..." }] }

--- WEEKLY BRIEFINGS ---

${bs || "No weekly briefings available yet. Use your own knowledge."}`,
  },
  {
    category: "Podcasts",
    briefingTable: "podcasts_briefings",
    yearlyTable: "podcasts_yearly_overview",
    weeklyPrompt: (vs: string) => `You are a cultural commentary and interview analyst. Below are summaries of recent podcast episodes from the past week.

Analyze all summaries and create a structured briefing. Identify the 3-7 most important topics, guest insights, or cultural themes discussed.

Focus on SUBSTANTIVE content: notable guest revelations, contrarian viewpoints, cultural shifts, entrepreneurship insights, psychological frameworks. Do NOT focus on entertainment gossip or clickbait.

For each topic:
1. Give a short, catchy title (max 10 words)
2. Write a clear paragraph (3-5 sentences)
3. Indicate which episodes discussed this (use exact video_id's)
4. Add context from your own knowledge
5. Give a sentiment indicator: "bullish", "bearish", or "neutral"

Also write an overarching "podcast landscape" paragraph of 2-3 sentences.

IMPORTANT: Respond ONLY with valid JSON (no markdown code fences):
{
  "overview": "...",
  "topics": [{ "topic": "Title", "summary": "...", "sentiment": "bullish", "source_video_ids": ["id1"], "news_context": "..." }]
}

--- VIDEO SUMMARIES ---

${vs}`,
    yearlyPrompt: (bs: string) => `You are a senior media analyst writing a comprehensive 12-month overview of the most important themes and cultural discussions from long-form podcast interviews.

You have two sources: 1) Weekly briefings (below) 2) Your own knowledge of the past 12 months.

Focus on: Guest insights, Cultural commentary, Entrepreneurship, Psychology, Contrarian viewpoints.

Identify 5-10 most significant themes. For each: title, thorough paragraph, significance ("high"/"medium"), analysis.

IMPORTANT: Respond ONLY with valid JSON (no markdown code fences):
{ "overview": "...", "topics": [{ "topic": "Title", "summary": "...", "significance": "high", "analysis": "..." }] }

--- WEEKLY BRIEFINGS ---

${bs || "No weekly briefings available yet. Use your own knowledge."}`,
  },
  {
    category: "Nieuws",
    briefingTable: "nieuws_briefings",
    yearlyTable: "nieuws_yearly_overview",
    weeklyPrompt: (vs: string) => `Je bent een Nederlandse nieuwsanalist. Hieronder staan samenvattingen van recente nieuwsvideo's van de afgelopen week.

Analyseer alle samenvattingen en maak een gestructureerde briefing. Identificeer de 3-7 belangrijkste onderwerpen.

Focus op FUNDAMENTELE ontwikkelingen: geopolitiek, Nederlandse politiek, economisch beleid, mediakritiek, maatschappelijke verschuivingen. Focus NIET op sensatie of complottheorieen zonder onderbouwing.

Per onderwerp:
1. Korte, pakkende titel (max 10 woorden)
2. Duidelijke paragraaf (3-5 zinnen)
3. Welke video's dit bespraken (exacte video_id's)
4. Context vanuit je eigen kennis
5. Sentiment-indicator: "bullish", "bearish", of "neutral"

Overkoepelende "nieuwsstemming" paragraaf van 2-3 zinnen.

BELANGRIJK: Antwoord ALLEEN met geldige JSON (geen markdown code fences):
{
  "overview": "...",
  "topics": [{ "topic": "Titel", "summary": "...", "sentiment": "bullish", "source_video_ids": ["id1"], "news_context": "..." }]
}

--- VIDEO SAMENVATTINGEN ---

${vs}`,
    yearlyPrompt: (bs: string) => `Je bent een senior nieuwsanalist die een 12-maanden overzicht schrijft van de belangrijkste ontwikkelingen in het Nederlandse en wereldnieuws.

Bronnen: 1) Wekelijkse briefings (hieronder) 2) Je eigen kennis van de afgelopen 12 maanden.

Focus op: Geopolitiek, Nederlandse politiek, Economisch beleid, Mediakritiek, Maatschappij.

Identificeer 5-10 meest significante ontwikkelingen. Per onderwerp: titel, grondige paragraaf, significantie ("high"/"medium"), analyse.

BELANGRIJK: Antwoord ALLEEN met geldige JSON (geen markdown code fences):
{ "overview": "...", "topics": [{ "topic": "Titel", "summary": "...", "significance": "high", "analysis": "..." }] }

--- WEKELIJKSE BRIEFINGS ---

${bs || "Nog geen wekelijkse briefings beschikbaar. Gebruik je eigen kennis."}`,
  },
  {
    category: "Economie",
    briefingTable: "economie_briefings",
    yearlyTable: "economie_yearly_overview",
    weeklyPrompt: (vs: string) => `You are a macroeconomics analyst. Below are summaries of recent economics-focused YouTube channels from the past week.

Analyze all summaries and create a structured briefing. Identify the 3-7 most important topics discussed.

Focus on FUNDAMENTAL developments: macroeconomic trends, central bank policy, housing markets, wealth inequality, labor markets, fiscal policy. Do NOT focus on stock tips or day-trading.

For each topic:
1. Give a short, catchy title (max 10 words)
2. Write a clear paragraph (3-5 sentences)
3. Indicate which channels discussed this (use exact video_id's)
4. Add context from your own knowledge
5. Give a sentiment indicator: "bullish", "bearish", or "neutral"

Also write an overarching "economic outlook" paragraph of 2-3 sentences.

IMPORTANT: Respond ONLY with valid JSON (no markdown code fences):
{
  "overview": "...",
  "topics": [{ "topic": "Title", "summary": "...", "sentiment": "bullish", "source_video_ids": ["id1"], "news_context": "..." }]
}

--- VIDEO SUMMARIES ---

${vs}`,
    yearlyPrompt: (bs: string) => `You are a senior macroeconomics analyst writing a comprehensive 12-month overview of the most important economic developments, policy shifts, and structural trends.

You have two sources: 1) Weekly briefings (below) 2) Your own knowledge of the past 12 months.

Focus on: Central bank policy, Housing markets, Wealth inequality, Labor markets, Fiscal policy, Structural shifts.

Identify 5-10 most significant developments. For each: title, thorough paragraph, significance ("high"/"medium"), analysis.

IMPORTANT: Respond ONLY with valid JSON (no markdown code fences):
{ "overview": "...", "topics": [{ "topic": "Title", "summary": "...", "significance": "high", "analysis": "..." }] }

--- WEEKLY BRIEFINGS ---

${bs || "No weekly briefings available yet. Use your own knowledge."}`,
  },
];

async function main() {
  for (const config of configs) {
    // --- Weekly briefing ---
    console.log(`\n=== ${config.category} Weekly Briefing ===`);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const { data: catVideos } = await supabase
      .from("youtube_videos")
      .select("video_id, video_title, video_url, channel_name, summary, published_at")
      .eq("category", config.category)
      .eq("transcript_available", true)
      .not("summary", "is", null)
      .gte("published_at", weekAgo.toISOString())
      .order("published_at", { ascending: false });

    if (catVideos && catVideos.length > 0) {
      console.log(`${catVideos.length} summaries found`);

      const videoSummaries = catVideos
        .map((v: any) => `[${v.channel_name}] "${v.video_title}" (video_id: ${v.video_id})\n${v.summary}`)
        .join("\n\n---\n\n");

      try {
        const resp = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2048,
          messages: [{ role: "user", content: config.weeklyPrompt(videoSummaries) }],
        });

        const textBlock = resp.content.find((b) => b.type === "text");
        if (textBlock && textBlock.type === "text") {
          let jsonText = textBlock.text.trim();
          if (jsonText.startsWith("```")) {
            jsonText = jsonText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
          }
          const briefing = JSON.parse(jsonText);

          const videoMap = new Map(catVideos.map((v: any) => [v.video_id, v]));
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

          for (const t of briefing.topics) {
            const icon = t.sentiment === "bullish" ? "🟢" : t.sentiment === "bearish" ? "🔴" : "🟡";
            console.log(`${icon} ${t.topic}`);
          }

          const today = new Date().toISOString().slice(0, 10);
          const { error } = await supabase.from(config.briefingTable).upsert(
            {
              briefing_date: today,
              overview: briefing.overview,
              topics: briefing.topics,
              videos_used: catVideos.length,
              channels_used: [...new Set(catVideos.map((v: any) => v.channel_name))],
            },
            { onConflict: "briefing_date" }
          );
          if (error) console.error(`${config.category} briefing save error:`, error);
          else console.log(`✅ ${config.category} briefing saved`);
        }
      } catch (err) {
        console.error(`${config.category} briefing error:`, err instanceof Error ? err.message : String(err));
      }
    } else {
      console.log(`No recent summaries for ${config.category}`);
    }

    // --- Yearly overview ---
    console.log(`\n=== ${config.category} Yearly Overview ===`);

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

    console.log(`${(briefings || []).length} briefings as context`);

    try {
      const resp = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [{ role: "user", content: config.yearlyPrompt(briefingSummaries) }],
      });

      const textBlock = resp.content.find((b) => b.type === "text");
      if (textBlock && textBlock.type === "text") {
        let jsonText = textBlock.text.trim();
        if (jsonText.startsWith("```")) {
          jsonText = jsonText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
        }
        const overview = JSON.parse(jsonText);

        for (const t of overview.topics) {
          const badge = t.significance === "high" ? "🔴" : "🟡";
          console.log(`${badge} ${t.topic}`);
        }

        const { error } = await supabase.from(config.yearlyTable).insert({
          overview: overview.overview,
          topics: overview.topics,
          briefings_used: (briefings || []).length,
        });
        if (error) console.error(`${config.category} yearly save error:`, error);
        else console.log(`✅ ${config.category} yearly overview saved`);
      }
    } catch (err) {
      console.error(`${config.category} yearly error:`, err instanceof Error ? err.message : String(err));
    }
  }

  console.log("\n🎉 Done! All 4 categories processed.");
}

main();
