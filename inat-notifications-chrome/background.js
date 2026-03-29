// Chrome MV3 uses service workers — no persistent memory, no getBackgroundPage()
// All state must be stored in chrome.storage.session (cleared on browser close)
// and retrieved on each popup open

var loadingInterval = null;

function setGrayIcon() {
  if (loadingInterval) {
    clearInterval(loadingInterval);
    loadingInterval = null;
  }
  chrome.action.setIcon({ path: 'icon_gray.png' });
  chrome.action.setBadgeText({ text: '' });
  chrome.action.setTitle({ title: 'iNat Notifications — waiting for iNaturalist page' });
  chrome.action.setPopup({ popup: '' });
}

function startLoadingAnimation() {
  if (loadingInterval) {
    clearInterval(loadingInterval);
    loadingInterval = null;
  }

  const frames = ['icon_loading_1.png', 'icon_loading_2.png', 'icon_loading_3.png', 'icon_loading_2.png'];
  const dots = ['.  ', '.. ', '...', '.. '];
  let frame = 0;

  chrome.action.setPopup({ popup: '' });
  chrome.action.setIcon({ path: frames[0] });
  chrome.action.setBadgeText({ text: dots[0] });
  chrome.action.setBadgeBackgroundColor({ color: '#4a7c00' });
  chrome.action.setTitle({ title: 'iNat Notifications — loading...' });

  loadingInterval = setInterval(() => {
    frame = (frame + 1) % frames.length;
    chrome.action.setIcon({ path: frames[frame] });
    chrome.action.setBadgeText({ text: dots[frame] });
  }, 400);
}

async function updateBadge() {
  const data = await chrome.storage.session.get(['notifications', 'seenCount']);
  const notifications = data.notifications || [];
  const seenCount = data.seenCount || 0;
  const newCount = Math.max(0, notifications.length - seenCount);
  const badgeText = newCount > 99 ? '99+' : newCount > 0 ? String(newCount) : '';
  chrome.action.setBadgeText({ text: badgeText });
  chrome.action.setBadgeBackgroundColor({ color: '#4a7c00' });
}

async function stopLoadingAnimation() {
  if (loadingInterval) {
    clearInterval(loadingInterval);
    loadingInterval = null;
  }
  const data = await chrome.storage.session.get('notifications');
  const count = (data.notifications || []).length;
  chrome.action.setIcon({ path: 'icon_green.png' });
  chrome.action.setTitle({ title: `iNat Notifications — ${count} loaded` });
  chrome.action.setPopup({ popup: 'popup.html' });
  updateBadge();
}

// Init
setGrayIcon();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'startLoading') {
    startLoadingAnimation();
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'saveNotifications') {
    chrome.storage.session.get('notifications').then(data => {
      const existing = data.notifications || [];
      const existingHrefs = new Set(existing.map(n => n.href));
      const newItems = (msg.notifications || []).filter(n => !existingHrefs.has(n.href));
      chrome.storage.session.set({ notifications: [...newItems, ...existing] });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.action === 'loadingDone') {
    stopLoadingAnimation();
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'getNotifications') {
    chrome.storage.session.get('notifications').then(data => {
      sendResponse({ notifications: data.notifications || [] });
    });
    return true;
  }

  if (msg.action === 'getWhitelist') {
    chrome.storage.local.get('whitelist').then(data => {
      sendResponse({ whitelist: data.whitelist || ['mentioned you'] });
    });
    return true;
  }

  if (msg.action === 'setWhitelist') {
    chrome.storage.local.set({ whitelist: msg.whitelist || [] });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'markAsSeen') {
    chrome.storage.session.get('notifications').then(data => {
      const count = (data.notifications || []).length;
      chrome.storage.session.set({ seenCount: count });
      chrome.action.setBadgeText({ text: '' });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.action === 'purgeNotifications') {
    chrome.storage.session.set({ notifications: [], seenCount: 0 });
    setGrayIcon();
    sendResponse({ ok: true });
    return true;
  }
});
