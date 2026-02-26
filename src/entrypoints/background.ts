import { resaveGroup } from '../lib/session';

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    chrome.contextMenus.create({ id: 'save-group', title: 'Save Group', contexts: ['tab_group'] });
  });

  chrome.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId !== 'save-group') return;
    const groupId = info.tabGroupId;
    if (groupId === undefined) return;

    chrome.tabGroups.get(groupId, (group) => {
      if (chrome.runtime.lastError) return;
      resaveGroup(group.title ?? '').catch((err) => {
        console.error('Failed to save group from context menu:', err);
      });
    });
  });
});
