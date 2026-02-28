// ---------------------------------------------------------------------------
// browclaw — Typing indicator
// ---------------------------------------------------------------------------

export function TypingIndicator() {
  return (
    <div className="chat chat-start">
      <div className="chat-bubble chat-bubble-neutral flex items-center gap-2 py-3 px-4">
        <div className="flex gap-1">
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
        </div>
        <span className="text-sm opacity-60">Thinking...</span>
      </div>
    </div>
  );
}
