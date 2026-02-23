import type { TabGroupColor } from './types';

export function queryAllGroups(): Promise<chrome.tabGroups.TabGroup[]> {
  return new Promise((resolve, reject) => {
    chrome.tabGroups.query({}, (groups) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(groups);
    });
  });
}

export function groupTabs(tabIds: number[], windowId: number): Promise<number> {
  return new Promise((resolve, reject) => {
    chrome.tabs.group(
      { tabIds, createProperties: { windowId } },
      (groupId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(groupId);
      }
    );
  });
}

export function updateGroup(
  groupId: number,
  update: { title?: string; color?: TabGroupColor; collapsed?: boolean }
): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.tabGroups.update(groupId, update, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}
