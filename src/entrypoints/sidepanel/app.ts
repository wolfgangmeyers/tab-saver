import type { SavedTab } from '../../lib/types';
import { loadState } from '../../lib/storage';
import { queryAllTabs } from '../../lib/tabs';
import { queryAllGroups } from '../../lib/groups';
import {
  resaveGroup,
  removeGroup,
  removeTab,
  restoreGroup,
  restoreTab,
  saveTab,
} from '../../lib/session';

type SyncStatus = 'saved' | 'out-of-sync' | 'unsaved';

interface LiveGroup {
  id: number;
  title: string;
  color: string;
  collapsed: boolean;
  tabs: chrome.tabs.Tab[];
  syncStatus: SyncStatus;
  savedTabs: SavedTab[] | null;
}

interface LiveTab {
  tab: chrome.tabs.Tab;
  syncStatus: 'saved' | 'unsaved';
}

let errorMessage = '';
let allCollapsed = false;
let savedClosedCollapsed = true;
const groupExpanded = new Map<string, boolean>();

function setError(msg: string) {
  errorMessage = msg;
  render();
}

function clearError() {
  errorMessage = '';
}

function el(tag: string, attrs: Record<string, string> = {}, text?: string): HTMLElement {
  const elem = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') {
      elem.className = v;
    } else {
      elem.setAttribute(k, v);
    }
  }
  if (text !== undefined) elem.textContent = text;
  return elem;
}

function btn(text: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  b.className = className;
  b.addEventListener('click', onClick);
  return b;
}

function normalizeUrl(url: string | undefined): string {
  return url ?? '';
}

function uniqueSortedUrls(urls: string[]): string[] {
  return [...new Set(urls)].sort();
}

function urlsMatch(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((url, index) => url === right[index]);
}

function getBadge(status: SyncStatus | 'saved' | 'unsaved'): HTMLElement {
  if (status === 'saved') {
    return el('span', { className: 'badge badge-saved' }, 'Saved');
  }
  if (status === 'out-of-sync') {
    return el('span', { className: 'badge badge-out-of-sync' }, 'Out of sync');
  }
  return el('span', { className: 'badge badge-unsaved' }, 'Unsaved');
}

function ensureGroupExpansion(title: string) {
  if (!groupExpanded.has(title)) {
    groupExpanded.set(title, true);
  }
}

function groupIsExpanded(title: string): boolean {
  ensureGroupExpansion(title);
  return groupExpanded.get(title) ?? true;
}

function syncAllCollapsedState(groups: LiveGroup[]) {
  if (groups.length === 0) {
    allCollapsed = false;
    return;
  }
  allCollapsed = groups.every((group) => !groupIsExpanded(group.title));
}

async function buildLiveModel(): Promise<{
  liveGroups: LiveGroup[];
  liveUngroupedTabs: LiveTab[];
  closedGroups: { title: string; count: number }[];
  closedTabs: SavedTab[];
}> {
  const [state, tabs, groups] = await Promise.all([loadState(), queryAllTabs(), queryAllGroups()]);

  const savedGroups = state?.groups ?? [];
  const savedUngroupedTabs = state?.ungroupedTabs ?? [];
  const savedGroupByTitle = new Map(savedGroups.map((group) => [group.title, group]));
  const savedUngroupedUrlSet = new Set(savedUngroupedTabs.map((tab) => tab.url));

  const tabsByGroupId = new Map<number, chrome.tabs.Tab[]>();
  for (const tab of tabs) {
    if (tab.groupId === undefined || tab.groupId < 0) continue;
    const list = tabsByGroupId.get(tab.groupId) ?? [];
    list.push(tab);
    tabsByGroupId.set(tab.groupId, list);
  }

  const liveGroups: LiveGroup[] = groups.map((group) => {
    const title = group.title ?? '';
    const groupTabs = (tabsByGroupId.get(group.id) ?? []).sort((a, b) => a.index - b.index);
    const savedGroup = savedGroupByTitle.get(title);
    const liveUrls = uniqueSortedUrls(groupTabs.map((tab) => normalizeUrl(tab.url)));
    const savedUrls = uniqueSortedUrls((savedGroup?.tabs ?? []).map((tab) => tab.url));

    let syncStatus: SyncStatus = 'unsaved';
    if (savedGroup) {
      syncStatus = urlsMatch(liveUrls, savedUrls) ? 'saved' : 'out-of-sync';
    }

    ensureGroupExpansion(title);

    return {
      id: group.id,
      title,
      color: group.color,
      collapsed: group.collapsed,
      tabs: groupTabs,
      syncStatus,
      savedTabs: savedGroup?.tabs ?? null,
    };
  });

  const liveUngroupedTabs: LiveTab[] = tabs
    .filter((tab) => tab.groupId === -1)
    .sort((a, b) => a.index - b.index)
    .map((tab) => ({
      tab,
      syncStatus: savedUngroupedUrlSet.has(normalizeUrl(tab.url)) ? 'saved' : 'unsaved',
    }));

  const openGroupTitles = new Set(liveGroups.map((group) => group.title));
  const openTabUrls = new Set(tabs.map((tab) => normalizeUrl(tab.url)));

  const closedGroups = savedGroups
    .filter((group) => !openGroupTitles.has(group.title))
    .map((group) => ({ title: group.title, count: group.tabs.length }));

  const closedTabs = savedUngroupedTabs.filter((tab) => !openTabUrls.has(tab.url));

  return { liveGroups, liveUngroupedTabs, closedGroups, closedTabs };
}

