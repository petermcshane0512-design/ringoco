-- BellAveGo Schema Migration 011 — Webflow CMS support
-- Adds website_collection_id to concierge_settings so AI Local SEO can publish
-- weekly blog posts to a customer's Webflow CMS Collection via the Webflow CMS API v2.
--
-- Paste into https://supabase.com/dashboard/project/calbttbufyrqiblnncsm/sql/new + Run.

ALTER TABLE concierge_settings
  ADD COLUMN IF NOT EXISTS website_collection_id text;

COMMENT ON COLUMN concierge_settings.website_collection_id IS
  'Webflow CMS Collection ID — required to publish to Webflow sites. WordPress sites do not need this.';
