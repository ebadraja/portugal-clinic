# PORTUGAL CLINIC

This workspace contains two separate apps:

| Folder | Stack | Purpose |
|--------|--------|---------|
| [`dental-website/`](./dental-website) | Astro + Tailwind | Marketing site for Clínica Dentária Nunes Monteiro |
| [`booking-app/`](./booking-app) | Next.js + Prisma | Booking / practice SaaS |

## Dental website

```bash
cd dental-website
npm install
npm run dev
```

## Booking app

```bash
cd booking-app
npm install
npm run dev
```

Each app has its own `package.json`, env files, and `public/` assets. Keep them independent.
