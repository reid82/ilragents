-- 004_auth_and_feedback.sql
-- Adds user profiles, links financial_positions to auth, and tester feedback

-- User profiles table (links Supabase Auth to app data)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add user_id to financial_positions for authenticated users
ALTER TABLE financial_positions
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_financial_positions_user_id
  ON financial_positions(user_id);

-- Tester feedback table
CREATE TABLE IF NOT EXISTS tester_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT,
  agent_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  user_question TEXT NOT NULL,
  assistant_message TEXT NOT NULL,
  feedback_comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tester_feedback_agent_idx
  ON tester_feedback(agent_id);
CREATE INDEX IF NOT EXISTS tester_feedback_created_idx
  ON tester_feedback(created_at DESC);

-- Add updated_at trigger to user_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'user_profiles_updated_at'
  ) THEN
    CREATE TRIGGER user_profiles_updated_at
      BEFORE UPDATE ON user_profiles
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END;
$$;
