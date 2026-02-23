import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadState, saveState, clearState, STORAGE_KEY } from '../../src/lib/storage';
import type { SavedState } from '../../src/lib/types';

const mockState: SavedState = {
  savedAt: 1234567890,
  ungroupedTabs: [
    { url: 'https://example.com', title: 'Example', pinned: false, index: 0 },
  ],
  groups: [
    {
      title: 'Work',
      color: 'blue',
      collapsed: false,
      tabs: [
        { url: 'https://work.com', title: 'Work', pinned: false, index: 1 },
      ],
    },
  ],
};

describe('storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('STORAGE_KEY', () => {
    // This key is persisted in chrome.storage.local. Changing it would silently
    // lose all saved user data. Pin it here so any rename is an intentional choice.
    it('should be "savedState"', () => {
      expect(STORAGE_KEY).toBe('savedState');
    });
  });

  describe('loadState', () => {
    it('returns null when no state is saved', async () => {
      chrome.storage.local.get.mockImplementation((_keys: unknown, callback: (result: Record<string, unknown>) => void) => {
        callback({});
      });

      const result = await loadState();
      expect(result).toBeNull();
    });

    it('returns null when savedState key is missing from result', async () => {
      chrome.storage.local.get.mockImplementation((_keys: unknown, callback: (result: Record<string, unknown>) => void) => {
        callback({ otherKey: 'something' });
      });

      const result = await loadState();
      expect(result).toBeNull();
    });

    it('returns the saved state when it exists', async () => {
      chrome.storage.local.get.mockImplementation((_keys: unknown, callback: (result: Record<string, unknown>) => void) => {
        callback({ [STORAGE_KEY]: mockState });
      });

      const result = await loadState();
      expect(result).toEqual(mockState);
    });

    it('calls chrome.storage.local.get with correct key', async () => {
      chrome.storage.local.get.mockImplementation((_keys: unknown, callback: (result: Record<string, unknown>) => void) => {
        callback({});
      });

      await loadState();
      expect(chrome.storage.local.get).toHaveBeenCalledWith(
        [STORAGE_KEY],
        expect.any(Function)
      );
    });
  });

  describe('saveState', () => {
    it('calls chrome.storage.local.set with the correct key and state', async () => {
      chrome.storage.local.set.mockImplementation((_items: unknown, callback?: () => void) => {
        callback?.();
      });

      await saveState(mockState);

      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        { [STORAGE_KEY]: mockState },
        expect.any(Function)
      );
    });

    it('resolves after saving', async () => {
      chrome.storage.local.set.mockImplementation((_items: unknown, callback?: () => void) => {
        callback?.();
      });

      await expect(saveState(mockState)).resolves.toBeUndefined();
    });
  });

  describe('clearState', () => {
    it('calls chrome.storage.local.remove with the correct key', async () => {
      chrome.storage.local.remove.mockImplementation((_keys: unknown, callback?: () => void) => {
        callback?.();
      });

      await clearState();

      expect(chrome.storage.local.remove).toHaveBeenCalledWith(
        [STORAGE_KEY],
        expect.any(Function)
      );
    });

    it('resolves after clearing', async () => {
      chrome.storage.local.remove.mockImplementation((_keys: unknown, callback?: () => void) => {
        callback?.();
      });

      await expect(clearState()).resolves.toBeUndefined();
    });
  });

  describe('round-trip', () => {
    it('saves and loads back the same state', async () => {
      let stored: Record<string, unknown> = {};

      chrome.storage.local.set.mockImplementation((items: Record<string, unknown>, callback?: () => void) => {
        stored = { ...stored, ...items };
        callback?.();
      });

      chrome.storage.local.get.mockImplementation((_keys: unknown, callback: (result: Record<string, unknown>) => void) => {
        callback(stored);
      });

      await saveState(mockState);
      const loaded = await loadState();
      expect(loaded).toEqual(mockState);
    });
  });
});
