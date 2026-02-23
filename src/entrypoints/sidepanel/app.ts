import type { SavedState } from '../../lib/types';
import { loadState, clearState } from '../../lib/storage';
import {
  saveAll,
  restoreAll,
  restoreGroup,
  restoreTab,
  removeGroup,
  removeTab,
  resaveGroup,
} from '../../lib/session';

let errorMessage = '';

function setError(msg: string) {
  errorMessage = msg;
  render();
}

function clearError() {
  errorMessage = '';
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString();
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

function renderActionBar(): HTMLElement {
  const bar = el('div', { className: 'action-bar' });

  bar.appendChild(
    btn('Save All', 'btn btn-primary', async () => {
      clearError();
      const result = await saveAll();
      if (result && 'error' in result) {
        setError(result.error);
      } else {
        render();
      }
    })
  );

  bar.appendChild(
    btn('Restore All', 'btn', async () => {
      clearError();
      const result = await restoreAll();
      if (result && 'error' in result) {
        setError(result.error);
      } else {
        render();
      }
    })
  );

  bar.appendChild(
    btn('Clear All', 'btn btn-danger', async () => {
      clearError();
      await clearState();
      render();
    })
  );

  return bar;
}

function renderUngroupedTabs(state: SavedState): HTMLElement {
  const section = el('div', { className: 'section' });
  const title = el('div', { className: 'section-title' }, 'Ungrouped Tabs');
  section.appendChild(title);

  if (state.ungroupedTabs.length === 0) {
    section.appendChild(el('div', { className: 'empty-msg' }, 'No ungrouped tabs saved.'));
    return section;
  }

  for (const tab of state.ungroupedTabs) {
    const item = el('div', { className: 'tab-item' });

    const titleElem = el('span', { className: 'tab-title', title: tab.url }, tab.title || tab.url);
    item.appendChild(titleElem);

    const actions = el('div', { style: 'display:flex;gap:4px;' });
    actions.appendChild(
      btn('Restore', 'btn', async () => {
        clearError();
        const result = await restoreTab(tab.url);
        if (result && 'error' in result) setError(result.error);
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

    item.appendChild(actions);
    section.appendChild(item);
  }

  return section;
}

function renderGroups(state: SavedState): HTMLElement {
  const section = el('div', { className: 'section' });
  const title = el('div', { className: 'section-title' }, 'Tab Groups');
  section.appendChild(title);

  if (state.groups.length === 0) {
    section.appendChild(el('div', { className: 'empty-msg' }, 'No groups saved.'));
    return section;
  }

  for (const group of state.groups) {
    const groupElem = el('div', { className: 'group' });

    // Header
    const header = el('div', { className: 'group-header' });
    const colorDot = el('span', { className: `color-dot color-${group.color}` });
    const groupTitle = el('span', { className: 'group-title' }, group.title);
    const titleWrap = el('div', { style: 'display:flex;align-items:center;' });
    titleWrap.appendChild(colorDot);
    titleWrap.appendChild(groupTitle);

    const groupActions = el('div', { className: 'group-actions' });
    groupActions.appendChild(
      btn('Restore', 'btn', async () => {
        clearError();
        const result = await restoreGroup(group.title);
        if (result && 'error' in result) setError(result.error);
      })
    );
    groupActions.appendChild(
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
    groupActions.appendChild(
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

    header.appendChild(titleWrap);
    header.appendChild(groupActions);
    groupElem.appendChild(header);

    // Tabs list
    const tabsList = el('div', { className: 'tabs-list' });
    for (const tab of group.tabs) {
      const tabItem = el('div', { className: 'tab-item' });
      const tabTitle = el('span', { className: 'tab-title', title: tab.url }, tab.title || tab.url);
      tabItem.appendChild(tabTitle);
      tabsList.appendChild(tabItem);
    }
    groupElem.appendChild(tabsList);
    section.appendChild(groupElem);
  }

  return section;
}

export async function render(): Promise<void> {
  const app = document.getElementById('app');
  if (!app) return;

  // Clear existing content
  app.innerHTML = '';

  // Action bar
  app.appendChild(renderActionBar());

  // Error message
  if (errorMessage) {
    app.appendChild(el('div', { className: 'error-msg' }, errorMessage));
  }

  // Load and display state
  const state = await loadState();

  if (!state) {
    app.appendChild(el('div', { className: 'empty-msg' }, 'No saved session. Click "Save All" to save your current tabs.'));
    return;
  }

  // Saved at time
  app.appendChild(el('div', { className: 'saved-at' }, `Saved: ${formatDate(state.savedAt)}`));

  // Ungrouped tabs
  app.appendChild(renderUngroupedTabs(state));

  // Groups
  app.appendChild(renderGroups(state));
}
