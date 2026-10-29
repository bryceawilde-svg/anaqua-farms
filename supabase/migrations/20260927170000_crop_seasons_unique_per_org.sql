-- crop_name alone was the primary key, so the first org to save a crop locked that
-- crop name for every other org. Seasons are now unique per org + crop.
alter table crop_seasons drop constraint crop_seasons_pkey;
alter table crop_seasons add column id bigint generated always as identity primary key;
alter table crop_seasons add constraint crop_seasons_org_crop_key unique (org_id, crop_name);
