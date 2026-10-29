-- Opt-in specialty features per organization, e.g. {"targetZone": true}
alter table organizations add column if not exists features jsonb not null default '{}'::jsonb;

-- Spot-spray (target zone) tickets: calculations use a reduced rate, the ticket keeps the broadcast gal/acre
alter table tickets add column if not exists target_zone boolean not null default false;
alter table tickets add column if not exists target_zone_pct numeric;
