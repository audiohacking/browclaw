// ---------------------------------------------------------------------------
// OpenBrowserClaw — Chat UI Component
// ---------------------------------------------------------------------------

import { Orchestrator } from '../orchestrator.js';
import { getRecentMessages } from '../db.js';
import { DEFAULT_GROUP_ID, CONTEXT_WINDOW_SIZE } from '../config.js';
import type { StoredMessage, OrchestratorState, ThinkingLogEntry, TokenUsage } from '../types.js';
import { renderMarkdown } from '../markdown.js';
import { el } from './app.js';
import { openFileViewer } from './file-viewer-modal.js';

/**
 * Chat UI component. Renders the message list, input area,
 * typing indicator, tool activity display, and thinking activity log.
 */
export class ChatUI {
  private orchestrator: Orchestrator;
  private container: HTMLElement | null = null;
  private messagesEl: HTMLElement | null = null;
  private inputEl: HTMLTextAreaElement | null = null;
  private typingEl: HTMLElement | null = null;
  private toolEl: HTMLElement | null = null;
  private sendBtn: HTMLButtonElement | null = null;
  private activeGroupId: string = DEFAULT_GROUP_ID;
  private isTyping = false;

  // Activity log
  private activityLogEl: HTMLElement | null = null;
  private activityListEl: HTMLElement | null = null;
  private activityToggleEl: HTMLElement | null = null;
  private activityExpanded = false;
  private activityEntries: ThinkingLogEntry[] = [];

  // Context usage bar
  private contextBarEl: HTMLElement | null = null;
  private contextFillEl: HTMLElement | null = null;
  private contextLabelEl: HTMLElement | null = null;

  constructor(orchestrator: Orchestrator) {
    this.orchestrator = orchestrator;
  }

  /**
   * Mount the chat UI into a container element.
   */
  mount(parent: HTMLElement): void {
    this.container = parent;
    this.container.classList.add('chat-container');
    this.render();
  }

  /**
   * Add a message to the chat display.
   */
  addMessage(msg: StoredMessage): void {
    if (msg.groupId !== this.activeGroupId) return;
    this.appendMessageEl(msg);
    this.scrollToBottom();
  }

  /**
   * Show/hide the typing indicator.
   */
  setTyping(groupId: string, typing: boolean): void {
    if (groupId !== this.activeGroupId) return;
    this.isTyping = typing;
    if (this.typingEl) {
      this.typingEl.style.display = typing ? 'flex' : 'none';
    }
    if (this.activityLogEl) {
      if (typing) {
        // Show the activity log container when thinking starts
        this.activityLogEl.style.display = 'block';
      } else {
        // Collapse when done — keep entries visible until next invocation
        this.activityLogEl.style.display = 'none';
      }
    }
    if (typing) this.scrollToBottom();
  }

  /**
   * Show tool activity.
   */
  setToolActivity(tool: string, status: string): void {
    if (this.toolEl) {
      if (status === 'running') {
        this.toolEl.textContent = `Using ${tool}...`;
        this.toolEl.style.display = 'block';
      } else {
        this.toolEl.style.display = 'none';
      }
    }
  }

  /**
   * Add a thinking log entry.
   */
  addThinkingLog(entry: ThinkingLogEntry): void {
    if (entry.groupId !== this.activeGroupId) return;

    // If this is the first entry of a new invocation, clear previous entries
    if (entry.kind === 'info' && entry.label === 'Starting') {
      this.activityEntries = [];
      if (this.activityListEl) this.activityListEl.innerHTML = '';
    }

    this.activityEntries.push(entry);
    this.renderLogEntry(entry);
    this.scrollToBottom();
  }

  /**
   * Update state display (e.g., disable input while thinking).
   */
  setState(state: OrchestratorState): void {
    if (this.inputEl) {
      this.inputEl.disabled = state === 'thinking';
    }
    if (this.sendBtn) {
      this.sendBtn.disabled = state === 'thinking';
    }
  }

  /**
   * Show an error message.
   */
  showError(error: string): void {
    const msgEl = el('div', 'message message-error');
    msgEl.textContent = `⚠️ ${error}`;
    this.messagesEl?.appendChild(msgEl);
    this.scrollToBottom();
  }