function renderActionBar(liveGroups: LiveGroup[]): HTMLElement {
  const bar = el('div', { className: 'action-bar' });

  bar.appendChild(
    btn('Sync All Out of Sync', 'btn btn-warning', async () => {
      clearError();
      const outOfSyncGroups = liveGroups.filter((group) => group.syncStatus === 'out-of-sync');
      for (const group of outOfSyncGroups) {
        const result = await resaveGroup(group.title);
        if (result && 'error' in result) {
          setError(result.error);
          return;
        }
      }
      render();
    })
  );

  bar.appendChild(
    btn(allCollapsed ? 'Expand All' : 'Collapse All', 'btn', () => {
      allCollapsed = !allCollapsed;
      for (const group of liveGroups) {
        groupExpanded.set(group.title, !allCollapsed);
      }
      render();
    })
  );

  return bar;
}

function renderGroupsSection(liveGroups: LiveGroup[]): HTMLElement {
  const section = el('div', { className: 'section' });
  section.appendChild(el('div', { className: 'section-title' }, 'TAB GROUPS'));

  if (liveGroups.length === 0) {
    section.appendChild(el('div', { className: 'empty-msg' }, 'No open tab groups.'));
    return section;
  }

  for (const group of liveGroups) {
    const groupElem = el('div', { className: 'group' });
    const header = el('div', { className: 'group-header' });

    const left = el('div', { style: 'display:flex;align-items:center;min-width:0;' });
    const expanded = allCollapsed ? false : groupIsExpanded(group.title);
    const arrow = el('span', { className: 'collapse-arrow' }, expanded ? '▾' : '▸');
    arrow.addEventListener('click', () => {
      const next = !groupIsExpanded(group.title);
      groupExpanded.set(group.title, next);
      if (next) {
        allCollapsed = false;
      }
      render();
    });

    const dot = el('span', { className: `color-dot color-${group.color}` });
    const titleText = group.title || '(Untitled Group)';
    const title = el('span', { className: 'group-title' }, `${titleText} · ${group.tabs.length} tabs`);

    left.appendChild(arrow);
    left.appendChild(dot);
    left.appendChild(title);
    left.appendChild(getBadge(group.syncStatus));

    const actions = el('div', { className: 'group-actions' });
    if (group.syncStatus === 'unsaved') {
      actions.appendChild(
        btn('Save', 'btn', async () => {
          clearError();
          const result = await resaveGroup(group.title);
          if (result && 'error' in result) {
            setError(result.error);
          } else {
            render();
          }
        })
      );
    } else {
      actions.appendChild(
        btn('Re-save', 'btn', async () => {
          clearError();
          const result = await resaveGroup(group.title);
          if (result && 'error' in result) {
            setError(result.error);
          } else {
            render();
          }
        })
      );
      actions.appendChild(
        btn('Remove', 'btn btn-danger', async () => {
          clearError();
          const result = await removeGroup(group.title);
          if (result && 'error' in result) {
            setError(result.error);
          } else {
            render();
          }
        })
      );
    }

    header.appendChild(left);
    header.appendChild(actions);
    groupElem.appendChild(header);

    if (expanded) {
      const tabsList = el('div', { className: 'tabs-list' });
      for (const tab of group.tabs) {
        const tabItem = el('div', { className: 'tab-item' });
        tabItem.appendChild(
          el('span', { className: 'tab-title', title: normalizeUrl(tab.url) }, tab.title ?? normalizeUrl(tab.url) ?? 'Untitled')
        );
        tabsList.appendChild(tabItem);
      }
      groupElem.appendChild(tabsList);
    }

    section.appendChild(groupElem);
  }

  return section;
}

