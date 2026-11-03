# BoomLog

Spray records, from the office to the cab.

BoomLog plans a pesticide application, sends it to the applicator's phone, and keeps
the finished job as an application record you can file. It's built for row-crop
operations that have to produce a record per field per application — in Texas, the
TDA format the reports export in.

- **Office** (desktop) — write tickets, keep the field and chemical libraries, pull reports.
- **Cab** (phone) — the queued jobs, the mix sheet, and a field list the applicator marks off as they spray. Works with no signal and syncs when it comes back.
- **Gate** (public, no login) — a QR poster anyone can scan to see which fields are under a restricted-entry interval right now.

## Using it

Every farm is its own organization. Sign up, name the farm, and you get your own
fields, chemicals and records — isolated from every other organization by row-level
security in Postgres.

New org? A short setup wizard runs on first sign-in (location, units, crops, first
sprayer, first applicator), then a checklist on the Tickets screen tracks what's left:
fields, chemicals, equipment, people, first ticket. In-app how-tos are behind the
**Help** button in the top bar. None of it is required — you can skip straight to
the libraries if you'd rather.

### What setup actually involves

| Library | How it gets filled |
|---|---|
| Fields | Shapefile `.zip` (FarmMobile, Climate, Granular, FSA), a CSV with any column names, or by hand with a map picker |
| Chemicals | By hand off each label, or a CSV — download the template from the Chemicals screen |
| Equipment | By hand: name plus acres covered per hour |
| People | Licensed applicators with license numbers, and non-licensed operators |

Fields and chemicals are the two that matter — a ticket can't be written without them.
The rest take a minute each.

> Chemical records feed filed regulatory documents. EPA numbers, REIs and active
> ingredients always come off the product label; the app never guesses or
> pre-populates them.

## Running it locally

```bash
npm install
npm run dev
```

`npm run build` to produce `dist/`, `npm run lint` to lint, `npm run preview` to serve
a build. Deploys are static — `netlify.toml` has the SPA redirect and the
service-worker headers.

## How it's put together

- **React 19 + Vite 8**, no CSS framework — styling is inline-style objects built from design tokens in `src/utils/theme.js` (light/dark, four accents).
- **Supabase** for auth, Postgres and edge functions. The project URL and anon key are in `src/supabaseClient.js`; the anon key is public by design and RLS does the access control.
- **PWA** via `vite-plugin-pwa`, so the cab view installs to a phone home screen.

### Source map

| Path | What's in it |
|---|---|
| `src/Root.jsx` | Routing. `/r/<token>` renders the public posting alone — no supabase client, no session |
| `src/AnaquaFarms_AppTicket.jsx` | The authed app: ticket form, libraries, account, reports |
| `src/ApplicatorView.jsx`, `ApplicatorMapView.jsx` | The cab |
| `src/Onboarding.jsx`, `src/HelpDrawer.jsx` | Setup wizard, checklist, empty states, how-tos |
| `src/ReiPosting.jsx` | The public re-entry posting behind a QR code |
| `src/FieldMapPicker.jsx`, `BoundaryAssignMap.jsx` | Leaflet map pickers |
| `supabase/migrations/` | Schema and RLS, oldest first |
| `supabase/functions/` | `ai-assistant`, `rei-report`, `sheets-export` |

### Known rough edges

- **Invites don't send email.** Inviting someone creates a pending membership against their address; they have to sign up with that exact address themselves to land in the farm.
- **`equipment`, `licensed_applicators`, `non_licensed_applicators`, `chemicals` and `tickets` have no sequence on `id`** — the client assigns it. These use `Date.now()`, which is unique enough in practice, but the tables should get identity columns like `fields` and `pests` already have.
- `public.spatial_ref_sys` (PostGIS) has RLS disabled.