  /**
   * Update the context usage progress bar.
   */
  updateTokenUsage(usage: TokenUsage): void {
    if (usage.groupId !== this.activeGroupId) return;
    if (!this.contextBarEl || !this.contextFillEl || !this.contextLabelEl) return;

    // Only non-cached input tokens count against the rate limit
    const rateLimitedTokens = usage.inputTokens;
    const limit = usage.contextLimit;
    const pct = Math.min((rateLimitedTokens / limit) * 100, 100);

    this.contextFillEl.style.width = `${pct}%`;

    // Color transitions: green -> yellow -> red
    this.contextFillEl.classList.remove('context-fill-ok', 'context-fill-warn', 'context-fill-danger');
    if (pct >= 80) {
      this.contextFillEl.classList.add('context-fill-danger');
    } else if (pct >= 60) {
      this.contextFillEl.classList.add('context-fill-warn');
    } else {
      this.contextFillEl.classList.add('context-fill-ok');
    }

    const usedK = (rateLimitedTokens / 1000).toFixed(1);
    const limitK = (limit / 1000).toFixed(0);
    const cachedK = (usage.cacheReadTokens / 1000).toFixed(1);
    const label = usage.cacheReadTokens > 0
      ? `${usedK}k / ${limitK}k tokens (${pct.toFixed(0)}%) · ${cachedK}k cached`
      : `${usedK}k / ${limitK}k tokens (${pct.toFixed(0)}%)`;
    this.contextLabelEl.textContent = label;
    this.contextBarEl.style.display = 'flex';
  }

  /**
   * Clear the displayed messages (used on session reset).
   */
  clearMessages(): void {
    if (this.messagesEl) {
      this.messagesEl.innerHTML = '';
    }
    this.activityEntries = [];
    if (this.activityListEl) this.activityListEl.innerHTML = '';
    // Reset context bar
    if (this.contextBarEl) this.contextBarEl.style.display = 'none';
    if (this.contextFillEl) this.contextFillEl.style.width = '0%';
  }

  /**
   * Load and display message history.
   */
  async loadHistory(): Promise<void> {
    try {
      const messages = await getRecentMessages(this.activeGroupId, CONTEXT_WINDOW_SIZE);
      if (this.messagesEl) {
        this.messagesEl.innerHTML = '';
      }
      for (const msg of messages) {
        this.appendMessageEl(msg);
      }
      this.scrollToBottom();
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private render(): void {
    if (!this.container) return;
    this.container.innerHTML = '';

    // Session actions toolbar
    const actionsBar = el('div', 'chat-actions');

    // Context usage progress bar
    this.contextBarEl = el('div', 'context-bar');
    this.contextBarEl.style.display = 'none';
    const contextTrack = el('div', 'context-track');
    this.contextFillEl = el('div', 'context-fill context-fill-ok');
    contextTrack.appendChild(this.contextFillEl);
    this.contextLabelEl = el('span', 'context-label');
    this.contextLabelEl.textContent = '0k / 30k tokens';
    this.contextBarEl.append(contextTrack, this.contextLabelEl);
    actionsBar.appendChild(this.contextBarEl);

    // Spacer to push buttons to the right
    const spacer = el('div', 'chat-actions-spacer');
    actionsBar.appendChild(spacer);

    const compactBtn = document.createElement('button');
    compactBtn.className = 'chat-action-btn';
    compactBtn.title = 'Summarize conversation to reduce context size';
    compactBtn.innerHTML = '📉 Compact';
    compactBtn.addEventListener('click', () => {
      if (confirm('Summarize the current conversation to reduce token usage? The full history will be replaced with a compact summary.')) {
        this.orchestrator.compactContext(this.activeGroupId);
      }
    });

    const newSessionBtn = document.createElement('button');
    newSessionBtn.className = 'chat-action-btn chat-action-btn-danger';
    newSessionBtn.title = 'Clear all messages and start fresh';
    newSessionBtn.innerHTML = '🗑️ New Session';
    newSessionBtn.addEventListener('click', () => {
      if (confirm('Start a new session? This will clear all messages in the current conversation.')) {
        this.orchestrator.newSession(this.activeGroupId);
      }
    });

    actionsBar.append(compactBtn, newSessionBtn);
    this.container.appendChild(actionsBar);

    // Messages area
    this.messagesEl = el('div', 'messages');
    this.container.appendChild(this.messagesEl);

    // Typing indicator
    this.typingEl = el('div', 'typing-indicator');
    this.typingEl.innerHTML = `
      <div class="typing-dots">
        <span></span><span></span><span></span>
      </div>
      <span class="typing-text">Thinking...</span>
    `;
    this.typingEl.style.display = 'none';
    this.container.appendChild(this.typingEl);

    // Tool activity
    this.toolEl = el('div', 'tool-activity');
    this.toolEl.style.display = 'none';
    this.container.appendChild(this.toolEl);

    // Activity log (collapsible)
    this.activityLogEl = el('div', 'activity-log');
    this.activityLogEl.style.display = 'none';

    this.activityToggleEl = el('div', 'activity-toggle');
    this.activityToggleEl.innerHTML = '<span class="activity-toggle-icon">▶</span> Activity';
    this.activityToggleEl.addEventListener('click', () => {
      this.activityExpanded = !this.activityExpanded;
      if (this.activityListEl) {
        this.activityListEl.style.display = this.activityExpanded ? 'block' : 'none';
      }
      if (this.activityToggleEl) {
        const icon = this.activityToggleEl.querySelector('.activity-toggle-icon');
        if (icon) icon.textContent = this.activityExpanded ? '▼' : '▶';
      }
      if (this.activityExpanded) this.scrollToBottom();
    });
    this.activityLogEl.appendChild(this.activityToggleEl);

    this.activityListEl = el('div', 'activity-list');
    this.activityListEl.style.display = 'none';
    this.activityLogEl.appendChild(this.activityListEl);

    this.container.appendChild(this.activityLogEl);

    // Input area
    const inputArea = el('div', 'input-area');

    this.inputEl = document.createElement('textarea');
    this.inputEl.className = 'chat-input';
    this.inputEl.placeholder = 'Type a message...';
    this.inputEl.rows = 1;
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });
    this.inputEl.addEventListener('input', () => {
      // Auto-resize
      if (this.inputEl) {
        this.inputEl.style.height = 'auto';
        this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 150) + 'px';
      }
    });

