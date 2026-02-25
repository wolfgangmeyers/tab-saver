import { resaveGroup } from '../../lib/session';

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    chrome.contextMenus.create({ id: 'save-group', title: 'Save Group', contexts: ['tab'] });
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== 'save-group') return;
    if (!tab || tab.groupId === undefined || tab.groupId === -1) return;

    chrome.tabGroups.get(tab.groupId, (group) => {
      if (chrome.runtime.lastError) return;
      resaveGroup(group.title ?? '').catch((err) => {
        console.error('Failed to save group from context menu:', err);
      });
    });
  });
});
