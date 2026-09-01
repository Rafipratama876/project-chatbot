import { useState } from 'react';
import { ChatMessage } from '../api/client';

interface Props {
  messages: ChatMessage[];
  onSend: (message: string) => Promise<void>;
  disabled?: boolean;
}

export default function ChatPanel({ messages, onSend, disabled }: Props) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!input.trim() || sending) return;
    const message = input.trim();
    setInput('');
    setSending(true);
    try {
      await onSend(message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {messages.length === 0 && (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Minta perubahan di sini, mis. "ganti face color jadi merah" atau "return depth jadi 3 inci".
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`chat-bubble ${m.role === 'USER' ? 'user' : 'agent'}`}>
            {m.content}
          </div>
        ))}
        {sending && <div className="chat-bubble agent">Memproses revisi…</div>}
      </div>
      <div className="chat-input-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Request revisions…"
          disabled={disabled || sending}
        />
        <button className="btn btn-primary" onClick={handleSend} disabled={disabled || sending}>
          Send
        </button>
      </div>
    </div>
  );
}
