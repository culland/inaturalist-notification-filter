var storedNotifications = [];
var whitelist = [];
var loadingInterval = null;
var seenCount = 0;

browser.storage.local.get(['whitelist', 'seenCount']).then(data => {
  whitelist = data.whitelist || ['mentioned you'];
  seenCount = data.seenCount || 0;
  console.log('[iNat BG] loaded whitelist:', whitelist, 'seenCount:', seenCount);
});

function setGrayIcon() {
  if (loadingInterval) {
    clearInterval(loadingInterval);
    loadingInterval = null;
  }
  browser.browserAction.setIcon({ path: 'icon_gray.png' });
  browser.browserAction.setBadgeText({ text: '' });
  browser.browserAction.setTitle({ title: 'iNat Notifications — waiting for iNaturalist page' });
  browser.browserAction.setPopup({ popup: '' });
}

function startLoadingAnimation() {
  if (loadingInterval) {
    clearInterval(loadingInterval);
    loadingInterval = null;
  }

  const frames = ['icon_loading_1.png', 'icon_loading_2.png', 'icon_loading_3.png', 'icon_loading_2.png'];
  const dots = ['.  ', '.. ', '...', '.. '];
  let frame = 0;

  browser.browserAction.setPopup({ popup: '' });
  browser.browserAction.setIcon({ path: frames[0] });
  browser.browserAction.setBadgeText({ text: dots[0] });
  browser.browserAction.setBadgeBackgroundColor({ color: '#4a7c00' });
  browser.browserAction.setBadgeTextColor({ color: '#ffffff' });
  browser.browserAction.setTitle({ title: 'iNat Notifications — loading...' });

  loadingInterval = setInterval(() => {
    frame = (frame + 1) % frames.length;
    browser.browserAction.setIcon({ path: frames[frame] });
    browser.browserAction.setBadgeText({ text: dots[frame] });
  }, 400);
}

function updateBadge() {
  const newCount = Math.max(0, storedNotifications.length - seenCount);
  const badgeText = newCount > 99 ? '99+' : newCount > 0 ? String(newCount) : '';
  browser.browserAction.setBadgeText({ text: badgeText });
  browser.browserAction.setBadgeBackgroundColor({ color: '#4a7c00' });
  browser.browserAction.setBadgeTextColor({ color: '#ffffff' });
}

function stopLoadingAnimation(count) {
  if (loadingInterval) {
    clearInterval(loadingInterval);
    loadingInterval = null;
  }
  browser.browserAction.setIcon({ path: 'icon_green.png' });
  browser.browserAction.setTitle({ title: `iNat Notifications — ${count} loaded` });
  browser.browserAction.setPopup({ popup: 'popup.html' });
  updateBadge();
}

function markAsSeen() {
  seenCount = storedNotifications.length;
  browser.storage.local.set({ seenCount });
  browser.browserAction.setBadgeText({ text: '' });
}

// Start with static gray
setGrayIcon();

browser.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'startLoading') {
    startLoadingAnimation();
    return Promise.resolve({ ok: true });
  }

  if (msg.action === 'saveNotifications') {
    const incoming = msg.notifications || [];
    const existingHrefs = new Set(storedNotifications.map(n => n.href));
    const newItems = incoming.filter(n => !existingHrefs.has(n.href));
    storedNotifications = [...newItems, ...storedNotifications];
    console.log('[iNat BG] total stored:', storedNotifications.length);
    return Promise.resolve({ ok: true });
  }

  if (msg.action === 'loadingDone') {
    stopLoadingAnimation(storedNotifications.length);
    return Promise.resolve({ ok: true });
  }

  if (msg.action === 'getNotifications') {
    return Promise.resolve({ notifications: storedNotifications });
  }

  if (msg.action === 'getWhitelist') {
    return Promise.resolve({ whitelist });
  }

  if (msg.action === 'setWhitelist') {
    whitelist = msg.whitelist || [];
    browser.storage.local.set({ whitelist });
    return Promise.resolve({ ok: true });
  }

  if (msg.action === 'purgeNotifications') {
    storedNotifications = [];
    seenCount = 0;
    browser.storage.local.set({ seenCount });
    setGrayIcon();
    console.log('[iNat BG] notifications purged');
    return Promise.resolve({ ok: true });
  }

  if (msg.action === 'markAsSeen') {
    markAsSeen();
    return Promise.resolve({ ok: true });
  }
});
