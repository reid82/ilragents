'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Persona {
  id: string;
  agent_name: string;
  domain: string;
  base_system_prompt: string | null;
  system_prompt_override: string | null;
  personality_traits: string | null;
  greeting_message: string | null;
  elevenlabs_agent_id: string | null;
}

export default function PersonasAdminPage() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selected, setSelected] = useState<Persona | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Editable fields
  const [systemPromptOverride, setSystemPromptOverride] = useState('');
  const [personalityTraits, setPersonalityTraits] = useState('');
  const [greetingMessage, setGreetingMessage] = useState('');
  const [elevenlabsAgentId, setElevenlabsAgentId] = useState('');

  useEffect(() => {
    fetchPersonas();
  }, []);

  async function fetchPersonas() {
    try {
      const res = await fetch('/api/admin/personas');
      if (res.ok) {
        const data = await res.json();
        setPersonas(data);
      }
    } catch {
      setFeedback({ type: 'error', message: 'Failed to load personas' });
    } finally {
      setLoading(false);
    }
  }

  function selectPersona(persona: Persona) {
    setSelected(persona);
    setSystemPromptOverride(persona.system_prompt_override || '');
    setPersonalityTraits(persona.personality_traits || '');
    setGreetingMessage(persona.greeting_message || '');
    setElevenlabsAgentId(persona.elevenlabs_agent_id || '');
    setFeedback(null);
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/admin/personas/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_prompt_override: systemPromptOverride,
          personality_traits: personalityTraits,
          greeting_message: greetingMessage,
          elevenlabs_agent_id: elevenlabsAgentId,
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setPersonas((prev) =>
          prev.map((p) => (p.id === updated.id ? updated : p))
        );
        setSelected(updated);
        setFeedback({ type: 'success', message: 'Saved' });
      } else {
        throw new Error('Save failed');
      }
    } catch {
      setFeedback({ type: 'error', message: 'Failed to save' });
    } finally {
      setSaving(false);
    }
  }

  async function handleSeed() {
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/seed', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setFeedback({ type: 'success', message: `Seeded ${data.seeded} personas` });
        await fetchPersonas();
      } else {
        throw new Error('Seed failed');
      }
    } catch {
      setFeedback({ type: 'error', message: 'Failed to seed personas' });
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-zinc-400 hover:text-white transition-colors">
          &larr; Back
        </Link>
        <h1 className="font-semibold text-lg flex-1">Persona Editor</h1>
        <button
          onClick={handleSeed}
          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-lg text-sm transition-colors"
        >
          Seed / Reset
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel - agent list */}
        <div className="w-64 border-r border-zinc-800 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-zinc-500 text-sm">Loading...</div>
          ) : personas.length === 0 ? (
            <div className="p-4 text-zinc-500 text-sm">
              No personas found. Click &quot;Seed / Reset&quot; to create them.
            </div>
          ) : (
            <div className="py-2">
              {personas.map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectPersona(p)}
                  className={`w-full text-left px-4 py-3 transition-colors ${
                    selected?.id === p.id
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                  }`}
                >
                  <div className="font-medium text-sm">{p.agent_name}</div>
                  <div className="text-xs text-zinc-500">{p.domain}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right panel - edit form */}
        <div className="flex-1 overflow-y-auto p-6">
          {!selected ? (
            <div className="text-zinc-500 text-center mt-20">
              Select an agent to edit their persona
            </div>
          ) : (
            <div className="max-w-2xl space-y-6">
              <div>
                <h2 className="text-xl font-bold">{selected.agent_name}</h2>
                <p className="text-zinc-400 text-sm">{selected.domain}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  System Prompt Override
                </label>
                <textarea
                  value={systemPromptOverride}
                  onChange={(e) => setSystemPromptOverride(e.target.value)}
                  rows={8}
                  placeholder="Leave empty to use the default RAG-grounded prompt. Override to use a custom system prompt as the base."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Personality Traits
                </label>
                <textarea
                  value={personalityTraits}
                  onChange={(e) => setPersonalityTraits(e.target.value)}
                  rows={4}
                  placeholder="Describe personality traits, speaking style, tone, etc."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Greeting Message
                </label>
                <textarea
                  value={greetingMessage}
                  onChange={(e) => setGreetingMessage(e.target.value)}
                  rows={3}
                  placeholder="The initial greeting when a user opens this agent's chat."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  ElevenLabs Agent ID
                </label>
                <input
                  type="text"
                  value={elevenlabsAgentId}
                  onChange={(e) => setElevenlabsAgentId(e.target.value)}
                  placeholder="Paste the ElevenLabs agent ID for voice chat"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              {feedback && (
                <div
                  className={`text-sm px-4 py-2 rounded-lg ${
                    feedback.type === 'success'
                      ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                      : 'bg-red-500/10 border border-red-500/30 text-red-400'
                  }`}
                >
                  {feedback.message}
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
