// ---------------------------------------------------------------------------
// browclaw — Global file viewer store
// ---------------------------------------------------------------------------

import { create } from 'zustand';
import { readGroupFile } from '../storage.js';
import { DEFAULT_GROUP_ID } from '../config.js';

interface FileViewerState {
  file: { name: string; content: string } | null;
  openFile: (path: string, groupId?: string) => Promise<void>;
  closeFile: () => void;
}

export const useFileViewerStore = create<FileViewerState>((set) => ({
  file: null,

  openFile: async (path: string, groupId: string = DEFAULT_GROUP_ID) => {
    try {
      const content = await readGroupFile(groupId, path);
      const name = path.split('/').pop() || path;
      set({ file: { name, content } });
    } catch (err) {
      console.error('Failed to open file:', path, err);
    }
  },

  closeFile: () => set({ file: null }),
}));
