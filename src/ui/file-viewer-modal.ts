// ---------------------------------------------------------------------------
// OpenBrowserClaw — File Viewer Modal
// ---------------------------------------------------------------------------
//
// Overlay modal that loads a file from OPFS and displays it.
// HTML/SVG files are rendered in a sandboxed iframe; all others
// are shown as syntax-highlighted text with download / open-in-tab options.
// On mobile the modal goes full viewport with a prominent close button.
// ---------------------------------------------------------------------------

import { readGroupFile } from '../storage.js';
import { el } from './app.js';

// Singleton overlay element — shared across all invocations
let overlayEl: HTMLElement | null = null;
let currentBlobUrl: string | null = null;

/**
 * Open the file viewer modal for a given file path.
 */
export async function openFileViewer(groupId: string, filePath: string): Promise<void> {
  ensureOverlay();
  showOverlay();
  setOverlayContent('<div class="fvm-loading">Loading…</div>');

  try {
    const content = await readGroupFile(groupId, filePath);
    renderFileContent(groupId, filePath, content);
  } catch (err) {
    setOverlayContent(
      `<div class="fvm-error">Could not load <strong>${escapeHtml(filePath)}</strong>:<br>${escapeHtml((err as Error).message)}</div>`,
    );
  }
}

// ---------------------------------------------------------------------------
// Overlay lifecycle
// ---------------------------------------------------------------------------

function ensureOverlay(): void {
  if (overlayEl) return;

  overlayEl = el('div', 'fvm-overlay');
  overlayEl.addEventListener('click', (e) => {
    // Close when clicking the backdrop (not the content)
    if (e.target === overlayEl) closeOverlay();
  });

  // ESC to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlayEl?.classList.contains('fvm-visible')) {
      closeOverlay();
    }
  });

  document.body.appendChild(overlayEl);
}

function showOverlay(): void {
  if (!overlayEl) return;
  overlayEl.classList.add('fvm-visible');
  document.body.style.overflow = 'hidden';
}

function closeOverlay(): void {
  if (!overlayEl) return;
  overlayEl.classList.remove('fvm-visible');
  document.body.style.overflow = '';
  // Clean up blob URLs
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }
}

function setOverlayContent(html: string): void {
  if (!overlayEl) return;
  overlayEl.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderFileContent(groupId: string, filePath: string, content: string): void {
  if (!overlayEl) return;
  overlayEl.innerHTML = '';

  const modal = el('div', 'fvm-modal');

  // ---- Header bar ----
  const header = el('div', 'fvm-header');

  const titleRow = el('div', 'fvm-title-row');
  const icon = el('span', 'fvm-icon');
  icon.textContent = fileIcon(filePath);
  titleRow.appendChild(icon);

  const pathEl = el('span', 'fvm-path');
  pathEl.textContent = filePath;
  pathEl.title = filePath;
  titleRow.appendChild(pathEl);
  header.appendChild(titleRow);

  const btnGroup = el('div', 'fvm-btns');

  // Download button
  const dlBtn = document.createElement('button');
  dlBtn.className = 'fvm-btn';
  dlBtn.textContent = '⬇ Download';
  dlBtn.addEventListener('click', () => downloadFile(filePath, content));
  btnGroup.appendChild(dlBtn);

  // Open in tab (for HTML/SVG)
  if (isRenderable(filePath)) {
    const openBtn = document.createElement('button');
    openBtn.className = 'fvm-btn';
    openBtn.textContent = '↗ Open in tab';
    openBtn.addEventListener('click', () => openInNewTab(filePath, content));
    btnGroup.appendChild(openBtn);
  }

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'fvm-btn fvm-btn-close';
  closeBtn.textContent = '✕';
  closeBtn.title = 'Close';
  closeBtn.addEventListener('click', () => closeOverlay());
  btnGroup.appendChild(closeBtn);

  header.appendChild(btnGroup);
  modal.appendChild(header);

  // ---- Body ----
  const body = el('div', 'fvm-body');

  if (isRenderable(filePath)) {
    // Render HTML/SVG in a sandboxed iframe
    const mimeType = guessMimeType(filePath);
    const blob = new Blob([content], { type: mimeType });
    currentBlobUrl = URL.createObjectURL(blob);

    const iframe = document.createElement('iframe');
    iframe.className = 'fvm-iframe';
    iframe.sandbox.add('allow-scripts'); // no allow-same-origin for safety
    iframe.src = currentBlobUrl;
    body.appendChild(iframe);
  } else {
    // Show as text
    const pre = el('pre', 'fvm-code');
    const code = document.createElement('code');
    const MAX_PREVIEW = 80_000;
    if (content.length > MAX_PREVIEW) {
      code.textContent = content.slice(0, MAX_PREVIEW) +
        `\n\n… (${(content.length - MAX_PREVIEW).toLocaleString()} more characters — download to see full file)`;
    } else {
      code.textContent = content;
    }
    pre.appendChild(code);
    body.appendChild(pre);
  }

  modal.appendChild(body);
  overlayEl.appendChild(modal);
}

// ---------------------------------------------------------------------------
// Download / open helpers
// ---------------------------------------------------------------------------

function downloadFile(filename: string, content: string): void {
  const name = filename.split('/').pop() ?? filename;
  const blob = new Blob([content], { type: guessMimeType(filename) });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function openInNewTab(filename: string, content: string): void {
  const blob = new Blob([content], { type: guessMimeType(filename) });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function isRenderable(filename: string): boolean {
  const ext = extOf(filename);
  return ['html', 'htm', 'svg'].includes(ext);
}

function extOf(name: string): string {
  return (name.split('.').pop() ?? '').toLowerCase();
}

function guessMimeType(filename: string): string {
  const ext = extOf(filename);
  const types: Record<string, string> = {
    html: 'text/html', htm: 'text/html',
    css: 'text/css',
    js: 'text/javascript', mjs: 'text/javascript',
    ts: 'text/typescript',
    json: 'application/json',
    md: 'text/markdown',
    txt: 'text/plain',
    svg: 'image/svg+xml',
    xml: 'application/xml',
    csv: 'text/csv',
    yaml: 'text/yaml', yml: 'text/yaml',
    py: 'text/x-python',
    sh: 'text/x-shellscript',
  };
  return types[ext] ?? 'text/plain';
}

function fileIcon(name: string): string {
  const ext = extOf(name);
  const icons: Record<string, string> = {
    html: '🌐', htm: '🌐',
    css: '🎨',
    js: '📜', ts: '📜', mjs: '📜',
    json: '📋',
    md: '📝', txt: '📝',
    svg: '🖼️', png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', webp: '🖼️',
    py: '🐍',
    sh: '⚙️', bash: '⚙️',
    xml: '📄',
    csv: '📊',
    yaml: '📄', yml: '📄',
  };
  return icons[ext] ?? '📄';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
