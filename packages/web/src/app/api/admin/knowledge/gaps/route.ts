import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAdminError } from '@/lib/admin-auth';
import { getSupabaseClient } from '@/lib/supabase';

interface GapEntry {
  topic: string;
  query_count: number;
  avg_grounding_score: number;
  sample_questions: string[];
  latest_at: string;
  suggestion_count: number;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAdminError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabase = getSupabaseClient();

    const days = parseInt(req.nextUrl.searchParams.get('days') || '30', 10);
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceISO = since.toISOString();

    // 1. Get message_evals with low grounding scores
    const { data: evals, error: evalsError } = await supabase
      .from('message_evals')
      .select('id, topic, grounding_score, message_id, conversation_id, created_at')
      .lt('grounding_score', 0.5)
      .gte('created_at', sinceISO)
      .not('topic', 'is', null);

    if (evalsError) throw evalsError;

    // For each eval, find the preceding user message in the same conversation
    // to get the actual question that wasn't well-answered
    const conversationIds = [...new Set((evals || []).map(e => e.conversation_id))];
    const userMessagesByConv: Record<string, { id: string; content: string; created_at: string }[]> = {};

    // Fetch user messages from relevant conversations
    for (let i = 0; i < conversationIds.length; i += 50) {
      const batch = conversationIds.slice(i, i + 50);
      const { data: messages } = await supabase
        .from('conversation_messages')
        .select('id, conversation_id, content, created_at')
        .in('conversation_id', batch)
        .eq('role', 'user')
        .order('created_at', { ascending: true });

      for (const msg of messages || []) {
        if (!userMessagesByConv[msg.conversation_id]) {
          userMessagesByConv[msg.conversation_id] = [];
        }
        userMessagesByConv[msg.conversation_id].push(msg);
      }
    }

    // Also fetch assistant messages to find the one preceding each eval's message
    const evalMessageIds = (evals || []).map(e => e.message_id);
    const assistantMsgTimes: Record<string, string> = {};
    for (let i = 0; i < evalMessageIds.length; i += 50) {
      const batch = evalMessageIds.slice(i, i + 50);
      const { data: msgs } = await supabase
        .from('conversation_messages')
        .select('id, created_at')
        .in('id', batch);
      for (const msg of msgs || []) {
        assistantMsgTimes[msg.id] = msg.created_at;
      }
    }

    // 2. Get improvement_suggestions with knowledge_gap category
    // Join via eval_id FK to get the topic from message_evals
    const { data: suggestions, error: suggestionsError } = await supabase
      .from('improvement_suggestions')
      .select('id, eval_id')
      .eq('category', 'knowledge_gap')
      .gte('created_at', sinceISO);

    if (suggestionsError) throw suggestionsError;

    // Look up topics for these suggestions via their eval_ids
    const evalIds = [...new Set((suggestions || []).map(s => s.eval_id))];
    const suggestionsByTopic: Record<string, number> = {};

    if (evalIds.length > 0) {
      const { data: evalTopics } = await supabase
        .from('message_evals')
        .select('id, topic')
        .in('id', evalIds);

      const topicByEvalId: Record<string, string> = {};
      for (const e of evalTopics || []) {
        if (e.topic) topicByEvalId[e.id] = e.topic;
      }

      for (const s of suggestions || []) {
        const t = topicByEvalId[s.eval_id] || 'unknown';
        suggestionsByTopic[t] = (suggestionsByTopic[t] || 0) + 1;
      }
    }

    // Aggregate evals by topic
    const topicMap: Record<string, {
      scores: number[];
      questions: string[];
      latestAt: string;
    }> = {};

    for (const ev of evals || []) {
      const topic = ev.topic as string;
      if (!topicMap[topic]) {
        topicMap[topic] = { scores: [], questions: [], latestAt: ev.created_at };
      }

      const entry = topicMap[topic];
      entry.scores.push(ev.grounding_score as number);

      // Find the user question that preceded this assistant message
      const assistantTime = assistantMsgTimes[ev.message_id];
      const convMessages = userMessagesByConv[ev.conversation_id] || [];
      if (entry.questions.length < 3 && assistantTime) {
        // Get the latest user message before the assistant response
        const precedingUserMsg = convMessages
          .filter(m => m.created_at < assistantTime)
          .pop();
        if (precedingUserMsg?.content) {
          entry.questions.push(precedingUserMsg.content);
        }
      }

      if (ev.created_at > entry.latestAt) {
        entry.latestAt = ev.created_at;
      }
    }

    // Build the response
    const gaps: GapEntry[] = Object.entries(topicMap)
      .map(([topic, data]) => ({
        topic,
        query_count: data.scores.length,
        avg_grounding_score: Math.round(
          (data.scores.reduce((a, b) => a + b, 0) / data.scores.length) * 1000
        ) / 1000,
        sample_questions: data.questions,
        latest_at: data.latestAt,
        suggestion_count: suggestionsByTopic[topic] || 0,
      }))
      .sort((a, b) => b.query_count - a.query_count);

    return NextResponse.json(gaps);
  } catch (error) {
    console.error('Knowledge gaps error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch knowledge gaps' },
      { status: 500 }
    );
  }
}