    this.sendBtn = document.createElement('button');
    this.sendBtn.className = 'send-btn';
    this.sendBtn.textContent = '→';
    this.sendBtn.addEventListener('click', () => this.handleSend());

    inputArea.append(this.inputEl, this.sendBtn);
    this.container.appendChild(inputArea);
  }

  private handleSend(): void {
    if (!this.inputEl) return;
    const text = this.inputEl.value.trim();
    if (!text) return;

    this.orchestrator.submitMessage(text, this.activeGroupId);
    this.inputEl.value = '';
    this.inputEl.style.height = 'auto';
    this.inputEl.focus();
  }

  private appendMessageEl(msg: StoredMessage): void {
    if (!this.messagesEl) return;

    const wrapper = el('div', `message ${msg.isFromMe ? 'message-assistant' : 'message-user'}`);

    const senderEl = el('div', 'message-sender');
    senderEl.textContent = msg.isFromMe ? this.orchestrator.getAssistantName() : msg.sender;
    wrapper.appendChild(senderEl);

    const contentEl = el('div', 'message-content');
    if (msg.isFromMe) {
      // Assistant messages: render as markdown
      contentEl.classList.add('md');
      contentEl.innerHTML = renderMarkdown(msg.content);
      // Linkify file references so they open in the viewer modal
      this.linkifyFileRefs(contentEl, msg.groupId);
    } else {
      // User messages: plain text
      contentEl.textContent = msg.content;
    }
    wrapper.appendChild(contentEl);

    const timeEl = el('div', 'message-time');
    timeEl.textContent = formatTime(msg.timestamp);
    wrapper.appendChild(timeEl);

    this.messagesEl.appendChild(wrapper);
  }

  /**
   * Walk the rendered message DOM and turn file-path references into clickable
   * links that open the file viewer modal.
   *
   * Targets:
   *   - Inline <code> elements whose text looks like a workspace file path
   *   - Plain text patterns like "Written 1234 bytes to some/file.ext"
   */
  private linkifyFileRefs(root: HTMLElement, groupId: string): void {
    // Pattern for file paths with common extensions
    const FILE_EXT = /\.(html?|css|js|mjs|ts|tsx|jsx|json|md|txt|svg|xml|csv|ya?ml|py|sh|bash|toml|cfg|ini|log|env|sql)$/i;

    // 1. Inline <code> elements containing a bare file path
    const codeEls = root.querySelectorAll('code');
    codeEls.forEach((codeEl) => {
      // Skip code blocks inside <pre>
      if (codeEl.parentElement?.tagName === 'PRE') return;

      const text = codeEl.textContent?.trim() ?? '';
      if (FILE_EXT.test(text) && !text.includes(' ')) {
        const link = this.makeFileLink(text, groupId);
        // Preserve code styling inside the link
        const innerCode = document.createElement('code');
        innerCode.textContent = text;
        link.appendChild(innerCode);
        link.classList.add('file-ref-code');
        codeEl.replaceWith(link);
      }
    });

    // 2. Text nodes that mention file paths (e.g., "Written 1234 bytes to foo/bar.html")
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      textNodes.push(node as Text);
    }

    // Pattern: optional path segments + filename.ext (must contain a known extension)
    const PATH_RE = /(?:^|[\s"'`(])(([\w./-]+\/)?[\w.-]+\.(html?|css|js|mjs|ts|tsx|jsx|json|md|txt|svg|xml|csv|ya?ml|py|sh|bash|toml|cfg|ini|log|env|sql))(?=[\s"'`).,;:!?]|$)/gi;

    for (const textNode of textNodes) {
      // Don't touch text inside <code>, <pre>, or <a>
      const parent = textNode.parentElement;
      if (!parent) continue;
      if (['CODE', 'PRE', 'A'].includes(parent.tagName)) continue;

      const text = textNode.textContent ?? '';
      PATH_RE.lastIndex = 0;
      const matches = [...text.matchAll(PATH_RE)];
      if (matches.length === 0) continue;

      const frag = document.createDocumentFragment();
      let lastIndex = 0;

      for (const match of matches) {
        const filePath = match[1];
        const startIdx = match.index! + (match[0].length - match[0].trimStart().length);
        // Exact start of the captured group within the full match
        const captureStart = text.indexOf(filePath, match.index!);

        // Text before this match
        if (captureStart > lastIndex) {
          frag.appendChild(document.createTextNode(text.slice(lastIndex, captureStart)));
        }

        const link = this.makeFileLink(filePath, groupId);
        link.textContent = filePath;
        frag.appendChild(link);

        lastIndex = captureStart + filePath.length;
      }

      // Remaining text
      if (lastIndex < text.length) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex)));
      }

      parent.replaceChild(frag, textNode);
    }
  }

  /**
   * Create a clickable anchor element for a file path.
   */
  private makeFileLink(filePath: string, groupId: string): HTMLAnchorElement {
    const a = document.createElement('a');
    a.href = '#';
    a.className = 'file-ref-link';
    a.title = `Open ${filePath}`;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      openFileViewer(groupId, filePath);
    });
    return a;
  }

  private renderLogEntry(entry: ThinkingLogEntry): void {
    if (!this.activityListEl) return;

    const row = el('div', `activity-entry activity-${entry.kind}`);

    const kindIcons: Record<ThinkingLogEntry['kind'], string> = {
      'api-call': '🔗',
      'tool-call': '🔧',
      'tool-result': '📋',
      'text': '💬',
      'info': 'ℹ️',
    };

    const time = new Date(entry.timestamp).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const header = el('div', 'activity-entry-header');
    header.innerHTML = `<span class="activity-icon">${kindIcons[entry.kind] || '•'}</span>`
      + `<span class="activity-label">${escapeHtmlText(entry.label)}</span>`
      + `<span class="activity-time">${time}</span>`;
    row.appendChild(header);

    if (entry.detail) {
      const detail = el('div', 'activity-detail');
      detail.textContent = entry.detail;

      // Make detail expandable if long
      if (entry.detail.length > 120) {
        detail.classList.add('activity-detail-collapsed');
        detail.addEventListener('click', () => {
          detail.classList.toggle('activity-detail-collapsed');
          detail.classList.toggle('activity-detail-expanded');
          this.scrollToBottom();
        });
      }

      row.appendChild(detail);
    }

    this.activityListEl.appendChild(row);

    // Update toggle label with entry count
    if (this.activityToggleEl) {
      const icon = this.activityToggleEl.querySelector('.activity-toggle-icon');
      const arrow = icon?.textContent || '▶';
      this.activityToggleEl.innerHTML = `<span class="activity-toggle-icon">${arrow}</span> Activity (${this.activityEntries.length})`;
    }
  }

  private scrollToBottom(): void {
    if (this.messagesEl) {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function escapeHtmlText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
