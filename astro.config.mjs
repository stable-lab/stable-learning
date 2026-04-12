// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// https://astro.build/config
export default defineConfig({
	markdown: {
		remarkPlugins: [remarkMath],
		rehypePlugins: [rehypeKatex],
	},
	integrations: [
		starlight({
			title: 'Stable Learning',
			description: 'Multi-domain learning materials for the lab',
			components: {
				Footer: './src/components/starlight/Footer.astro',
			},
			customCss: [
				'./src/styles/custom.css',
				'katex/dist/katex.min.css',
			],
			sidebar: [
				{
					label: 'Reinforcement Learning',
					items: [
						{ label: 'Action Chain & Rewards', autogenerate: { directory: 'rl/01-action-chain-rewards' } },
						{ label: 'Policy Gradient', autogenerate: { directory: 'rl/02-policy-gradient' } },
						{ label: 'PPO', autogenerate: { directory: 'rl/03-ppo' } },
						{ label: 'GRPO', autogenerate: { directory: 'rl/04-grpo' } },
					],
				},
				{
					label: 'Cache Coherence & Consistency',
					items: [
						{ label: 'Cache Fundamentals', autogenerate: { directory: 'cache/01-fundamentals' } },
						{ label: 'Coherence Protocols', autogenerate: { directory: 'cache/02-coherence-protocols' } },
						{ label: 'Consistency Models', autogenerate: { directory: 'cache/03-consistency-models' } },
						{ label: 'Modern Systems', autogenerate: { directory: 'cache/04-modern-systems' } },
					],
				},
			],
		}),
		react(),
	],
});
