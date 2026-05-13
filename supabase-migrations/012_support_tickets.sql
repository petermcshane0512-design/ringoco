-- BellAveGo Schema Migration 012 — Customer support tickets
-- Backs /dashboard/support (customer-facing) and /admin/support (Peter's queue).
-- One row per ticket. Conversation history stored as a JSONB thread for simplicity
-- (one customer, one Peter — no multi-agent assignment yet).
--
-- Paste into https://supabase.com/dashboard/project/calbttbufyrqiblnncsm/sql/new + Run.

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  business_name text,
  subject text NOT NULL,
  body text NOT NULL,
  category text DEFAULT 'general',         -- 'billing' | 'bug' | 'feature_request' | 'general' (auto-classified by Claude Haiku)
  status text DEFAULT 'new',                -- 'new' | 'triaged' | 'in_progress' | 'resolved' | 'closed'
  priority text DEFAULT 'normal',           -- 'low' | 'normal' | 'high' | 'urgent'
  ai_summary text,                          -- 1-sentence Claude summary for triage view
  thread jsonb DEFAULT '[]'::jsonb,         -- [{from: 'customer'|'peter', body: '...', at: '...'}]
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user
  ON support_tickets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status
  ON support_tickets (status, priority, created_at DESC);
