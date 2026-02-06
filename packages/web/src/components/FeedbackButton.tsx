'use client';

import { useState, useRef, useEffect } from 'react';

interface FeedbackButtonProps {
  agentId: string;
  agentName: string;
  userQuestion: string;
  assistantMessage: string;
  sessionId: string | null;
  userId: string | undefined;
}

export default function FeedbackButton({
  agentId,
  agentName,
  userQuestion,
  assistantMessage,
  sessionId,
  userId,
}: FeedbackButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const popoverRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // Focus textarea when opened
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  async function handleSubmit() {
    if (!comment.trim() || status === 'sending') return;

    setStatus('sending');
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          sessionId,
          agentId,
          agentName,
          userQuestion,
          assistantMessage,
          feedbackComment: comment.trim(),
        }),
      });

      if (res.ok) {
        setStatus('sent');
        setTimeout(() => {
          setIsOpen(false);
          setComment('');
          setStatus('idle');
        }, 1500);
      } else {
        setStatus('idle');
      }
    } catch {
      setStatus('idle');
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={() => {
          if (status !== 'sent') setIsOpen(!isOpen);
        }}
        className="text-zinc-600 hover:text-zinc-400 transition-colors p-1"
        title="Give feedback on this response"
      >
        {status === 'sent' ? (
          // Checkmark icon
          <svg className="w-4 h-4 text-green-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        ) : (
          // Chat bubble icon
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zm-4 0H9v2h2V9z" clipRule="evenodd" />
          </svg>
        )}
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute bottom-full right-0 mb-2 w-72 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50"
        >
          <div className="p-3">
            <textarea
              ref={textareaRef}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What's wrong with this response?"
              rows={3}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] text-zinc-500">
                Cmd+Enter to submit
              </span>
              <button
                onClick={handleSubmit}
                disabled={!comment.trim() || status === 'sending'}
                className="text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-md transition-colors"
              >
                {status === 'sending' ? 'Sending...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
