import { render } from './app';
import { STORAGE_KEY } from '../../lib/storage';

render();

// Re-render when storage changes (e.g., from another context)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && STORAGE_KEY in changes) {
    render();
  }
});
