CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New conversation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversations_user_select ON conversations
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY conversations_user_insert ON conversations
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY conversations_user_update ON conversations
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY conversations_user_delete ON conversations
  FOR DELETE USING (user_id = auth.uid());


CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  sources JSONB,
  referrals JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation_id
  ON conversation_messages(conversation_id);

ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversation_messages_user_select ON conversation_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = conversation_messages.conversation_id
        AND conversations.user_id = auth.uid()
    )
  );

CREATE POLICY conversation_messages_user_insert ON conversation_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = conversation_messages.conversation_id
        AND conversations.user_id = auth.uid()
    )
  );

CREATE POLICY conversation_messages_user_update ON conversation_messages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = conversation_messages.conversation_id
        AND conversations.user_id = auth.uid()
    )
  );

CREATE POLICY conversation_messages_user_delete ON conversation_messages
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = conversation_messages.conversation_id
        AND conversations.user_id = auth.uid()
    )
  );
