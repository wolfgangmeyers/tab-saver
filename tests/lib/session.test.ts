import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  saveAll,
  restoreAll,
  restoreGroup,
  restoreTab,
  removeGroup,
  removeTab,
  resaveGroup,
} from '../../src/lib/session';
import type { SavedState } from '../../src/lib/types';

// Helper to make chrome.storage.local.get return a state
function mockStorageGet(state: SavedState | null) {
  chrome.storage.local.get.mockImplementation((_keys: unknown, callback: (result: Record<string, unknown>) => void) => {
    if (state === null) {
      callback({});
    } else {
      callback({ savedState: state });
    }
  });
}

function mockStorageSet() {
  chrome.storage.local.set.mockImplementation((_items: unknown, callback?: () => void) => {
    callback?.();
  });
}

function mockWindowsGetCurrent(windowId: number) {
  chrome.windows.getCurrent.mockImplementation((callback: (window: chrome.windows.Window) => void) => {
    callback({ id: windowId, focused: true, alwaysOnTop: false, incognito: false, type: 'normal', state: 'normal' });
  });
}

function mockTabsCreate(tabId = 100) {
  let nextId = tabId;
  chrome.tabs.create.mockImplementation((params: unknown, callback: (tab: chrome.tabs.Tab) => void) => {
    const p = params as { url?: string; pinned?: boolean; windowId?: number; active?: boolean };
    callback({
      id: nextId++,
      index: 0,
      windowId: p.windowId ?? 1,
      highlighted: false,
      active: p.active ?? false,
      pinned: p.pinned ?? false,
      incognito: false,
      selected: false,
      groupId: -1,
      url: p.url ?? '',
      title: '',
    });
  });
}

function mockTabsGroup(groupId = 20) {
  chrome.tabs.group.mockImplementation((_options: unknown, callback: (id: number) => void) => {
    callback(groupId);
  });
}

function mockTabGroupsUpdate() {
  chrome.tabGroups.update.mockImplementation((_id: unknown, _update: unknown, callback?: (group: chrome.tabGroups.TabGroup) => void) => {
    callback?.({} as chrome.tabGroups.TabGroup);
  });
}

const baseState: SavedState = {
  savedAt: 1000,
  ungroupedTabs: [
    { url: 'https://example.com', title: 'Example', pinned: false, index: 0 },
    { url: 'https://other.com', title: 'Other', pinned: true, index: 1 },
  ],
  groups: [
    {
      title: 'Work',
      color: 'blue',
      collapsed: false,
      tabs: [
        { url: 'https://work1.com', title: 'Work 1', pinned: false, index: 2 },
        { url: 'https://work2.com', title: 'Work 2', pinned: false, index: 3 },
      ],
    },
    {
      title: 'Personal',
      color: 'green',
      collapsed: true,
      tabs: [
        { url: 'https://personal.com', title: 'Personal', pinned: false, index: 4 },
      ],
    },
  ],
};

