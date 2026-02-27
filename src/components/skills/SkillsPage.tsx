// ---------------------------------------------------------------------------
// OpenBrowserClaw — Skills page
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { Plus, X, Trash2, Zap, Download, ExternalLink } from 'lucide-react';
import { getAllSkills, saveSkill, deleteSkill } from '../../db.js';
import type { Skill } from '../../types.js';
import { ulid } from '../../ulid.js';

const SKILLS_INDEX_URL = 'https://github.com/anthropics/skills';
const MAX_DESCRIPTION_PREVIEW = 200;

/** Convert a GitHub blob URL to a raw content URL. */
function toRawUrl(url: string): string {
  return url
    .replace('https://github.com/', 'https://raw.githubusercontent.com/')
    .replace('/blob/', '/');
}

export function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Form state
  const [formMode, setFormMode] = useState<'manual' | 'import'>('import');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');

  const loadSkills = useCallback(async () => {
    setLoading(true);
    const all = await getAllSkills();
    setSkills(all);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  function resetForm() {
    setName('');
    setDescription('');
    setContent('');
    setImportUrl('');
    setImportError('');
    setFormMode('import');
    setShowForm(false);
  }

  async function handleImport() {
    setImportError('');
    if (!importUrl.trim()) return;

    setImporting(true);
    try {
      const raw = toRawUrl(importUrl.trim());
      const res = await fetch(raw);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const text = await res.text();

      // Parse the SKILL.md: first heading becomes the name
      const headingMatch = text.match(/^#\s+(.+)$/m);
      const lastSegment = raw.split('/').filter(Boolean).pop();
      const parsedName = headingMatch ? headingMatch[1].trim() : (lastSegment ?? 'Imported Skill');

      // First paragraph after the heading becomes the description
      const bodyAfterHeading = text.replace(/^#\s+.+$/m, '').trim();
      const firstPara = bodyAfterHeading.split(/\n\n+/)[0]?.trim() ?? '';
      const parsedDescription = firstPara.replace(/^#+\s*/, '').slice(0, MAX_DESCRIPTION_PREVIEW);

      setName(parsedName);
      setDescription(parsedDescription);
      setContent(text);
      setFormMode('manual');
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  async function handleSave() {
    const skill: Skill = {
      id: ulid(),
      name: name.trim(),
      description: description.trim(),
      content: content.trim(),
      enabled: true,
      sourceUrl: importUrl.trim() || undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveSkill(skill);
    resetForm();
    loadSkills();
  }

  async function handleToggle(skill: Skill) {
    await saveSkill({ ...skill, enabled: !skill.enabled, updatedAt: Date.now() });
    loadSkills();
  }

  async function handleDelete(id: string) {
    await deleteSkill(id);
    setDeleteConfirm(null);
    loadSkills();
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Agent Skills</h2>
        <div className="flex gap-2">
          <a
            href={SKILLS_INDEX_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm gap-1.5"
            title="Browse public skills index"
          >
            <ExternalLink className="w-4 h-4" />
            <span className="hidden sm:inline">Browse Index</span>
          </a>
          <button
            className="btn btn-primary btn-sm gap-1.5"
            onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }}
          >
            {showForm ? <><X className="w-4 h-4" /> Cancel</> : <><Plus className="w-4 h-4" /> Add Skill</>}
          </button>
        </div>
      </div>

      <p className="text-sm opacity-60 mb-4">
        Skills extend the assistant with domain-specific knowledge and capabilities via SKILL.md files.
        Active skills are included in the system prompt on every conversation.
      </p>

      {/* Add / Import form */}
      {showForm && (
        <div className="card card-bordered bg-base-200 mb-6">
          <div className="card-body p-4 sm:p-6 gap-4">
            <h3 className="card-title text-base">
              {formMode === 'import' ? 'Import Skill from URL' : 'Add Skill'}
            </h3>

            {formMode === 'import' && (
              <>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">SKILL.md URL</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      className="input input-bordered input-sm flex-1 font-mono"
                      placeholder="https://github.com/anthropics/skills/blob/main/skills/…/SKILL.md"
                      value={importUrl}
                      onChange={(e) => setImportUrl(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleImport(); }}
                    />
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleImport}
                      disabled={importing || !importUrl.trim()}
                    >
                      {importing ? <span className="loading loading-spinner loading-xs" /> : <Download className="w-4 h-4" />}
                      {importing ? 'Fetching…' : 'Fetch'}
                    </button>
                  </div>
                  {importError && (
                    <p className="text-error text-xs mt-1">{importError}</p>
                  )}
                  <p className="text-xs opacity-50 mt-1">
                    Supports GitHub blob URLs and raw content URLs.
                  </p>
                </div>
                <button
                  className="btn btn-ghost btn-sm self-start"
                  onClick={() => setFormMode('manual')}
                >
                  Or paste content manually
                </button>
              </>
            )}

            {formMode === 'manual' && (
              <>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Name</span>
                  </label>
                  <input
                    type="text"
                    className="input input-bordered input-sm"
                    placeholder="My Skill"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Description <span className="opacity-50">(optional)</span></span>
                  </label>
                  <input
                    type="text"
                    className="input input-bordered input-sm"
                    placeholder="Short description of what this skill does"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">SKILL.md Content</span>
                  </label>
                  <textarea
                    className="textarea textarea-bordered font-mono text-xs h-48"
                    placeholder="Paste the contents of a SKILL.md file here…"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                  />
                </div>

                {importUrl && (
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">Source URL <span className="opacity-50">(optional)</span></span>
                    </label>
                    <input
                      type="url"
                      className="input input-bordered input-sm font-mono"
                      value={importUrl}
                      onChange={(e) => setImportUrl(e.target.value)}
                    />
                  </div>
                )}

                <div className="card-actions justify-between">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setFormMode('import')}
                  >
                    ← Import from URL
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={!name.trim() || !content.trim()}
                    onClick={handleSave}
                  >
                    Save Skill
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Skills list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <span className="loading loading-spinner loading-md" />
        </div>
      ) : skills.length === 0 ? (
        <div className="hero py-12">
          <div className="hero-content text-center">
            <div>
              <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>No skills installed</p>
              <p className="text-xs opacity-60 mt-1">
                Add a skill to extend the assistant's capabilities
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {skills.map((skill) => (
            <div
              key={skill.id}
              className={`card card-bordered bg-base-200 ${!skill.enabled ? 'opacity-50' : ''}`}
            >
              <div className="card-body p-4 sm:p-6 gap-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{skill.name}</p>
                    {skill.description && (
                      <p className="text-sm opacity-70 mt-0.5">{skill.description}</p>
                    )}
                    {skill.sourceUrl && (
                      <a
                        href={skill.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs opacity-40 hover:opacity-70 flex items-center gap-1 mt-1 w-fit"
                      >
                        <ExternalLink className="w-3 h-3" />
                        {skill.sourceUrl.replace(/^https?:\/\//, '')}
                      </a>
                    )}
                    <p className="text-xs opacity-40 mt-1">
                      {skill.content.length.toLocaleString()} chars
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="checkbox"
                      className="toggle toggle-primary toggle-sm"
                      checked={skill.enabled}
                      onChange={() => handleToggle(skill)}
                    />
                    <button
                      className="btn btn-ghost btn-xs text-error"
                      onClick={() => setDeleteConfirm(skill.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-lg">Remove skill?</h3>
            <p className="py-4">This skill will be permanently removed.</p>
            <div className="modal-action">
              <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </button>
              <button
                className="btn btn-error"
                onClick={() => handleDelete(deleteConfirm)}
              >
                Remove
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setDeleteConfirm(null)}>close</button>
          </form>
        </dialog>
      )}
    </div>
  );
}
