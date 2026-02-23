# CLAUDE.md — My Frontend Website Rules (Adapted from Nate Herk + Official frontend-design skill)

## Always Do First
- Invoke the `frontend-design` skill before writing any frontend code, every session (if the skill is installed and available).
- Think step-by-step: purpose, audience, tone, bold aesthetic direction, then code.

## Reference Images & Comparisons
- If reference provided: Match layout, spacing, typography, colors exactly. Use placeholders (`https://placehold.co/`) only if no real assets.
- Screenshot output (localhost), compare precisely (e.g., "padding is 32px vs reference 24px"), fix, re-screenshot (2+ rounds minimum).
- Do NOT improve or add unless asked.

## Local Server & Screenshots
- Serve on localhost (preferably port 3000). Use VS Code Live Server, `npx serve`, `npx http-server`, or any dev server you have.
- For screenshots: Manually take one of http://localhost:3000 (or describe if automated not set up) and share for comparison.
- Avoid hardcoded Puppeteer paths or user-specific temp folders. If debugging Puppeteer issues, ask me first.
- Save screenshots to ./screenshots/ or temporary folder if script exists; otherwise note expected visual outcome.

## Output Defaults
- Prefer single `index.html` with inline styles unless specified otherwise.
- Use Tailwind CSS via CDN: `<script src="https://cdn.tailwindcss.com"></script>`
- Mobile-first, responsive.
- Placeholder images: `https://placehold.co/WIDTHxHEIGHT`

## Brand Assets
- Always check `brand_assets/` folder first. Use real logos/colors/images if present — never invent or placeholder when real assets exist.

## Anti-Generic Guardrails (Inspired by frontend-design skill)
- **Typography**: Pair distinctive display font (e.g., something characterful via Google Fonts) with clean body font. Avoid generic defaults (Arial, Inter, system-ui).
- **Colors**: Commit to cohesive palette; derive accents from primary brand color (ask if none given). Avoid overused purple/blue gradients or default Tailwind.
- **Shadows & Depth**: Layered, tinted, subtle grain/noise over flat `shadow-md`.
- **Motion**: CSS-only where possible; focus on impactful load reveals, hovers. Use spring easing, avoid `transition-all`.
- **Layout**: Asymmetry, overlap, generous space or controlled density when it fits aesthetic.
- **States**: Always add hover, focus-visible, active for interactive elements.
- **General**: Make intentional, memorable choices — brutalist, retro, luxury, organic, etc. Vary per project. No cookie-cutter.

## Hard Rules
- Match reference exactly — do not add sections/features/content.
- Do not "improve" unless user explicitly asks.
- Do not use default Tailwind primary colors (indigo/blue).
- Stop only when comparisons show near-perfect match or user approves.

## Git & Deployment – Local-first regel

1. Alle voorgestelde wijzigingen eerst lokaal maken + tonen (code diff + localhost screenshot)
2. Pas na mijn expliciete zin zoals "push" / "akkoord" mag je:
   - commit maken
   - pushen naar GitHub
3. Nooit zelf pushen zonder duidelijke goedkeuring