describe('session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorageGet(null);
  });

  describe('saveAll', () => {
    it('with no existing state creates state from scratch', async () => {
      const tabs: chrome.tabs.Tab[] = [
        { id: 1, index: 0, windowId: 1, highlighted: false, active: true, pinned: false, incognito: false, selected: false, groupId: -1, url: 'https://ungrouped.com', title: 'Ungrouped' },
        { id: 2, index: 1, windowId: 1, highlighted: false, active: false, pinned: false, incognito: false, selected: false, groupId: 10, url: 'https://work.com', title: 'Work' },
      ];
      const groups: chrome.tabGroups.TabGroup[] = [
        { id: 10, windowId: 1, title: 'Work', color: 'blue' as chrome.tabGroups.ColorEnum, collapsed: false },
      ];
      chrome.tabs.query.mockImplementation((_q: unknown, cb: (tabs: chrome.tabs.Tab[]) => void) => cb(tabs));
      chrome.tabGroups.query.mockImplementation((_q: unknown, cb: (groups: chrome.tabGroups.TabGroup[]) => void) => cb(groups));
      mockStorageSet();

      await saveAll();

      const savedData = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(savedData.savedState.groups).toHaveLength(1);
      expect(savedData.savedState.groups[0].title).toBe('Work');
      expect(savedData.savedState.ungroupedTabs).toEqual([
        { url: 'https://ungrouped.com', title: 'Ungrouped', pinned: false, index: 0 },
      ]);
    });

    it('queries all tabs and groups', async () => {
      chrome.tabs.query.mockImplementation((_q: unknown, cb: (tabs: chrome.tabs.Tab[]) => void) => cb([]));
      chrome.tabGroups.query.mockImplementation((_q: unknown, cb: (groups: chrome.tabGroups.TabGroup[]) => void) => cb([]));
      mockStorageSet();

      await saveAll();

      expect(chrome.tabs.query).toHaveBeenCalledWith({}, expect.any(Function));
      expect(chrome.tabGroups.query).toHaveBeenCalledWith({}, expect.any(Function));
    });

    it('saves ungrouped tabs (groupId === -1)', async () => {
      const tabs: chrome.tabs.Tab[] = [
        { id: 1, index: 0, windowId: 1, highlighted: false, active: true, pinned: false, incognito: false, selected: false, groupId: -1, url: 'https://a.com', title: 'A' },
        { id: 2, index: 1, windowId: 1, highlighted: false, active: false, pinned: true, incognito: false, selected: false, groupId: -1, url: 'https://b.com', title: 'B' },
      ];
      chrome.tabs.query.mockImplementation((_q: unknown, cb: (tabs: chrome.tabs.Tab[]) => void) => cb(tabs));
      chrome.tabGroups.query.mockImplementation((_q: unknown, cb: (groups: chrome.tabGroups.TabGroup[]) => void) => cb([]));
      mockStorageSet();

      await saveAll();

      const savedData = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(savedData.savedState.ungroupedTabs).toHaveLength(2);
      expect(savedData.savedState.ungroupedTabs[0]).toEqual({
        url: 'https://a.com', title: 'A', pinned: false, index: 0,
      });
    });

    it('groups tabs by their group and sorts by index', async () => {
      const tabs: chrome.tabs.Tab[] = [
        { id: 1, index: 3, windowId: 1, highlighted: false, active: false, pinned: false, incognito: false, selected: false, groupId: 10, url: 'https://w2.com', title: 'W2' },
        { id: 2, index: 1, windowId: 1, highlighted: false, active: false, pinned: false, incognito: false, selected: false, groupId: 10, url: 'https://w1.com', title: 'W1' },
      ];
      const groups: chrome.tabGroups.TabGroup[] = [
        { id: 10, windowId: 1, title: 'Work', color: 'blue' as chrome.tabGroups.ColorEnum, collapsed: false },
      ];
      chrome.tabs.query.mockImplementation((_q: unknown, cb: (tabs: chrome.tabs.Tab[]) => void) => cb(tabs));
      chrome.tabGroups.query.mockImplementation((_q: unknown, cb: (groups: chrome.tabGroups.TabGroup[]) => void) => cb(groups));
      mockStorageSet();

      await saveAll();

      const savedData = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const savedGroup = savedData.savedState.groups[0];
      expect(savedGroup.title).toBe('Work');
      expect(savedGroup.color).toBe('blue');
      expect(savedGroup.collapsed).toBe(false);
      // Tabs sorted by index: W1 (index 1) before W2 (index 3)
      expect(savedGroup.tabs[0].url).toBe('https://w1.com');
      expect(savedGroup.tabs[1].url).toBe('https://w2.com');
    });

    it('includes savedAt timestamp', async () => {
      vi.setSystemTime(5000);
      chrome.tabs.query.mockImplementation((_q: unknown, cb: (tabs: chrome.tabs.Tab[]) => void) => cb([]));
      chrome.tabGroups.query.mockImplementation((_q: unknown, cb: (groups: chrome.tabGroups.TabGroup[]) => void) => cb([]));
      mockStorageSet();

      await saveAll();

      const savedData = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(savedData.savedState.savedAt).toBe(5000);
      vi.useRealTimers();
    });

    it('separates grouped tabs from ungrouped tabs when both are present', async () => {
      const tabs: chrome.tabs.Tab[] = [
        { id: 1, index: 0, windowId: 1, highlighted: false, active: true, pinned: false, incognito: false, selected: false, groupId: -1, url: 'https://ungrouped.com', title: 'Ungrouped' },
        { id: 2, index: 1, windowId: 1, highlighted: false, active: false, pinned: false, incognito: false, selected: false, groupId: 10, url: 'https://grouped.com', title: 'Grouped' },
      ];
      const groups: chrome.tabGroups.TabGroup[] = [
        { id: 10, windowId: 1, title: 'Work', color: 'blue' as chrome.tabGroups.ColorEnum, collapsed: false },
      ];
      chrome.tabs.query.mockImplementation((_q: unknown, cb: (tabs: chrome.tabs.Tab[]) => void) => cb(tabs));
      chrome.tabGroups.query.mockImplementation((_q: unknown, cb: (groups: chrome.tabGroups.TabGroup[]) => void) => cb(groups));
      mockStorageSet();

      await saveAll();

      const savedData = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // Ungrouped tabs must contain only the ungrouped tab
      expect(savedData.savedState.ungroupedTabs).toHaveLength(1);
      expect(savedData.savedState.ungroupedTabs[0].url).toBe('https://ungrouped.com');
      // Groups must contain only the grouped tab
      expect(savedData.savedState.groups).toHaveLength(1);
      expect(savedData.savedState.groups[0].tabs).toHaveLength(1);
      expect(savedData.savedState.groups[0].tabs[0].url).toBe('https://grouped.com');
    });

    it('returns null on success', async () => {
      chrome.tabs.query.mockImplementation((_q: unknown, cb: (tabs: chrome.tabs.Tab[]) => void) => cb([]));
      chrome.tabGroups.query.mockImplementation((_q: unknown, cb: (groups: chrome.tabGroups.TabGroup[]) => void) => cb([]));
      mockStorageSet();

      const result = await saveAll();
      expect(result).toBeNull();
    });

    it('updates matching open group but leaves unmatched saved groups untouched', async () => {
      const tabs: chrome.tabs.Tab[] = [
        { id: 1, index: 0, windowId: 1, highlighted: false, active: false, pinned: false, incognito: false, selected: false, groupId: 10, url: 'https://new-work.com', title: 'New Work' },
      ];
      const groups: chrome.tabGroups.TabGroup[] = [
        { id: 10, windowId: 1, title: 'Work', color: 'red' as chrome.tabGroups.ColorEnum, collapsed: true },
      ];
      mockStorageGet(baseState);
      chrome.tabs.query.mockImplementation((_q: unknown, cb: (tabs: chrome.tabs.Tab[]) => void) => cb(tabs));
      chrome.tabGroups.query.mockImplementation((_q: unknown, cb: (groups: chrome.tabGroups.TabGroup[]) => void) => cb(groups));
      mockStorageSet();

      await saveAll();

      const savedData = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const savedGroups = savedData.savedState.groups;
      const work = savedGroups.find((g: { title: string }) => g.title === 'Work');
      const personal = savedGroups.find((g: { title: string }) => g.title === 'Personal');

      expect(savedGroups).toHaveLength(2);
      expect(work).toBeDefined();
      expect(personal).toBeDefined();
      expect(work!.color).toBe('red');
      expect(work!.collapsed).toBe(true);
      expect(work!.tabs[0].url).toBe('https://new-work.com');
      expect(personal!.tabs[0].url).toBe('https://personal.com');
    });

    it('adds currently open groups that are not already saved', async () => {
      const existingState: SavedState = {
        savedAt: 1000,
        ungroupedTabs: [],
        groups: [
          {
            title: 'Old',
            color: 'grey',
            collapsed: false,
            tabs: [{ url: 'https://old.com', title: 'Old', pinned: false, index: 0 }],
          },
        ],
      };
      const tabs: chrome.tabs.Tab[] = [
        { id: 1, index: 1, windowId: 1, highlighted: false, active: false, pinned: false, incognito: false, selected: false, groupId: 20, url: 'https://new.com', title: 'New' },
      ];
      const groups: chrome.tabGroups.TabGroup[] = [
        { id: 20, windowId: 1, title: 'New', color: 'green' as chrome.tabGroups.ColorEnum, collapsed: false },
      ];
      mockStorageGet(existingState);
      chrome.tabs.query.mockImplementation((_q: unknown, cb: (tabs: chrome.tabs.Tab[]) => void) => cb(tabs));
      chrome.tabGroups.query.mockImplementation((_q: unknown, cb: (groups: chrome.tabGroups.TabGroup[]) => void) => cb(groups));
      mockStorageSet();

      await saveAll();

      const savedData = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const savedGroups = savedData.savedState.groups;
      expect(savedGroups).toHaveLength(2);
      expect(savedGroups.find((g: { title: string }) => g.title === 'Old')).toBeDefined();
      expect(savedGroups.find((g: { title: string }) => g.title === 'New')).toBeDefined();
    });

    it('replaces ungroupedTabs with currently open ungrouped tabs', async () => {
      const tabs: chrome.tabs.Tab[] = [
        { id: 1, index: 0, windowId: 1, highlighted: false, active: true, pinned: false, incognito: false, selected: false, groupId: -1, url: 'https://fresh.com', title: 'Fresh' },
      ];
      mockStorageGet(baseState);
      chrome.tabs.query.mockImplementation((_q: unknown, cb: (tabs: chrome.tabs.Tab[]) => void) => cb(tabs));
      chrome.tabGroups.query.mockImplementation((_q: unknown, cb: (groups: chrome.tabGroups.TabGroup[]) => void) => cb([]));
      mockStorageSet();

      await saveAll();

      const savedData = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(savedData.savedState.ungroupedTabs).toEqual([
        { url: 'https://fresh.com', title: 'Fresh', pinned: false, index: 0 },
      ]);
    });
  });

  describe('restoreAll', () => {
    it('returns null (no-op) when no state is saved', async () => {
      mockStorageGet(null);

      const result = await restoreAll();
      expect(result).toBeNull();
      expect(chrome.tabs.create).not.toHaveBeenCalled();
    });

    it('creates ungrouped tabs', async () => {
      mockStorageGet(baseState);
      mockWindowsGetCurrent(1);
      mockTabsCreate(100);
      mockTabsGroup();
      mockTabGroupsUpdate();

      await restoreAll();

      const createCalls = (chrome.tabs.create as ReturnType<typeof vi.fn>).mock.calls;
      const urlsCreated = createCalls.map((call: unknown[]) => (call[0] as { url?: string }).url);
      expect(urlsCreated).toContain('https://example.com');
      expect(urlsCreated).toContain('https://other.com');
    });

    it('creates tabs as inactive', async () => {
      mockStorageGet({
        ...baseState,
        ungroupedTabs: [{ url: 'https://x.com', title: 'X', pinned: false, index: 0 }],
        groups: [],
      });
      mockWindowsGetCurrent(1);
      mockTabsCreate();

      await restoreAll();

      const createCall = (chrome.tabs.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as { active: boolean };
      expect(createCall.active).toBe(false);
    });

    it('creates tabs for each group', async () => {
      mockStorageGet(baseState);
      mockWindowsGetCurrent(1);
      mockTabsCreate(100);
      mockTabsGroup();
      mockTabGroupsUpdate();

      await restoreAll();

      const createCalls = (chrome.tabs.create as ReturnType<typeof vi.fn>).mock.calls;
      const urlsCreated = createCalls.map((call: unknown[]) => (call[0] as { url?: string }).url);
      expect(urlsCreated).toContain('https://work1.com');
      expect(urlsCreated).toContain('https://work2.com');
      expect(urlsCreated).toContain('https://personal.com');
    });

    it('groups created tabs and updates group metadata', async () => {
      mockStorageGet({
        ...baseState,
        ungroupedTabs: [],
        groups: [{
          title: 'Work',
          color: 'blue',
          collapsed: false,
          tabs: [
            { url: 'https://w1.com', title: 'W1', pinned: false, index: 0 },
            { url: 'https://w2.com', title: 'W2', pinned: false, index: 1 },
          ],
        }],
      });
      mockWindowsGetCurrent(1);
      mockTabsCreate(100);
      mockTabsGroup(20);
      mockTabGroupsUpdate();

      await restoreAll();

      expect(chrome.tabs.group).toHaveBeenCalled();
      expect(chrome.tabGroups.update).toHaveBeenCalledWith(
        20,
        { title: 'Work', color: 'blue', collapsed: false },
        expect.any(Function)
      );
    });

    it('returns null on success', async () => {
      mockStorageGet(baseState);
      mockWindowsGetCurrent(1);
      mockTabsCreate();
      mockTabsGroup();
      mockTabGroupsUpdate();

      const result = await restoreAll();
      expect(result).toBeNull();
    });
  });

  describe('restoreGroup', () => {
    it('returns error if no state is saved', async () => {
      mockStorageGet(null);

      const result = await restoreGroup('Work');
      expect(result).toEqual({ error: 'No saved group named "Work"' });
    });

    it('returns error if group not found by title', async () => {
      mockStorageGet(baseState);

      const result = await restoreGroup('NonExistent');
      expect(result).toEqual({ error: 'No saved group named "NonExistent"' });
    });

    it('creates tabs for the group and groups them', async () => {
      mockStorageGet(baseState);
      mockWindowsGetCurrent(1);
      mockTabsCreate(100);
      mockTabsGroup(20);
      mockTabGroupsUpdate();

      await restoreGroup('Work');

      const createCalls = (chrome.tabs.create as ReturnType<typeof vi.fn>).mock.calls;
      const urlsCreated = createCalls.map((call: unknown[]) => (call[0] as { url?: string }).url);
      expect(urlsCreated).toContain('https://work1.com');
      expect(urlsCreated).toContain('https://work2.com');
      // Should NOT create personal tabs
      expect(urlsCreated).not.toContain('https://personal.com');
    });

    it('updates group metadata after grouping', async () => {
      mockStorageGet(baseState);
      mockWindowsGetCurrent(1);
      mockTabsCreate(100);
      mockTabsGroup(20);
      mockTabGroupsUpdate();

      await restoreGroup('Work');

      expect(chrome.tabGroups.update).toHaveBeenCalledWith(
        20,
        { title: 'Work', color: 'blue', collapsed: false },
        expect.any(Function)
      );
    });

    it('returns null on success', async () => {
      mockStorageGet(baseState);
      mockWindowsGetCurrent(1);
      mockTabsCreate();
      mockTabsGroup();
      mockTabGroupsUpdate();

      const result = await restoreGroup('Work');
      expect(result).toBeNull();
    });
  });

  describe('restoreTab', () => {
    it('returns error if no state is saved', async () => {
      mockStorageGet(null);

      const result = await restoreTab('https://example.com');
      expect(result).toEqual({ error: 'No saved tab with URL "https://example.com"' });
    });

    it('returns error if tab url not found in ungrouped tabs', async () => {
      mockStorageGet(baseState);

      const result = await restoreTab('https://notfound.com');
      expect(result).toEqual({ error: 'No saved tab with URL "https://notfound.com"' });
    });

    it('does not restore tabs that are in groups', async () => {
      mockStorageGet(baseState);

      // work1.com is in a group, not ungrouped
      const result = await restoreTab('https://work1.com');
      expect(result).toEqual({ error: 'No saved tab with URL "https://work1.com"' });
    });

    it('creates the matching ungrouped tab', async () => {
      mockStorageGet(baseState);
      mockWindowsGetCurrent(1);
      mockTabsCreate();

      await restoreTab('https://example.com');

      expect(chrome.tabs.create).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://example.com' }),
        expect.any(Function)
      );
    });

    it('returns null on success', async () => {
      mockStorageGet(baseState);
      mockWindowsGetCurrent(1);
      mockTabsCreate();

      const result = await restoreTab('https://example.com');
      expect(result).toBeNull();
    });
  });

  describe('removeGroup', () => {
    it('returns null (no-op) when no state is saved', async () => {
      mockStorageGet(null);

      const result = await removeGroup('Work');
      expect(result).toBeNull();
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });

    it('removes the group with matching title', async () => {
      mockStorageGet(baseState);
      mockStorageSet();

      await removeGroup('Work');

      const savedData = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const remainingGroups = savedData.savedState.groups;
      expect(remainingGroups.find((g: { title: string }) => g.title === 'Work')).toBeUndefined();
      expect(remainingGroups.find((g: { title: string }) => g.title === 'Personal')).toBeDefined();
    });

    it('returns null on success', async () => {
      mockStorageGet(baseState);
      mockStorageSet();

      const result = await removeGroup('Work');
      expect(result).toBeNull();
    });

    it('is a no-op if group title does not exist', async () => {
      mockStorageGet(baseState);
      mockStorageSet();

      await removeGroup('NonExistent');

      const savedData = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(savedData.savedState.groups).toHaveLength(2);
    });
  });

  describe('removeTab', () => {
    it('returns null (no-op) when no state is saved', async () => {
      mockStorageGet(null);

      const result = await removeTab('https://example.com');
      expect(result).toBeNull();
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });

    it('removes the ungrouped tab with matching url', async () => {
      mockStorageGet(baseState);
      mockStorageSet();

      await removeTab('https://example.com');

      const savedData = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const remainingTabs = savedData.savedState.ungroupedTabs;
      expect(remainingTabs.find((t: { url: string }) => t.url === 'https://example.com')).toBeUndefined();
      expect(remainingTabs.find((t: { url: string }) => t.url === 'https://other.com')).toBeDefined();
    });

    it('returns null on success', async () => {
      mockStorageGet(baseState);
      mockStorageSet();

      const result = await removeTab('https://example.com');
      expect(result).toBeNull();
    });

    it('is a no-op if tab url does not exist', async () => {
      mockStorageGet(baseState);
      mockStorageSet();

      await removeTab('https://notfound.com');

      const savedData = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(savedData.savedState.ungroupedTabs).toHaveLength(2);
    });
  });

  describe('resaveGroup', () => {
    it('returns error if no live group with matching title', async () => {
      chrome.tabGroups.query.mockImplementation((_q: unknown, cb: (groups: chrome.tabGroups.TabGroup[]) => void) => {
        cb([{ id: 10, windowId: 1, title: 'Other', color: 'red' as chrome.tabGroups.ColorEnum, collapsed: false }]);
      });

      const result = await resaveGroup('Work');
      expect(result).toEqual({ error: 'No open group named "Work"' });
    });

    it('returns error if no groups exist', async () => {
      chrome.tabGroups.query.mockImplementation((_q: unknown, cb: (groups: chrome.tabGroups.TabGroup[]) => void) => {
        cb([]);
      });

      const result = await resaveGroup('Work');
      expect(result).toEqual({ error: 'No open group named "Work"' });
    });

    it('uses the first matching group when multiple exist with same title', async () => {
      chrome.tabGroups.query.mockImplementation((_q: unknown, cb: (groups: chrome.tabGroups.TabGroup[]) => void) => {
        cb([
          { id: 10, windowId: 1, title: 'Work', color: 'blue' as chrome.tabGroups.ColorEnum, collapsed: false },
          { id: 11, windowId: 1, title: 'Work', color: 'red' as chrome.tabGroups.ColorEnum, collapsed: true },
        ]);
      });
      chrome.tabs.query.mockImplementation((_q: unknown, cb: (tabs: chrome.tabs.Tab[]) => void) => {
        cb([{ id: 1, index: 0, windowId: 1, highlighted: false, active: false, pinned: false, incognito: false, selected: false, groupId: 10, url: 'https://w.com', title: 'W' }]);
      });
      mockStorageGet(null);
      mockStorageSet();

      await resaveGroup('Work');

      const savedData = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(savedData.savedState.groups[0].color).toBe('blue'); // first group color
    });

    it('creates new state if no prior state exists', async () => {
      chrome.tabGroups.query.mockImplementation((_q: unknown, cb: (groups: chrome.tabGroups.TabGroup[]) => void) => {
        cb([{ id: 10, windowId: 1, title: 'Work', color: 'blue' as chrome.tabGroups.ColorEnum, collapsed: false }]);
      });
      chrome.tabs.query.mockImplementation((_q: unknown, cb: (tabs: chrome.tabs.Tab[]) => void) => {
        cb([
          { id: 1, index: 0, windowId: 1, highlighted: false, active: false, pinned: false, incognito: false, selected: false, groupId: 10, url: 'https://w1.com', title: 'W1' },
          { id: 2, index: 1, windowId: 1, highlighted: false, active: false, pinned: false, incognito: false, selected: false, groupId: 10, url: 'https://w2.com', title: 'W2' },
        ]);
      });
      mockStorageGet(null);
      mockStorageSet();

      await resaveGroup('Work');

      const savedData = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(savedData.savedState.groups).toHaveLength(1);
      expect(savedData.savedState.groups[0].title).toBe('Work');
      expect(savedData.savedState.groups[0].tabs).toHaveLength(2);
    });

    it('replaces existing saved group with same title', async () => {
      chrome.tabGroups.query.mockImplementation((_q: unknown, cb: (groups: chrome.tabGroups.TabGroup[]) => void) => {
        cb([{ id: 10, windowId: 1, title: 'Work', color: 'red' as chrome.tabGroups.ColorEnum, collapsed: true }]);
      });
      chrome.tabs.query.mockImplementation((_q: unknown, cb: (tabs: chrome.tabs.Tab[]) => void) => {
        cb([
          { id: 1, index: 0, windowId: 1, highlighted: false, active: false, pinned: false, incognito: false, selected: false, groupId: 10, url: 'https://newwork.com', title: 'New Work' },
        ]);
      });
      mockStorageGet(baseState); // baseState has a 'Work' group
      mockStorageSet();

      await resaveGroup('Work');

      const savedData = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const workGroups = savedData.savedState.groups.filter((g: { title: string }) => g.title === 'Work');
      expect(workGroups).toHaveLength(1);
      expect(workGroups[0].tabs[0].url).toBe('https://newwork.com');
      expect(workGroups[0].color).toBe('red'); // updated color
    });

    it('appends new group if title not previously saved', async () => {
      chrome.tabGroups.query.mockImplementation((_q: unknown, cb: (groups: chrome.tabGroups.TabGroup[]) => void) => {
        cb([{ id: 10, windowId: 1, title: 'NewGroup', color: 'purple' as chrome.tabGroups.ColorEnum, collapsed: false }]);
      });
      chrome.tabs.query.mockImplementation((_q: unknown, cb: (tabs: chrome.tabs.Tab[]) => void) => {
        cb([
          { id: 1, index: 0, windowId: 1, highlighted: false, active: false, pinned: false, incognito: false, selected: false, groupId: 10, url: 'https://new.com', title: 'New' },
        ]);
      });
      mockStorageGet(baseState); // baseState has Work + Personal
      mockStorageSet();

      await resaveGroup('NewGroup');

      const savedData = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(savedData.savedState.groups).toHaveLength(3); // Work + Personal + NewGroup
    });

    it('sorts group tabs by index', async () => {
      chrome.tabGroups.query.mockImplementation((_q: unknown, cb: (groups: chrome.tabGroups.TabGroup[]) => void) => {
        cb([{ id: 10, windowId: 1, title: 'Work', color: 'blue' as chrome.tabGroups.ColorEnum, collapsed: false }]);
      });
      chrome.tabs.query.mockImplementation((_q: unknown, cb: (tabs: chrome.tabs.Tab[]) => void) => {
        cb([
          { id: 1, index: 5, windowId: 1, highlighted: false, active: false, pinned: false, incognito: false, selected: false, groupId: 10, url: 'https://z.com', title: 'Z' },
          { id: 2, index: 2, windowId: 1, highlighted: false, active: false, pinned: false, incognito: false, selected: false, groupId: 10, url: 'https://a.com', title: 'A' },
        ]);
      });
      mockStorageGet(null);
      mockStorageSet();

      await resaveGroup('Work');

      const savedData = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const tabs = savedData.savedState.groups[0].tabs;
      expect(tabs[0].url).toBe('https://a.com'); // index 2 comes first
      expect(tabs[1].url).toBe('https://z.com'); // index 5 comes second
    });

    it('returns null on success', async () => {
      chrome.tabGroups.query.mockImplementation((_q: unknown, cb: (groups: chrome.tabGroups.TabGroup[]) => void) => {
        cb([{ id: 10, windowId: 1, title: 'Work', color: 'blue' as chrome.tabGroups.ColorEnum, collapsed: false }]);
      });
      chrome.tabs.query.mockImplementation((_q: unknown, cb: (tabs: chrome.tabs.Tab[]) => void) => {
        cb([{ id: 1, index: 0, windowId: 1, highlighted: false, active: false, pinned: false, incognito: false, selected: false, groupId: 10, url: 'https://w.com', title: 'W' }]);
      });
      mockStorageGet(null);
      mockStorageSet();

      const result = await resaveGroup('Work');
      expect(result).toBeNull();
    });
  });
});
