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

## Deploying

The site is static on Netlify; `netlify.toml` has the SPA redirect, the service-worker
headers, and a 301 from the `*.netlify.app` alias to `boomlog.app`.

That redirect matters more than it looks. The alias serves the identical build, but a
browser treats it as a separate origin with its own localStorage, supabase session and
service worker — so a confirmation link that lands there signs the user in somewhere
`boomlog.app` can't see, and their farm looks empty when they type the real address.

Three settings live in the Supabase dashboard rather than in this repo. The first two
have to point at `https://boomlog.app`:

| Where | Setting |
|---|---|
| Authentication → URL Configuration | **Site URL** — the fallback every auth email uses |
| Authentication → URL Configuration | **Redirect URLs** — allow-list; `emailRedirectTo` is ignored unless the URL matches |
| Authentication → Emails → SMTP | **Custom SMTP** on a domain you own — see **Mail** below |

The default sender (`noreply@mail.app.supabase.io`) is a shared address Supabase rates
as development-only, and signup confirmations from it land in spam. Custom SMTP from
`boomlog.app`, with SPF/DKIM/DMARC on the domain, is what fixes that — and it makes the
sender match the link domain, which is most of the spam score.

### Mail

Confirmation emails come from `boomlog.app` through [Resend](https://resend.com) as the
custom SMTP provider. Two halves: the domain has to be authenticated in DNS, and
Supabase has to be pointed at the SMTP endpoint.

The domain added in Resend is the apex, `boomlog.app` — not a subdomain, because Resend
prefixes its own. It issues these records, which live in Netlify DNS since Netlify is
the nameserver:

| Name | Type | Value |
|---|---|---|
| `resend._domainkey` | TXT | the DKIM key Resend shows — one long `p=MIGf...` string |
| `rsend` | CNAME | `rsend.forge.rmta.net` |
| `send` | CNAME | `send.forge.rmta.net` |
| `_dmarc` | TXT | `v=DMARC1; p=none; rua=mailto:bryce@boomlog.app;` |

> Resend's published docs still describe an older setup — an SPF `TXT` and a
> `feedback-smtp...amazonaws.com` MX. Resend has moved off Amazon SES onto its own MTA,
> so what the dashboard actually issues is the two `forge.rmta.net` CNAMEs above and no
> SPF record at all. Go by the dashboard, not the docs.

Every one of those is on a subdomain, which matters. The apex already carries ImprovMX's
two MX records and `v=spf1 include:spf.improvmx.com ~all`, and that is what delivers
anything sent to `bryce@boomlog.app` — a forwarding alias, not a mailbox. So **leave
Resend's "Enable receiving" toggle off**: it adds an MX on the apex and would quietly
take over inbound mail for the whole domain.

Verification runs on Resend's own schedule and can take a few hours on NS1, even once
the records resolve publicly. Once it's verified, fill in Authentication → Emails →
SMTP:

| Field | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` (implicit TLS) |
| Username | `resend` |
| Password | a Resend API key, sending permission only |
| Sender | `noreply@boomlog.app`, name `BoomLog` |

Raise the cap under Authentication → Rate Limits while you're in there. The built-in
sender's default is a couple of emails an hour, which one afternoon of sign-ups hits.

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
