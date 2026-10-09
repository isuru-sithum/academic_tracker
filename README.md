# Folio — a record of your study

A personal academic progress tracker. Log courses, textbooks, papers, and novels in one place, track progress with counters, chapter/page trackers, and checklists, and pick up exactly where you left off — on any device.

**Live site:** https://folio-academic-tracker.vercel.app/

No account needed to look around — click **View demo** on the sign-in screen for a walkthrough with sample data.

---

## What it does

- Add any kind of academic work — course, textbook, novel, paper, or custom — and track it your own way:
  - **Counters** for things with a running total (videos watched, problem sets done, exams sat)
  - **Progress trackers** for sequential things (chapter, page)
  - **Checklists** for simple to-dos tied to a piece of work
- Everything is editable inline — titles, labels, next-item text, totals — no forms to dig through
- Courses you finish automatically sink to the bottom of the list, out of your way
- Reorder your work manually with the up/down controls
- A dashboard header shows total items, completion rate, and a running streak of active days
- Export/import a full JSON backup at any time, independent of the backend

## How it's built

A single static HTML/CSS/JS file — no build step, no framework, no server code to run.

- **Hosting:** [Vercel](https://vercel.com) (static deploy straight from this repo)
- **Auth + data:** [Supabase](https://supabase.com)
  - Passwordless email (magic link) sign-in
  - A single Postgres table (`folio_data`) storing each user's tracker as one JSON document
  - Row Level Security policies so a signed-in user can only ever read or write their own row
- **Demo mode:** a hard-coded sample dataset that runs entirely in memory — no sign-in, and nothing typed while browsing it is ever saved

## Running your own copy

1. Create a free project at [supabase.com](https://supabase.com).
2. In the SQL Editor, run:

   ```sql
   create table folio_data (
     user_id uuid primary key references auth.users(id) on delete cascade,
     data jsonb not null default '[]'::jsonb,
     updated_at timestamptz not null default now()
   );
   alter table folio_data enable row level security;
   create policy "select own" on folio_data for select using (auth.uid() = user_id);
   create policy "insert own" on folio_data for insert with check (auth.uid() = user_id);
   create policy "update own" on folio_data for update using (auth.uid() = user_id);
   ```

3. In `index.html`, set `SUPABASE_URL` and `SUPABASE_ANON_KEY` (found under **Project Settings → API**) to your own project's values.
4. In Supabase, under **Authentication → URL Configuration**, set the Site URL and Redirect URLs to wherever you deploy this.
5. Deploy the file as a static site — Vercel, Netlify, GitHub Pages, or any static host will work.

## Data & privacy

Each user's tracker lives in its own database row, isolated by Supabase's Row Level Security — no one else can read or write it, including other signed-in users. Demo mode never touches the database at all.

---

Built by [Isuru Sithum](https://github.com/isuru-sithum).
