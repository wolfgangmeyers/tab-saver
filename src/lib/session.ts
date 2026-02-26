import type { SavedState, SavedGroup, SavedTab } from './types';
import { loadState, saveState } from './storage';
import { queryAllTabs, createTab } from './tabs';
import { queryAllGroups, groupTabs, updateGroup } from './groups';

type ErrorResult = { error: string };
type Result = null | ErrorResult;

function tabToSavedTab(tab: chrome.tabs.Tab): SavedTab {
  return {
    url: tab.url ?? '',
    title: tab.title ?? '',
    pinned: tab.pinned,
    index: tab.index,
  };
}

function getCurrentWindowId(): Promise<number> {
  return new Promise((resolve, reject) => {
    chrome.windows.getCurrent((window) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (window.id === undefined) {
        reject(new Error('Current window has no id'));
        return;
      }
      resolve(window.id);
    });
  });
}

export async function saveAll(): Promise<Result> {
  try {
    const [existingState, tabs, groups] = await Promise.all([loadState(), queryAllTabs(), queryAllGroups()]);

    const ungroupedTabs: SavedTab[] = tabs
      .filter((tab) => tab.groupId === -1)
      .map(tabToSavedTab);

    const openGroups: SavedGroup[] = groups.map((group) => {
      const groupTabsRaw = tabs
        .filter((tab) => tab.groupId === group.id)
        .sort((a, b) => a.index - b.index);

      return {
        title: group.title ?? '',
        color: group.color as SavedGroup['color'],
        collapsed: group.collapsed,
        tabs: groupTabsRaw.map(tabToSavedTab),
      };
    });

    const baseGroups = existingState?.groups ?? [];
    const mergedGroups = [...baseGroups];

    for (const openGroup of openGroups) {
      const existingIndex = mergedGroups.findIndex((group) => group.title === openGroup.title);
      if (existingIndex >= 0) {
        mergedGroups[existingIndex] = openGroup;
      } else {
        mergedGroups.push(openGroup);
      }
    }

    const state: SavedState = {
      savedAt: Date.now(),
      ungroupedTabs,
      groups: mergedGroups,
    };

    await saveState(state);
    return null;
  } catch (err) {
    return { error: String(err) };
  }
}

export async function restoreAll(): Promise<Result> {
  try {
    const state = await loadState();
    if (!state) return null;

    const windowId = await getCurrentWindowId();

    // Create ungrouped tabs
    for (const tab of state.ungroupedTabs) {
      await createTab({ url: tab.url, pinned: tab.pinned, windowId, active: false });
    }

    // Create grouped tabs
    for (const group of state.groups) {
      const createdTabs = [];
      for (const tab of group.tabs) {
        const created = await createTab({ url: tab.url, pinned: tab.pinned, windowId, active: false });
        createdTabs.push(created);
      }
      const tabIds = createdTabs.map((t) => t.id!);
      const groupId = await groupTabs(tabIds, windowId);
      await updateGroup(groupId, { title: group.title, color: group.color, collapsed: group.collapsed });
    }

    return null;
  } catch (err) {
    return { error: String(err) };
  }
}

export async function restoreGroup(title: string): Promise<Result> {
  try {
    const state = await loadState();
    const group = state?.groups.find((g) => g.title === title);

    if (!group) {
      return { error: `No saved group named "${title}"` };
    }

    const windowId = await getCurrentWindowId();

    const createdTabs = [];
    for (const tab of group.tabs) {
      const created = await createTab({ url: tab.url, pinned: tab.pinned, windowId, active: false });
      createdTabs.push(created);
    }
    const tabIds = createdTabs.map((t) => t.id!);
    const groupId = await groupTabs(tabIds, windowId);
    await updateGroup(groupId, { title: group.title, color: group.color, collapsed: group.collapsed });

    return null;
  } catch (err) {
    return { error: String(err) };
  }
}

export async function restoreTab(url: string): Promise<Result> {
  try {
    const state = await loadState();
    const tab = state?.ungroupedTabs.find((t) => t.url === url);

    if (!tab) {
      return { error: `No saved tab with URL "${url}"` };
    }

    const windowId = await getCurrentWindowId();
    await createTab({ url: tab.url, pinned: tab.pinned, windowId, active: false });

    return null;
  } catch (err) {
    return { error: String(err) };
  }
}

export async function removeGroup(title: string): Promise<Result> {
  try {
    const state = await loadState();
    if (!state) return null;

    const updatedState: SavedState = {
      ...state,
      groups: state.groups.filter((g) => g.title !== title),
    };

    await saveState(updatedState);
    return null;
  } catch (err) {
    return { error: String(err) };
  }
}

export async function removeTab(url: string): Promise<Result> {
  try {
    const state = await loadState();
    if (!state) return null;

    const updatedState: SavedState = {
      ...state,
      ungroupedTabs: state.ungroupedTabs.filter((t) => t.url !== url),
    };

    await saveState(updatedState);
    return null;
  } catch (err) {
    return { error: String(err) };
  }
}

export async function resaveGroup(title: string): Promise<Result> {
  try {
    const liveGroups = await queryAllGroups();
    const liveGroup = liveGroups.find((g) => g.title === title);

    if (!liveGroup) {
      return { error: `No open group named "${title}"` };
    }

    const allTabs = await queryAllTabs();
    const groupTabsRaw = allTabs
      .filter((tab) => tab.groupId === liveGroup.id)
      .sort((a, b) => a.index - b.index);

    const newSavedGroup: SavedGroup = {
      title: liveGroup.title ?? '',
      color: liveGroup.color as SavedGroup['color'],
      collapsed: liveGroup.collapsed,
      tabs: groupTabsRaw.map(tabToSavedTab),
    };

    const existingState = await loadState();
    const baseGroups = existingState?.groups ?? [];
    const existingIndex = baseGroups.findIndex((g) => g.title === title);

    let updatedGroups: SavedGroup[];
    if (existingIndex >= 0) {
      updatedGroups = [...baseGroups];
      updatedGroups[existingIndex] = newSavedGroup;
    } else {
      updatedGroups = [...baseGroups, newSavedGroup];
    }

    const updatedState: SavedState = {
      savedAt: existingState?.savedAt ?? Date.now(),
      ungroupedTabs: existingState?.ungroupedTabs ?? [],
      groups: updatedGroups,
    };

    await saveState(updatedState);
    return null;
  } catch (err) {
    return { error: String(err) };
  }
}

export async function saveTab(url: string, title: string, pinned: boolean): Promise<Result> {
  try {
    const state = await loadState();
    const base = state ?? { savedAt: Date.now(), ungroupedTabs: [], groups: [] };
    const tab: SavedTab = { url, title, pinned, index: 0 };
    const existing = base.ungroupedTabs.findIndex((t) => t.url === url);
    const updatedTabs =
      existing >= 0
        ? base.ungroupedTabs.map((t, i) => (i === existing ? tab : t))
        : [...base.ungroupedTabs, tab];
    await saveState({ ...base, ungroupedTabs: updatedTabs });
    return null;
  } catch (err) {
    return { error: String(err) };
  }
}
