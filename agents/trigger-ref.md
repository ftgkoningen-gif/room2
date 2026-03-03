# Trigger.dev Reference — agents/

SDK v4 reference afgestemd op dit project. Alle tasks gebruiken `@trigger.dev/sdk`.

---

## Project Setup

```
agents/
├── trigger.config.ts          # Trigger.dev config (project ID, retries, dirs)
├── package.json               # Dependencies + scripts
├── test-run.ts                # Lokaal testen zonder Trigger.dev
├── .env                       # API keys (niet committen)
└── src/trigger/
    ├── youtube-monitor.ts     # Scheduled task
    ├── price-checker.ts       # Scheduled task
    ├── channels.json          # YouTube kanalen config
    └── products.json          # Producten config
```

### trigger.config.ts

```ts
import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "proj_llcuhswwizyxayqonshm",
  dirs: ["./src/trigger"],
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  maxDuration: 3600,
});
```

### Scripts

```bash
# Ontwikkelen (live reload)
pnpm dev:trigger

# Deployen naar Trigger.dev cloud
pnpm deploy:trigger

# Lokaal testen (zonder Trigger.dev)
node --env-file=.env --import tsx test-run.ts              # price-checker
node --env-file=.env --import tsx test-run.ts --youtube     # youtube-monitor
```

### Environment Variables (.env)

```
YOUTUBE_API_KEY=...          # YouTube Data API v3
ANTHROPIC_API_KEY=...        # Claude AI (samenvattingen)
RESEND_API_KEY=...           # Resend (e-mail)
SUPABASE_URL=...             # Supabase project URL
SUPABASE_SERVICE_KEY=...     # Supabase service role key
EMAIL_TO=koningen@proton.me  # Ontvanger
EMAIL_FROM=onboarding@resend.dev
```

---

## Scheduled Task (Cron)

Het primaire patroon in dit project. Beide bestaande tasks zijn scheduled.

```ts
import { schedules } from "@trigger.dev/sdk";

export const myTask = schedules.task({
  id: "my-task",
  cron: {
    pattern: "0 8 * * *",        // 08:00 dagelijks
    timezone: "Europe/Amsterdam", // Nederlandse tijdzone
  },
  maxDuration: 300, // seconden — overschrijft global config

  run: async () => {
    // task logic
    return { status: "done" };
  },
});
```

Veelgebruikte cron patronen:
- `"*/30 * * * *"` — elke 30 minuten
- `"0 * * * *"` — elk uur
- `"0 */8 * * *"` — elke 8 uur
- `"0 8 * * *"` — dagelijks om 08:00
- `"30 20 * * 0"` — zondag 20:30
- `"0 8 * * 1"` — maandag 08:00

> Gebruik altijd `timezone: "Europe/Amsterdam"` voor Nederlandse tijden.

---

## Basic Task

Standalone task zonder schedule. Bruikbaar als processor in orchestrator+processor patroon.

```ts
import { task } from "@trigger.dev/sdk";

export const processItem = task({
  id: "process-item",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 30_000,
  },
  run: async (payload: { id: string; data: any }) => {
    // Zware logica: API calls, LLM, verwerking
    return { processed: payload.id };
  },
});
```

---

## Schema Task (Zod validatie)

Payload wordt automatisch gevalideerd voor `run()` wordt aangeroepen.

```ts
import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";

export const validatedTask = schemaTask({
  id: "validated-task",
  schema: z.object({
    name: z.string(),
    videoId: z.string(),
    publishedAt: z.string(),
  }),
  run: async (payload) => {
    // payload is fully typed + validated
    return { message: `Processing ${payload.name}` };
  },
});
```

---

## JSON Config Imports

Data-driven configuratie via JSON bestanden.

```ts
// Direct importeren — tsconfig moet "resolveJsonModule": true hebben
import channelsConfig from "./channels.json";
import products from "./products.json";

// Typeren met interface
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

// Gebruik in task
const categories = channelsConfig.categories as CategoryConfig[];
for (const category of categories) {
  for (const channel of category.channels) {
    // ...
  }
}
```

> JSON config maakt het makkelijk om nieuwe kanalen/producten toe te voegen zonder code te wijzigen.

---

## Supabase Integration

Beide tasks gebruiken Supabase voor opslag.

### Client initialisatie

```ts
import { createClient } from "@supabase/supabase-js";

// Null-safe init — task werkt ook zonder Supabase (graceful degradation)
const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    : null;
```

### Upsert patroon

```ts
// YouTube videos — conflict op video_id
const { error } = await supabase
  .from("youtube_videos")
  .upsert(rows, { onConflict: "video_id" });

// Prijzen — conflict op samengestelde key
const { error } = await supabase
  .from("price_checks")
  .upsert(rows, { onConflict: "year,week_number,product_name,supermarket" });

if (error) {
  console.error("Supabase upsert mislukt:", error);
} else {
  console.log(`${rows.length} rijen opgeslagen`);
}
```

### Laatste check ophalen

```ts
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
```

---

## Claude AI Samenvatting

```ts
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function summarize(title: string, channel: string, transcript: string): Promise<string | null> {
  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `Vat de volgende YouTube-video samen in 3-5 beknopte bullet points in het Nederlands.\n\nVideo: "${title}" van ${channel}\n\nTranscript:\n${transcript}`,
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    return textBlock ? (textBlock as { type: "text"; text: string }).text : null;
  } catch (err) {
    console.error(`Samenvatting mislukt:`, err instanceof Error ? err.message : err);
    return null; // graceful degradation
  }
}
```

---

## Resend E-mail

