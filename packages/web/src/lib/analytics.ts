import { getSupabaseClient } from './supabase';

/**
 * Upsert the current day's usage analytics row for a user.
 * Called after each assistant message is persisted.
 */
export async function upsertUsageAnalytics(params: {
  userId: string;
  topic?: string;
  isNewConversation?: boolean;
}): Promise<void> {
  const { userId, topic, isNewConversation } = params;
  const supabase = getSupabaseClient();
  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  // Try to get existing row for today
  const { data: existing } = await supabase
    .from('usage_analytics')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  if (existing) {
    // Update existing row
    const topics: string[] = existing.topics || [];
    if (topic && !topics.includes(topic)) {
      topics.push(topic);
    }

    await supabase
      .from('usage_analytics')
      .update({
        messages_sent: existing.messages_sent + 1,
        messages_received: existing.messages_received + 1,
        conversations_started: existing.conversations_started + (isNewConversation ? 1 : 0),
        topics,
        last_activity: now,
      })
      .eq('id', existing.id);
  } else {
    // Insert new row for today
    await supabase.from('usage_analytics').insert({
      user_id: userId,
      date: today,
      conversations_started: isNewConversation ? 1 : 0,
      messages_sent: 1,
      messages_received: 1,
      topics: topic ? [topic] : [],
      first_activity: now,
      last_activity: now,
    });
  }
}
