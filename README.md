# Hunter

A structured job-hunt workspace. People lose months and money to unstructured
job searching and miss the right opportunities as a result. Hunter does the
work — research, profiling, sorting, and kanban-style application tracking —
in a private, per-account workspace.

## Stack

- Next.js (App Router) + React + TypeScript
- Tailwind CSS
- Upstash Redis
- Framer Motion + `@dnd-kit` for the kanban board

## Setup

```bash
cp .env.example .env.local
# fill in the required values described in .env.example

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

```bash
npm run dev      # local
npm run build    # production build
npm run start    # serve build
npm run lint
```

## License

Private — for personal use. Not licensed for redistribution or reuse.
