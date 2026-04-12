# Stable Learning

Multi-domain learning materials for the lab, built with [Astro Starlight](https://starlight.astro.build/).

## Domains

| Domain | Topics |
|--------|--------|
| **Reinforcement Learning** | Action chains & rewards, Policy gradient (log trick derivation), PPO (clipped surrogate, GAE), GRPO |
| **Cache Coherence & Consistency** | Memory hierarchy, Cache organization, MSI/MESI/MOESI protocols, Sequential consistency, TSO, Relaxed models, Directory protocols, Memory fences |

## Getting Started

```bash
# Install dependencies
npm install

# Development server (localhost:4321)
npm run dev

# Production build + preview (enables search)
npm run build && npm run preview
```

## Adding Content

1. Create an `.mdx` file under `src/content/docs/<domain>/<section>/`
2. Add frontmatter:
   ```yaml
   ---
   title: Page Title
   description: Short description
   sidebar:
     order: 0
   ---
   ```
3. The page appears in the sidebar automatically (via `autogenerate` in `astro.config.mjs`)

### Math

Inline: `$\pi_\theta(a \mid s)$` — Display:

```
$$
\nabla_\theta J(\theta) = \mathbb{E}_\tau \left[ \sum_t \nabla_\theta \log \pi_\theta(a_t \mid s_t) \cdot G_t \right]
$$
```

### Interactive Visualizations

React components live in `src/components/visualizations/`. Import in MDX:

```mdx
import MyViz from '../../../../components/visualizations/MyViz';

<MyViz client:visible />
```

Use `client:visible` for pure React components, `client:only="react"` for Plotly-based ones (Plotly can't SSR).

## Adding a New Domain

1. Create directories: `src/content/docs/<domain>/<sections>/`
2. Add a sidebar group in `astro.config.mjs`:
   ```js
   {
     label: 'New Domain',
     items: [
       { label: 'Section 1', autogenerate: { directory: '<domain>/01-section' } },
     ],
   },
   ```
3. Add cards to `src/content/docs/index.mdx`

## Project Structure

```
src/
├── content/docs/
│   ├── index.mdx              # Landing page
│   ├── rl/                    # Reinforcement Learning
│   │   ├── 01-action-chain-rewards/
│   │   ├── 02-policy-gradient/
│   │   ├── 03-ppo/
│   │   └── 04-grpo/
│   └── cache/                 # Cache Coherence & Consistency
│       ├── 01-fundamentals/
│       ├── 02-coherence-protocols/
│       ├── 03-consistency-models/
│       └── 04-modern-systems/
├── components/
│   ├── visualizations/        # React interactive components
│   └── starlight/             # Starlight component overrides (Footer)
└── styles/
    └── custom.css
```

## Stack

- **Astro 6** + **Starlight 0.38** — static site with sidebar, search, dark mode
- **MDX** — Markdown with component imports
- **KaTeX** — math rendering (remark-math + rehype-katex)
- **React 19** + **Plotly.js** — interactive visualizations via Astro Islands
