# Calnix

A team calendar for organizations. Add tasks, events, tools and prompts, and AI writes a description and draws a cover image for each one. Teams can see each other's work on a shared calendar and chat in team channels, groups and direct messages.

## How it works

| Area | Choice |
| --- | --- |
| App | Next.js 16 and TypeScript |
| Sign-in, database, live updates | Supabase Auth, Postgres, Realtime |
| Image storage | Private Supabase Storage bucket |
| Descriptions | OpenAI `gpt-6-luna` |
| Images | OpenAI `gpt-image-2` |

**Adding an item:** the item is saved straight away and appears on the calendar. In the background, OpenAI writes a description and an image brief, then creates the image from that brief. The server uploads the image to Supabase Storage and saves the result, and it appears for everyone without a reload. If only the image fails, the description is still kept.

The item's title, details, link, dates and prompt text are sent to OpenAI.

**Viewing an image:** the bucket stays private. `/api/items/:id/image` checks that the viewer may see the item, then redirects to a signed link that expires after an hour.

**Who can do what** (enforced in the database, in `supabase/migrations`):

| | Team member | Other team, same organization | Organization admin |
| --- | --- | --- | --- |
| See the team's items, including personal ones | Yes | No | Yes |
| Edit team items | Yes | No | Yes |
| Edit a personal item | Only their own | No | Yes |
| Delete an item | Only their own | No | Yes |

Direct messages and groups can only be read by the people in them, and that includes admins.

## Set up

You need Node.js 22 or later, a Supabase project and an [OpenAI API key](https://platform.openai.com/api-keys).

### 1. Install

```bash
npm install
cp .env.example .env.local
```

### 2. Supabase

```bash
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase db push
```

Then, in the Supabase dashboard:

1. Copy the project URL, publishable key and secret key into `.env.local`.
2. Under **Authentication > URL Configuration**, set the site URL and add `https://YOUR-DOMAIN/auth/callback` to the redirect URLs. For local work, add `http://localhost:3000/auth/callback`.
3. Under **Authentication > Emails**, set up your own SMTP provider before going live. Supabase's built-in email service is limited to a few messages an hour, which can block sign-ups.

`db push` also creates the private `item-images` bucket, so there is nothing to set up for storage. Images count toward your Supabase plan's storage and bandwidth limits.

### 3. OpenAI

Add `OPENAI_API_KEY` to `.env.local`. The account needs API credit. OpenAI may also ask you to complete [organization verification](https://platform.openai.com/settings/organization/general) before it allows image generation.

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000, create an account and start an organization. To invite people, send them the code from the **Team** page.

## Deploying

The app runs on any Node.js host. Set the variables from `.env.example`, and set `NEXT_PUBLIC_SITE_URL` to your public address.

AI work runs after the response is sent, so the host has to keep the request alive until it finishes. The routes ask for up to 300 seconds. If your host allows less, AI requests can be cut off, and those items will offer **Try again** after five minutes.

## AI costs

Each item makes one text request and one image request, and **Create new image** repeats both.

- **Description:** usually well under $0.001 with `gpt-6-luna`. Output is capped at 800 tokens at $0.50 per million.
- **Image:** about $0.005 for `gpt-image-2` at low quality and 1536x1024, plus a tiny charge for the brief.

These are the cheapest models that aren't due to shut down soon. `gpt-5-nano` costs slightly less for text but shuts down on December 11, 2026, and `gpt-image-1-mini` shuts down on December 1, 2026 and costs more at this size.

Each person can start 30 generations an hour, which you can change with `AI_HOURLY_LIMIT_PER_USER`. To change models, set `OPENAI_TEXT_MODEL` or `OPENAI_IMAGE_MODEL`. To change image quality, edit `IMAGE_QUALITY` in `src/lib/ai.ts`.

## Tests

```bash
npm test                # Calendar layout and dates

# Database access rules, using real users. Needs Docker and a local Supabase.
npx supabase start
npm run test:access     # Reads .env.local, and refuses anything but a local database
```

For `test:access`, point `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` in `.env.local` at the values printed by `npx supabase status`.

## Known limits

- Times are shown exactly as entered, with no time zone conversion, so a team across time zones should state the zone in the event details.
- The week starts on Sunday (`WEEK_START` in `src/lib/dates.ts`).
- Chat shows the latest 200 messages in a conversation.
- Group members are chosen when the group is created and can't be changed later.
- Teams can't be deleted from the app.