```ts
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// Versturen
const emailTo = process.env.EMAIL_TO || "koningen@proton.me";
const emailFrom = process.env.EMAIL_FROM || "onboarding@resend.dev";

const { data, error } = await resend.emails.send({
  from: `Task Name <${emailFrom}>`,
  to: [emailTo],
  subject: "Onderwerp",
  html: emailHtml,
});

if (error) {
  console.error("E-mail mislukt:", error);
  throw new Error(`Email failed: ${error.message}`);
}
console.log(`E-mail verstuurd, id: ${data?.id}`);
```

---

## Rate Limiting

```ts
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Gebruik in loops om API throttling te voorkomen
for (const channel of channels) {
  const videos = await fetchRecentVideos(channel);
  await delay(200); // 200ms tussen YouTube API calls
}

// Jumbo vereist langere delay
await delay(1500); // 1.5s tussen Jumbo requests
```

---

## Error Handling

Patroon: try-catch per API call, fouten verzamelen, task laat niet crashen.

```ts
const errors: string[] = [];

for (const channel of channels) {
  try {
    const videos = await fetchRecentVideos(channel);
    // verwerk...
  } catch (err) {
    const msg = `${channel.name}: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`FOUT: ${msg}`);
    errors.push(msg);
    // Door naar volgende channel — task stopt niet
  }
}

// Aan het eind: rapporteer fouten
if (errors.length > 0) {
  console.warn(`${errors.length} fouten opgetreden:`, errors);
}

return {
  processed: results.length,
  errors: errors.length,
};
```

---

## Triggering vanuit een Task

Voor het opsplitsen van taken (orchestrator roept processor aan).

```ts
import { task } from "@trigger.dev/sdk";

// Fire and forget — wacht niet op resultaat
await processItem.trigger({ id: "abc", data: item });

// Trigger and wait — returns Result object, NIET de raw output
const result = await processItem.triggerAndWait({ id: "abc", data: item });
if (result.ok) {
  console.log("Output:", result.output);
} else {
  console.error("Mislukt:", result.error);
}

// Unwrap shorthand — gooit error bij failure
const output = await processItem.triggerAndWait({ id: "abc", data: item }).unwrap();

// Batch trigger and wait
const results = await processItem.batchTriggerAndWait([
  { payload: { id: "1", data: item1 } },
  { payload: { id: "2", data: item2 } },
]);
```

> **Nooit** `triggerAndWait`, `batchTriggerAndWait`, of `wait.*` in `Promise.all` wrappen —
> wordt niet ondersteund en geeft onverwacht gedrag.

---

## Idempotency Keys

Voorkom dubbele verwerking, cruciaal bij polling (bijv. YouTube monitor die dezelfde video twee keer ziet).

```ts
await processVideo.trigger(
  { videoId: "abc123", title: "My Video" },
  {
    idempotencyKey: `video-abc123`, // zelfde key = zelfde run, geen duplicaat
  }
);
```

Gebruik idempotency keys wanneer hetzelfde item meerdere keren getriggerd kan worden — bijv. bij
scheduled tasks die een feed pollen en een item in twee opeenvolgende windows kan voorkomen.

---

## Orchestrator + Processor Patroon

Natuurlijke evolutie van de huidige tasks: schedule pollt, processor verwerkt per item.

```ts
// orchestrator.ts — draait op schedule, lichtgewicht
import { schedules } from "@trigger.dev/sdk";
import { processItem } from "./process-item.js"; // let op: .js extensie vereist

export const checkTask = schedules.task({
  id: "check-new-items",
  cron: {
    pattern: "0 */8 * * *",
    timezone: "Europe/Amsterdam",
  },

  run: async () => {
    const items = await fetchNewItems();
    for (const item of items) {
      await processItem.trigger(
        { id: item.id, data: item },
        { idempotencyKey: `item-${item.id}` } // voorkom duplicaten
      );
    }
    return { dispatched: items.length };
  },
});

// process-item.ts — verwerkt elk item apart (kan parallel draaien)
import { task } from "@trigger.dev/sdk";

export const processItem = task({
  id: "process-item",
  run: async (payload: { id: string; data: any }) => {
    // Zware logica: API calls, LLM, email, opslag
    return { processed: payload.id };
  },
});
```

---

## Retry Configuration

Globale retries staan in `trigger.config.ts`. Per task overschrijven:

```ts
export const resilientTask = task({
  id: "resilient-task",
  retry: {
    maxAttempts: 10,
    factor: 1.8,          // exponential backoff multiplier
    minTimeoutInMs: 500,
    maxTimeoutInMs: 30_000,
    randomize: false,
  },
  run: async (payload) => {
    // Als dit gooit, retry Trigger.dev automatisch
    return { done: true };
  },
});
```

---

## Lokaal Testen

`test-run.ts` draait dezelfde logica buiten Trigger.dev om.

```bash
# Vereist .env bestand in agents/
node --env-file=.env --import tsx test-run.ts              # price-checker
node --env-file=.env --import tsx test-run.ts --youtube     # youtube-monitor
```

Kenmerken:
- Hergebruikt alle logica uit de task-bestanden
- YouTube test kijkt 48 uur terug (productie: 24 uur)
- Logt gedetailleerde output voor debugging
- Stuurt e-mail met "(TEST)" in het onderwerp
- Slaat op in dezelfde Supabase tabellen

---

## NOOIT Gebruiken (v2 syntax)

```ts
// ❌ Dit is Trigger.dev v2 — NIET GEBRUIKEN
client.defineJob({
  id: "job-id",
  run: async (payload, io) => { /* ... */ },
});
```

Altijd `task()`, `schedules.task()`, of `schemaTask()` uit `@trigger.dev/sdk`.
