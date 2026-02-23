import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queryAllGroups, groupTabs, updateGroup } from '../../src/lib/groups';
import type { TabGroupColor } from '../../src/lib/types';

const mockGroup: chrome.tabGroups.TabGroup = {
  id: 10,
  windowId: 1,
  title: 'Work',
  color: 'blue' as chrome.tabGroups.ColorEnum,
  collapsed: false,
};

describe('groups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('queryAllGroups', () => {
    it('calls chrome.tabGroups.query with empty query', async () => {
      chrome.tabGroups.query.mockImplementation((_query: unknown, callback: (groups: chrome.tabGroups.TabGroup[]) => void) => {
        callback([]);
      });

      await queryAllGroups();

      expect(chrome.tabGroups.query).toHaveBeenCalledWith({}, expect.any(Function));
    });

    it('returns all tab groups', async () => {
      const mockGroups = [mockGroup, { ...mockGroup, id: 11, title: 'Personal' }];

      chrome.tabGroups.query.mockImplementation((_query: unknown, callback: (groups: chrome.tabGroups.TabGroup[]) => void) => {
        callback(mockGroups);
      });

      const result = await queryAllGroups();
      expect(result).toEqual(mockGroups);
    });

    it('returns empty array when no groups', async () => {
      chrome.tabGroups.query.mockImplementation((_query: unknown, callback: (groups: chrome.tabGroups.TabGroup[]) => void) => {
        callback([]);
      });

      const result = await queryAllGroups();
      expect(result).toEqual([]);
    });
  });

  describe('groupTabs', () => {
    it('calls chrome.tabs.group with correct params', async () => {
      chrome.tabs.group.mockImplementation((_options: unknown, callback: (groupId: number) => void) => {
        callback(10);
      });

      await groupTabs([1, 2, 3], 1);

      expect(chrome.tabs.group).toHaveBeenCalledWith(
        { tabIds: [1, 2, 3], createProperties: { windowId: 1 } },
        expect.any(Function)
      );
    });

    it('returns the new group id', async () => {
      chrome.tabs.group.mockImplementation((_options: unknown, callback: (groupId: number) => void) => {
        callback(42);
      });

      const result = await groupTabs([1, 2], 1);
      expect(result).toBe(42);
    });
  });

  describe('updateGroup', () => {
    it('calls chrome.tabGroups.update with correct params', async () => {
      chrome.tabGroups.update.mockImplementation((_groupId: unknown, _options: unknown, callback?: (group: chrome.tabGroups.TabGroup) => void) => {
        callback?.(mockGroup);
      });

      await updateGroup(10, { title: 'Work', color: 'blue' as TabGroupColor, collapsed: false });

      expect(chrome.tabGroups.update).toHaveBeenCalledWith(
        10,
        { title: 'Work', color: 'blue', collapsed: false },
        expect.any(Function)
      );
    });

    it('resolves after updating', async () => {
      chrome.tabGroups.update.mockImplementation((_groupId: unknown, _options: unknown, callback?: (group: chrome.tabGroups.TabGroup) => void) => {
        callback?.(mockGroup);
      });

      await expect(
        updateGroup(10, { title: 'Work', color: 'blue' as TabGroupColor })
      ).resolves.toBeUndefined();
    });

    it('only passes provided update fields', async () => {
      chrome.tabGroups.update.mockImplementation((_groupId: unknown, _options: unknown, callback?: (group: chrome.tabGroups.TabGroup) => void) => {
        callback?.(mockGroup);
      });

      await updateGroup(10, { title: 'Work' });

      expect(chrome.tabGroups.update).toHaveBeenCalledWith(
        10,
        { title: 'Work' },
        expect.any(Function)
      );
    });
  });
});
