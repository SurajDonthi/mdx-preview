import { MdxDocSample } from '../types';

export const SAMPLE_DOCUMENTS: MdxDocSample[] = [
  {
    id: 'all-in-one-showcase',
    title: '🚀 Batteries-Included MDX Showcase',
    description: 'A comprehensive MDX document showcasing frontmatter, custom React components, charts, code blocks, and layout structures.',
    category: 'Showcase',
    iconName: 'Sparkles',
    content: `---
title: "Batteries-Included MDX Studio"
description: "High-performance MDX viewer with live preview, custom React widgets, themes, and header navigation."
author: "Alex Morgan"
authorAvatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80"
date: "2026-08-01"
tags: ["MDX", "React", "Tailwind", "Interactive"]
category: "Documentation"
readTime: "4 min read"
status: "Published"
---

# Welcome to MDX Studio

MDX allows you to write **JSX directly inside your Markdown documents**. You can embed interactive React components, dynamic statistics, data visualizations, and custom alert banners seamlessly.

<Callout type="note" title="Pro Tip for Developers">
  Try switching the active theme using the top-right theme picker or test the live editor on the left pane!
</Callout>

---

## 📊 Dynamic Metrics & Analytics

Use built-in \`<StatGrid>\` and \`<Stat>\` components to show high-impact KPI summaries:

<StatGrid cols={3}>
  <Stat title="Total Visitors" value="124,850" change="+18.4%" trend="up" icon="Users" />
  <Stat title="Active Sessions" value="3,420" change="+5.2%" trend="up" icon="Activity" />
  <Stat title="Conversion Rate" value="4.82%" change="-0.3%" trend="down" icon="TrendingUp" />
</StatGrid>

---

## 📈 Interactive Charts with Recharts

You can render responsive charts directly inside MDX using the \`<Chart>\` component:

<Chart 
  type="area" 
  title="Monthly Platform Growth (2026)"
  data={[
    { name: 'Jan', value: 1200 },
    { name: 'Feb', value: 1900 },
    { name: 'Mar', value: 2400 },
    { name: 'Apr', value: 3100 },
    { name: 'May', value: 4200 },
    { name: 'Jun', value: 5800 }
  ]} 
  color="#6366f1"
/>

---

## 🧩 Grid Layouts & Custom Cards

Organize features into crisp responsive cards with \`<CardGrid>\`:

<CardGrid cols={2}>
  <Card 
    title="Live Previewing" 
    subtitle="Instant Feedback"
    icon="Eye" 
    badge="Real-time"
    description="Changes in the editor reflect instantly with syntax error boundary protection."
  />
  <Card 
    title="Header Navigation" 
    subtitle="Table of Contents"
    icon="ListOrdered" 
    badge="Mobile Ready"
    description="Automatic heading extraction with scroll-spy and mobile drawer outline."
  />
  <Card 
    title="7 Preset Themes" 
    subtitle="Styling Options"
    icon="Palette" 
    badge="Included"
    description="GitHub Light/Dark, Dracula, Nord, Cyberpunk, Forest, and Warm Editorial."
  />
  <Card 
    title="Syntax Highlighting" 
    subtitle="Prism Engine"
    icon="Code2" 
    badge="Multi-language"
    description="Beautiful syntax highlighting with one-click copy and language badges."
  />
</CardGrid>

---

## 🎛️ Interactive React State Widgets

Custom components can maintain their own internal state when rendered inside MDX:

<InteractiveCounter initial={42} min={0} max={100} step={5} title="Interactive React Counter State" />

<ProgressBar progress={82} label="Deployment Progress to Cloud Run" color="emerald" />

---

## 💻 Code Blocks & Syntax Highlighting

Here is an example of TypeScript server code with syntax highlighting:

\`\`\`typescript
import express from 'express';
import { parseFrontmatter } from './utils/mdxParser';

const app = express();

app.post('/api/parse-mdx', express.json(), (req, res) => {
  const { content } = req.body;
  const { frontmatter, body } = parseFrontmatter(content);
  
  res.json({
    success: true,
    meta: frontmatter,
    characterCount: body.length,
  });
});

app.listen(3000, () => {
  console.log('MDX Server running on port 3000');
});
\`\`\`

---

## 🧜‍♂️ Mermaid Diagrams & Architecture Flowcharts

MDX Studio natively compiles and renders live **Mermaid.js** diagrams via standard \`\`\`mermaid code blocks or \`<Mermaid chart="..." />\` JSX tags:

\`\`\`mermaid
flowchart TD
    A[✍️ Write MDX Document] --> B{Syntax Check}
    B -- Valid --> C[🎨 Live React Preview]
    B -- Invalid --> D[⚠️ Error Fallback Banner]
    C --> E[📊 Recharts & Components]
    C --> F[🧜‍♂️ Mermaid SVG Renderer]
    C --> G[📌 Table of Contents TOC]
\`\`\`

<Mermaid chart={\`sequenceDiagram
    autonumber
    actor User
    participant Editor as MDX Live Editor
    participant Engine as MDX Compiler
    participant Mermaid as Mermaid.js Engine

    User->>Editor: Type Mermaid Code Block
    Editor->>Engine: Parse MDX Body AST
    Engine->>Mermaid: Compile Diagram Definition
    Mermaid-->>Engine: SVG Vector Graphics
    Engine-->>User: Render Interactive Visual Chart
\`} />

---

## 🗂️ Tabbed Interfaces & Accordions

Organize detailed information with \`<Tabs>\` and \`<Accordion>\`:

<Tabs labels={["Overview", "Features", "Installation"]}>
  <Tab title="Overview">
    <p>MDX Studio provides a production-grade workspace for writing documentation, technical blogs, and design specs.</p>
  </Tab>
  <Tab title="Features">
    <ul>
      <li>Front matter parsing with YAML metadata banner</li>
      <li>Custom component injection with full scope passing</li>
      <li>Responsive mobile drawer for Table of Contents</li>
    </ul>
  </Tab>
  <Tab title="Installation">
    <p>Press <Kbd>Ctrl</Kbd> + <Kbd>S</Kbd> or drag & drop any <code>.mdx</code> file to get started immediately!</p>
  </Tab>
</Tabs>

<Accordion items={[
  { title: "Can I upload custom .mdx files?", content: "Yes! Use the Upload button in the navbar to load any local file." },
  { title: "Is frontmatter YAML supported?", content: "Fully supported! YAML blocks wrapped in --- will be extracted and displayed as document metadata." },
  { title: "How does mobile header navigation work?", content: "On smaller screens, a floating TOC button opens a slide-over outline for quick section jumping." }
]} />

---

## 🗺️ Product Roadmap & Timeline

<Timeline items={[
  { date: "Q1 2026", title: "Core MDX Parser Release", description: "Babel compiler integration and theme framework.", icon: "CheckCircle2" },
  { date: "Q2 2026", title: "Custom React Component Suite", description: "Recharts integration, stat cards, and interactive counters.", icon: "Sparkles" },
  { date: "Q3 2026", title: "Mobile Header Drawer & TOC", description: "Scroll spy navigation with touch-friendly drawer.", icon: "Compass" }
]} />
`,
  },
  {
    id: 'developer-docs',
    title: '📚 Developer API & Architecture Guide',
    description: 'Technical document with code samples, callouts, shortcuts, and endpoint specifications.',
    category: 'Documentation',
    iconName: 'BookOpen',
    content: `---
title: "API Platform Documentation"
description: "Complete technical integration guide for developer APIs and webhooks."
author: "DevRel Team"
date: "2026-07-15"
category: "API Reference"
tags: ["API", "REST", "SDK", "OAuth"]
status: "v2.4.0"
---

# REST API Integration Guide

Welcome to the REST API reference. Follow this guide to authenticate requests and integrate webhook listeners.

<Callout type="warning" title="Authentication Required">
  All API requests must include the <code>Authorization: Bearer &lt;YOUR_API_KEY&gt;</code> header.
</Callout>

---

## 🔑 Authentication

Generate your secret API key from the developer dashboard and pass it in request headers.

\`\`\`bash
# Example cURL request
curl -X GET "https://api.example.com/v2/users" \\
  -H "Authorization: Bearer sk_live_992381283" \\
  -H "Content-Type: application/json"
\`\`\`

---

## ⚡ Quick Keyboard Shortcuts

<Card title="Useful Developer Shortcuts">
  <div className="flex flex-wrap gap-3 my-2">
    <span>Open Search: <Kbd>Cmd</Kbd> + <Kbd>K</Kbd></span>
    <span>Save Document: <Kbd>Cmd</Kbd> + <Kbd>S</Kbd></span>
    <span>Toggle Preview: <Kbd>Ctrl</Kbd> + <Kbd>P</Kbd></span>
  </div>
</Card>

---

## 📡 Webhook Event Lifecycle

<Steps>
  <Step number={1} title="Endpoint Registration">
    Configure your public HTTPS endpoint URL in the Webhooks settings menu.
  </Step>
  <Step number={2} title="Signature Verification">
    Verify incoming payloads using HMAC SHA-256 with your endpoint secret key.
  </Step>
  <Step number={3} title="Event Processing">
    Return a 200 OK HTTP status code within 3 seconds to avoid retry backoff loops.
  </Step>
</Steps>
`,
  },
  {
    id: 'blog-post',
    title: '✍️ Editorial Blog Post & Thought Leadership',
    description: 'A blog post optimized for Warm Editorial serif theme with author metadata and storytelling.',
    category: 'Editorial',
    iconName: 'PenTool',
    content: `---
title: "The Renaissance of Component-Driven Writing"
description: "How combining Markdown with live React components is reshaping technical documentation and content editing."
author: "Elena Rostova"
authorAvatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=120&q=80"
date: "2026-07-28"
category: "Design Systems"
readTime: "5 min read"
tags: ["Writing", "UX", "MDX", "Design"]
---

# The Renaissance of Component-Driven Writing

For decades, digital authoring was strictly divided: plain text lived in simple markdown editors, while interactive experiences were buried inside custom frontend codebases.

> "When writing becomes dynamic, documentation transforms from a static reference manual into an active canvas."

---

## 🎨 Why Typography & Canvas Matter

A great reading experience rests on rhythm, measure, and typographic clarity:

<Callout type="info" title="Editorial Theme Tip">
  Switch to the **Warm Editorial** theme using the theme picker to experience classic newsprint typography!
</Callout>

### Key Pillars of Modern Technical Writing

1. **Clarity of Structure**: Headers establish a natural hierarchy.
2. **Contextual Interactivity**: Widgets sit inline right where the reader needs them.
3. **Visual Balance**: Contrast between body copy and interactive cards creates visual resting points.

---

## 📊 Reader Engagement Analysis

<Chart 
  type="line" 
  title="Reader Retention Rate Comparison" 
  data={[
    { name: 'Plain Text', value: 32 },
    { name: 'Text + Images', value: 54 },
    { name: 'Interactive MDX', value: 89 }
  ]} 
  color="#9a3412" 
/>
`,
  },
];