function renderUngroupedSection(liveTabs: LiveTab[]): HTMLElement {
  const section = el('div', { className: 'section' });
  section.appendChild(el('div', { className: 'section-title' }, 'UNGROUPED TABS'));

  if (liveTabs.length === 0) {
    section.appendChild(el('div', { className: 'empty-msg' }, 'No open ungrouped tabs.'));
    return section;
  }

  for (const liveTab of liveTabs) {
    const tab = liveTab.tab;
    const url = normalizeUrl(tab.url);
    const row = el('div', { className: 'tab-item' });
    row.appendChild(el('span', { className: 'tab-title', title: url }, tab.title ?? url));

    const actions = el('div', { style: 'display:flex;align-items:center;gap:4px;' });
    actions.appendChild(getBadge(liveTab.syncStatus));

    if (liveTab.syncStatus === 'saved') {
      actions.appendChild(
        btn('Remove', 'btn btn-danger', async () => {
          clearError();
          const result = await removeTab(url);
          if (result && 'error' in result) {
            setError(result.error);
          } else {
            render();
          }
        })
      );
    } else {
      actions.appendChild(
        btn('Save', 'btn', async () => {
          clearError();
          const result = await saveTab(url, tab.title ?? url, tab.pinned);
          if (result && 'error' in result) {
            setError(result.error);
          } else {
            render();
          }
        })
      );
    }

    row.appendChild(actions);
    section.appendChild(row);
  }

  return section;
}

function renderClosedSection(
  closedGroups: { title: string; count: number }[],
  closedTabs: SavedTab[]
): HTMLElement {
  const section = el('div', { className: 'section section-closed' });
  const totalCount = closedGroups.length + closedTabs.length;
  const title = el(
    'div',
    { className: 'section-title' },
    `${savedClosedCollapsed ? '▸' : '▾'} SAVED (CLOSED) (${totalCount})`
  );
  title.addEventListener('click', () => {
    savedClosedCollapsed = !savedClosedCollapsed;
    render();
  });
  section.appendChild(title);

  if (savedClosedCollapsed) {
    return section;
  }

  if (totalCount === 0) {
    section.appendChild(el('div', { className: 'empty-msg' }, 'No saved closed items.'));
    return section;
  }

  for (const group of closedGroups) {
    const row = el('div', { className: 'tab-item' });
    row.appendChild(el('span', { className: 'tab-title' }, `● ${group.title} (${group.count} tabs)`));

    const actions = el('div', { style: 'display:flex;gap:4px;' });
    actions.appendChild(
      btn('Restore', 'btn', async () => {
        clearError();
        const result = await restoreGroup(group.title);
        if (result && 'error' in result) {
          setError(result.error);
        } else {
          render();
        }
      })
    );
    actions.appendChild(
      btn('Remove', 'btn btn-danger', async () => {
        clearError();
        const result = await removeGroup(group.title);
        if (result && 'error' in result) {
          setError(result.error);
        } else {
          render();
        }
      })
    );

    row.appendChild(actions);
    section.appendChild(row);
  }

  for (const tab of closedTabs) {
    const row = el('div', { className: 'tab-item' });
    row.appendChild(el('span', { className: 'tab-title', title: tab.url }, tab.title || tab.url));

    const actions = el('div', { style: 'display:flex;gap:4px;' });
    actions.appendChild(
      btn('Restore', 'btn', async () => {
        clearError();
        const result = await restoreTab(tab.url);
        if (result && 'error' in result) {
          setError(result.error);
        } else {
          render();
        }
      })
    );
    actions.appendChild(
      btn('Remove', 'btn btn-danger', async () => {
        clearError();
        const result = await removeTab(tab.url);
        if (result && 'error' in result) {
          setError(result.error);
        } else {
          render();
        }
      })
    );

    row.appendChild(actions);
    section.appendChild(row);
  }

  return section;
}

export async function render(): Promise<void> {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = '';

  try {
    const { liveGroups, liveUngroupedTabs, closedGroups, closedTabs } = await buildLiveModel();
    syncAllCollapsedState(liveGroups);

    app.appendChild(renderActionBar(liveGroups));

    if (errorMessage) {
      app.appendChild(el('div', { className: 'error-msg' }, errorMessage));
    }

    app.appendChild(renderGroupsSection(liveGroups));
    app.appendChild(renderUngroupedSection(liveUngroupedTabs));
    app.appendChild(renderClosedSection(closedGroups, closedTabs));
  } catch (err) {
    app.appendChild(el('div', { className: 'error-msg' }, String(err)));
  }
}
