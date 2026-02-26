import { render } from './app';
import { STORAGE_KEY } from '../../lib/storage';

render();

// Re-render when storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && STORAGE_KEY in changes) {
    render();
  }
});

// Re-render when live browser state changes
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRender() {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { render(); debounceTimer = null; }, 200);
}

chrome.tabs.onCreated.addListener(scheduleRender);
chrome.tabs.onRemoved.addListener(scheduleRender);
chrome.tabs.onUpdated.addListener(scheduleRender);
chrome.tabs.onMoved.addListener(scheduleRender);
chrome.tabs.onAttached.addListener(scheduleRender);
chrome.tabGroups.onCreated.addListener(scheduleRender);
chrome.tabGroups.onRemoved.addListener(scheduleRender);
chrome.tabGroups.onUpdated.addListener(scheduleRender);
