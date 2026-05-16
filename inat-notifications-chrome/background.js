// Chrome MV3 uses service workers — no persistent memory, no getBackgroundPage()
// All state must be stored in chrome.storage.session (cleared on browser close)
// and retrieved on each popup open

// Keep ALLOWED_HREF_HOSTS and safeHref() in sync with popup.js — both sides must
// normalize hrefs identically so seenHrefs comparisons and badge counts agree.
const ALLOWED_HREF_HOSTS = new Set([
  'www.inaturalist.org',
  'inaturalist.org',
  'www.inaturalist.ca',
  'inaturalist.ca'
]);

function safeHref(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!ALLOWED_HREF_HOSTS.has(u.hostname)) return null;
    return u.href;
  } catch (e) {
    return null;
  }
}

// Mirror of popup.js termMatches — case-insensitive match on message text,
// observation ID, or href substring. Keep these two implementations in sync.
function termMatches(n, term) {
  const t = (term || '').toLowerCase().trim();
  if (!t) return false;
  const msg = (n.message || '').toLowerCase();
  const m = (n.href || '').match(/\/observations\/(\d+)/);
  const obsId = m ? m[1] : null;
  const hrefLower = (n.href || '').toLowerCase();
  return msg.includes(t) || (obsId && obsId === t) || hrefLower.includes(t);
}

// Apply popup-side visibility rules to a notification list and return the
// resulting count. Matches the filter pipeline in popup.js#renderNotifications:
// whitelist (if on) -> blacklist (if on) -> hide-clicked (if on, via seenHrefs).
function countVisible(notifications, seenHrefs, prefs) {
  const useFilter = !!prefs.useFilter;
  const whitelist = prefs.whitelist || [];
  const blacklist = prefs.blacklist || [];
  const useBlacklist = prefs.useBlacklist !== undefined
    ? !!prefs.useBlacklist
    : blacklist.length > 0;
  const hideClicked = prefs.hideClickedNotifications !== undefined
    ? !!prefs.hideClickedNotifications
    : true;

  let visible = 0;
  for (const n of notifications) {
    if (useFilter) {
      if (whitelist.length === 0) continue;
      if (!whitelist.some(t => termMatches(n, t))) continue;
    }
    if (useBlacklist && blacklist.length > 0) {
      if (blacklist.some(t => termMatches(n, t))) continue;
    }
    if (hideClicked) {
      const h = safeHref(n.href);
      if (h && seenHrefs.has(h)) continue;
    }
    visible++;
  }
  return visible;
}

var loadingInterval = null;

async function setGrayIcon() {
  if (loadingInterval) {
    clearInterval(loadingInterval);
    loadingInterval = null;
  }
  chrome.action.setIcon({ path: 'icon_gray.png' });
  chrome.action.setTitle({ title: 'iNat Notifications — waiting for iNaturalist page' });
  const data = await chrome.storage.session.get('notifications');
  const hasNotifications = (data.notifications || []).length > 0;
  if (hasNotifications) {
    // Keep already-loaded notifications reachable across service-worker
    // restarts: preserve the popup binding and restore the badge count.
    chrome.action.setPopup({ popup: 'popup.html' });
    updateBadge();
  } else {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setPopup({ popup: '' });
  }
}

function startLoadingAnimation() {
  if (loadingInterval) {
    clearInterval(loadingInterval);
    loadingInterval = null;
  }

  const frames = ['icon_loading_1.png', 'icon_loading_2.png', 'icon_loading_3.png', 'icon_loading_2.png'];
  const dots = ['.  ', '.. ', '...', '.. '];
  let frame = 0;

  // Leave the popup binding alone: if there are already-loaded notifications
  // they should stay reachable while a fresh fetch is in progress.
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
  const data = await chrome.storage.session.get(['notifications', 'seenHrefs']);
  const notifications = data.notifications || [];
  const seenHrefs = new Set(data.seenHrefs || []);
  let newCount = 0;
  for (const item of notifications) {
    const href = safeHref(item.href);
    if (!href) continue;
    if (!seenHrefs.has(href)) newCount++;
  }
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
    (async () => {
      const session = await chrome.storage.session.get(['notifications', 'seenHrefs']);
      const existing = session.notifications || [];
      const seenHrefs = new Set(session.seenHrefs || []);
      const existingHrefs = new Set(existing.map(n => n.href));
      const incoming = msg.notifications || [];
      const newItems = [];
      const seenIncoming = new Set();
      for (const n of incoming) {
        const href = safeHref(n.href);
        if (!href) continue;
        if (existingHrefs.has(href) || seenIncoming.has(href)) continue;
        seenIncoming.add(href);
        newItems.push({ ...n, href });
      }
      const all = [...newItems, ...existing];
      await chrome.storage.session.set({ notifications: all });
      const prefs = await chrome.storage.local.get([
        'whitelist', 'blacklist', 'useFilter', 'useBlacklist', 'hideClickedNotifications'
      ]);
      const visibleCount = countVisible(all, seenHrefs, prefs);
      sendResponse({ ok: true, totalStored: all.length, visibleCount });
    })();
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

  if (msg.action === 'getBlacklist') {
    chrome.storage.local.get('blacklist').then(data => {
      sendResponse({ blacklist: data.blacklist || [] });
    });
    return true;
  }

  if (msg.action === 'setBlacklist') {
    chrome.storage.local.set({ blacklist: msg.blacklist || [] });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'getSeenHrefs') {
    chrome.storage.session.get('seenHrefs').then(data => {
      sendResponse({ seenHrefs: data.seenHrefs || [] });
    });
    return true;
  }

  if (msg.action === 'markHrefSeen') {
    const href = safeHref(msg.href);
    if (!href) {
      sendResponse({ ok: false });
      return true;
    }
    chrome.storage.session.get('seenHrefs').then(data => {
      const seen = new Set(data.seenHrefs || []);
      if (!seen.has(href)) {
        seen.add(href);
        chrome.storage.session.set({ seenHrefs: [...seen] }).then(() => {
          updateBadge();
          sendResponse({ ok: true });
        });
      } else {
        sendResponse({ ok: true });
      }
    });
    return true;
  }

  if (msg.action === 'requestMoreNotifications') {
    chrome.tabs.query({
      url: [
        '*://www.inaturalist.org/*',
        '*://inaturalist.org/*',
        '*://www.inaturalist.ca/*',
        '*://inaturalist.ca/*'
      ]
    }).then(tabs => {
      if (!tabs || tabs.length === 0) {
        sendResponse({ ok: false, reason: 'no-inat-tab' });
        return;
      }
      const target = tabs.find(t => t.active) || tabs[0];
      chrome.tabs.sendMessage(target.id, { action: 'triggerFetch' }).then(
        () => sendResponse({ ok: true }),
        (e) => sendResponse({ ok: false, reason: String(e) })
      );
    });
    return true;
  }

  if (msg.action === 'purgeNotifications') {
    chrome.storage.session.set({ notifications: [], seenHrefs: [] }).then(() => {
      setGrayIcon();
      sendResponse({ ok: true });
    });
    return true;
  }
});
