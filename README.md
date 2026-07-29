# PORTUGAL CLINIC

This workspace contains two separate apps:

| Folder | Stack | Purpose |
|--------|--------|---------|
| [`dental-website/`](./dental-website) | Astro + Tailwind | Marketing site for Clínica Dentária Nunes Monteiro |
| [`pediatric-app/`](./pediatric-app) | Next.js + Prisma | Pediatric practice SaaS (Kids 0–18 CRM) |

## Dental website

```bash
cd dental-website
npm install
npm run dev
```

## Pediatric app

```bash
cd pediatric-app
npm install
npm run dev
```

Each app has its own `package.json`, env files, and `public/` assets. Keep them independent.
