-- 20260313_admin_dashboard.sql
-- Admin dashboard tables, eval pipeline, usage analytics

-- Add role column to user_profiles
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

-- Add review fields to tester_feedback
ALTER TABLE tester_feedback
  ADD COLUMN IF NOT EXISTS reviewed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL;

-- Eval runs: tracks each eval execution for audit/debugging
CREATE TABLE IF NOT EXISTS eval_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  messages_evaluated INT NOT NULL DEFAULT 0,
  avg_accuracy FLOAT,
  avg_relevance FLOAT,
  avg_grounding FLOAT,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed'))
);

-- Message evals: per-assistant-message quality scores
CREATE TABLE IF NOT EXISTS message_evals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES conversation_messages(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  eval_run_id UUID REFERENCES eval_runs(id) ON DELETE SET NULL,
  accuracy_score FLOAT,
  accuracy_reasoning TEXT,
  relevance_score FLOAT,
  relevance_reasoning TEXT,
  grounding_score FLOAT,
  grounding_reasoning TEXT,
  overall_score FLOAT,
  topic TEXT,
  flagged BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_evals_message_id ON message_evals(message_id);
CREATE INDEX IF NOT EXISTS idx_message_evals_conversation_id ON message_evals(conversation_id);
CREATE INDEX IF NOT EXISTS idx_message_evals_flagged ON message_evals(flagged);
CREATE INDEX IF NOT EXISTS idx_message_evals_created_at ON message_evals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_evals_overall_score ON message_evals(overall_score);
CREATE INDEX IF NOT EXISTS idx_message_evals_topic ON message_evals(topic);

-- Improvement suggestions: auto-generated fix recommendations
CREATE TABLE IF NOT EXISTS improvement_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eval_id UUID NOT NULL REFERENCES message_evals(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('knowledge_gap', 'prompt_weakness', 'hallucination', 'personalization_miss')),
  description TEXT NOT NULL,
  suggested_fix TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'dismissed')),
  applied_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_improvement_suggestions_status ON improvement_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_improvement_suggestions_category ON improvement_suggestions(category);
CREATE INDEX IF NOT EXISTS idx_improvement_suggestions_created_at ON improvement_suggestions(created_at DESC);

-- Usage analytics: pre-computed daily engagement per user
CREATE TABLE IF NOT EXISTS usage_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  conversations_started INT NOT NULL DEFAULT 0,
  messages_sent INT NOT NULL DEFAULT 0,
  messages_received INT NOT NULL DEFAULT 0,
  avg_messages_per_conversation FLOAT NOT NULL DEFAULT 0,
  topics JSONB DEFAULT '[]'::jsonb,
  first_activity TIMESTAMPTZ,
  last_activity TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_usage_analytics_user_id ON usage_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_analytics_date ON usage_analytics(date DESC);
