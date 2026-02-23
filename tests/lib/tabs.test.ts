import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queryAllTabs, createTab } from '../../src/lib/tabs';

const mockTab: chrome.tabs.Tab = {
  id: 1,
  index: 0,
  windowId: 1,
  highlighted: false,
  active: false,
  pinned: false,
  incognito: false,
  selected: false,
  groupId: -1,
  url: 'https://example.com',
  title: 'Example',
};

describe('tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('queryAllTabs', () => {
    it('calls chrome.tabs.query with empty query object', async () => {
      chrome.tabs.query.mockImplementation((_query: unknown, callback: (tabs: chrome.tabs.Tab[]) => void) => {
        callback([]);
      });

      await queryAllTabs();

      expect(chrome.tabs.query).toHaveBeenCalledWith({}, expect.any(Function));
    });

    it('returns all tabs', async () => {
      const mockTabs = [mockTab, { ...mockTab, id: 2, index: 1 }];

      chrome.tabs.query.mockImplementation((_query: unknown, callback: (tabs: chrome.tabs.Tab[]) => void) => {
        callback(mockTabs);
      });

      const result = await queryAllTabs();
      expect(result).toEqual(mockTabs);
    });

    it('returns empty array when no tabs', async () => {
      chrome.tabs.query.mockImplementation((_query: unknown, callback: (tabs: chrome.tabs.Tab[]) => void) => {
        callback([]);
      });

      const result = await queryAllTabs();
      expect(result).toEqual([]);
    });
  });

  describe('createTab', () => {
    it('calls chrome.tabs.create with correct params', async () => {
      chrome.tabs.create.mockImplementation((_params: unknown, callback: (tab: chrome.tabs.Tab) => void) => {
        callback(mockTab);
      });

      const params = {
        url: 'https://example.com',
        pinned: false,
        windowId: 1,
        active: false,
      };

      await createTab(params);

      expect(chrome.tabs.create).toHaveBeenCalledWith(params, expect.any(Function));
    });

    it('returns the created tab', async () => {
      chrome.tabs.create.mockImplementation((_params: unknown, callback: (tab: chrome.tabs.Tab) => void) => {
        callback(mockTab);
      });

      const result = await createTab({
        url: 'https://example.com',
        pinned: false,
        windowId: 1,
        active: false,
      });

      expect(result).toEqual(mockTab);
    });

    it('creates a pinned tab correctly', async () => {
      const pinnedTab = { ...mockTab, pinned: true };
      chrome.tabs.create.mockImplementation((_params: unknown, callback: (tab: chrome.tabs.Tab) => void) => {
        callback(pinnedTab);
      });

      const result = await createTab({
        url: 'https://example.com',
        pinned: true,
        windowId: 1,
        active: false,
      });

      expect(result.pinned).toBe(true);
    });
  });
});
