// ---------------------------------------------------------------------------
// browclaw — Message list
// ---------------------------------------------------------------------------

import type { StoredMessage } from '../../types.js';
import { MessageBubble } from './MessageBubble.js';

interface Props {
  messages: StoredMessage[];
}

export function MessageList({ messages }: Props) {
  return (
    <>
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
    </>
  );
}
