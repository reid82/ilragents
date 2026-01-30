'use client';

import { useState, useEffect, useCallback } from 'react';

interface VoiceChatProps {
  agentName: string;
  agentColor: string;
  onClose: () => void;
}

export default function VoiceChat({
  agentName,
  agentColor,
  onClose,
}: VoiceChatProps) {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Checking availability...');
  const [conversationRef, setConversationRef] = useState<{ endSession: () => Promise<void> } | null>(null);

  const initials = agentName
    .split(' ')
    .map((w) => w[0])
    .join('');

  // Check voice availability on mount
  useEffect(() => {
    async function checkAvailability() {
      try {
        const res = await fetch('/api/voice/token');
        const data = await res.json();
        setIsAvailable(data.available);
        if (!data.available) {
          setStatus('Voice chat is not configured');
          setError(data.error || 'ElevenLabs API keys not set');
        } else {
          setStatus('Ready to connect');
        }
      } catch {
        setIsAvailable(false);
        setStatus('Voice chat unavailable');
        setError('Could not check voice availability');
      }
    }
    checkAvailability();
  }, []);

  const startConversation = useCallback(async () => {
    if (!isAvailable) return;

    try {
      setStatus('Connecting...');
      setError(null);
      const tokenRes = await fetch('/api/voice/token');
      const tokenData = await tokenRes.json();

      if (!tokenData.signedUrl) {
        throw new Error('No signed URL received');
      }

      const { Conversation } = await import('@11labs/client');

      const conversation = await Conversation.startSession({
        signedUrl: tokenData.signedUrl,
        onConnect: () => {
          setIsConnected(true);
          setStatus('Connected - speak now');
        },
        onDisconnect: () => {
          setIsConnected(false);
          setConversationRef(null);
          setStatus('Disconnected');
        },
        onError: (message: string) => {
          setError(message);
          setStatus('Error occurred');
        },
        onModeChange: (mode: { mode: string }) => {
          setIsSpeaking(mode.mode === 'speaking');
          setStatus(
            mode.mode === 'speaking' ? 'Agent is speaking...' : 'Listening...'
          );
        },
      });

      setConversationRef(conversation);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start voice');
      setStatus('Connection failed');
    }
  }, [isAvailable]);

  const handleClose = useCallback(async () => {
    if (conversationRef) {
      await conversationRef.endSession();
    }
    onClose();
  }, [conversationRef, onClose]);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="relative bg-zinc-900 rounded-2xl border border-zinc-800 p-8 max-w-md w-full mx-4 text-center">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white text-sm"
        >
          Close
        </button>

        {/* Agent avatar */}
        <div className="mb-6">
          <div
            className={`w-24 h-24 rounded-full flex items-center justify-center text-white font-bold text-3xl mx-auto transition-all ${
              isSpeaking ? 'animate-pulse scale-110' : ''
            } ${isConnected ? 'ring-4 ring-green-500/50' : ''}`}
            style={{ backgroundColor: agentColor }}
          >
            {initials}
          </div>
        </div>

        <h2 className="text-xl font-bold mb-2">{agentName}</h2>
        <p className="text-zinc-400 text-sm mb-6">{status}</p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4 text-red-400 text-sm">
            {error}
          </div>
        )}

        {isAvailable === false && (
          <p className="text-zinc-500 text-sm mb-4">
            Voice chat requires ElevenLabs API configuration. Text chat is still
            available.
          </p>
        )}

        <div className="flex gap-3 justify-center">
          {!isConnected && isAvailable && (
            <button
              onClick={startConversation}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-medium transition-colors"
            >
              Start Voice Chat
            </button>
          )}
          <button
            onClick={handleClose}
            className="bg-zinc-700 hover:bg-zinc-600 text-white px-6 py-3 rounded-xl font-medium transition-colors"
          >
            {isConnected ? 'End Call' : 'Back to Text'}
          </button>
        </div>
      </div>
    </div>
  );
}
