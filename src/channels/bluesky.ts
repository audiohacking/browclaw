// ---------------------------------------------------------------------------
// OpenBrowserClaw — Bluesky DM Channel
// ---------------------------------------------------------------------------
//
// Uses @atproto/api password authentication to receive and send DMs.
// Polls chat.bsky.convo.getLog for new messages using a cursor.
// See: https://atproto.com/guides/sdk-auth

import { AtpAgent } from '@atproto/api';
import type { ChatBskyConvoDefs } from '@atproto/api';
import type { Channel, InboundMessage } from '../types.js';
import { BLUESKY_SERVICE, BLUESKY_POLL_INTERVAL } from '../config.js';

type MessageCallback = (msg: InboundMessage) => void;

/**
 * Bluesky DM channel using the @atproto/api SDK with password authentication.
 * Polls chat.bsky.convo.getLog for new messages.
 */
export class BlueskyChannel implements Channel {
  readonly type = 'bluesky' as const;
  private agent: AtpAgent | null = null;
  private identifier: string = '';
  private password: string = '';
  private running = false;
  private messageCallback: MessageCallback | null = null;
  private cursor: string | undefined = undefined;
  // Maps DID → handle for sender name resolution
  private didHandleMap = new Map<string, string>();

  /**
   * Configure the channel with a Bluesky handle and app password.
   */
  configure(identifier: string, password: string): void {
    this.identifier = identifier;
    this.password = password;
  }

  /**
   * Log in and start polling for new DMs.
   */
  async start(): Promise<void> {
    if (!this.identifier || !this.password) return;
    if (this.running) return;

    this.agent = new AtpAgent({ service: BLUESKY_SERVICE });
    try {
      await this.agent.login({ identifier: this.identifier, password: this.password });
    } catch (err) {
      console.error('Bluesky login failed:', err);
      this.agent = null;
      return;
    }

    this.running = true;
    this.poll();
  }

  /**
   * Stop the polling loop.
   */
  stop(): void {
    this.running = false;
    this.agent = null;
  }

  /**
   * Send a DM to a Bluesky conversation.
   * groupId must be in the form "bsky:<convoId>".
   */
  async send(groupId: string, text: string): Promise<void> {
    if (!this.agent) return;
    const convoId = groupId.replace(/^bsky:/, '');
    const chatAgent = this.agent.withProxy('bsky_chat', 'did:web:api.bsky.chat');
    await chatAgent.api.chat.bsky.convo.sendMessage({
      convoId,
      message: { text },
    });
  }

  /**
   * Bluesky DMs do not support typing indicators.
   */
  setTyping(_groupId: string, _typing: boolean): void {
    // No-op — Bluesky DMs have no typing indicator API
  }

  /**
   * Register callback for inbound DMs.
   */
  onMessage(callback: MessageCallback): void {
    this.messageCallback = callback;
  }

  /**
   * Check if the channel is configured.
   */
  isConfigured(): boolean {
    return this.identifier.length > 0 && this.password.length > 0;
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private async poll(): Promise<void> {
    while (this.running && this.agent) {
      try {
        // Refresh DID→handle map periodically via listConvos
        await this.refreshDidHandleMap();

        const chatAgent = this.agent.withProxy('bsky_chat', 'did:web:api.bsky.chat');
        const { data } = await chatAgent.api.chat.bsky.convo.getLog({
          cursor: this.cursor,
        });

        if (data.cursor) {
          this.cursor = data.cursor;
        }

        const myDid = this.agent.session?.did;
        for (const log of data.logs) {
          if (log.$type !== 'chat.bsky.convo.defs#logCreateMessage') continue;
          const entry = log as ChatBskyConvoDefs.LogCreateMessage;
          const msg = entry.message;
          if (!msg || msg.$type !== 'chat.bsky.convo.defs#messageView') continue;
          const msgView = msg as ChatBskyConvoDefs.MessageView;
          // Skip our own outbound messages
          if (msgView.sender.did === myDid) continue;

          const senderHandle =
            this.didHandleMap.get(msgView.sender.did) || msgView.sender.did;

          this.messageCallback?.({
            id: msgView.id,
            groupId: `bsky:${entry.convoId}`,
            sender: senderHandle,
            content: msgView.text || '[Non-text message]',
            timestamp: new Date(msgView.sentAt).getTime(),
            channel: 'bluesky',
          });
        }
      } catch (err) {
        if (!this.running) break;
        console.error('Bluesky poll error:', err);
      }

      await sleep(BLUESKY_POLL_INTERVAL);
    }
  }

  private async refreshDidHandleMap(): Promise<void> {
    if (!this.agent) return;
    try {
      const chatAgent = this.agent.withProxy('bsky_chat', 'did:web:api.bsky.chat');
      const { data } = await chatAgent.api.chat.bsky.convo.listConvos({});
      for (const convo of data.convos) {
        for (const member of convo.members) {
          if (member.did && member.handle) {
            this.didHandleMap.set(member.did, member.handle);
          }
        }
      }
    } catch {
      // Non-fatal — handle lookup will fall back to DID
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
