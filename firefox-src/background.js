// Firefox MV2 background page. Runtime notification state is mirrored into
// storage.local so popups can observe updates while open, then cleared when this
// background page starts.

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

function normalizeStoredNotifications(items) {
  if (!Array.isArray(items)) return [];
  const normalized = [];
  const seen = new Set();
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const href = safeHref(item.href);
    if (!href || seen.has(href)) continue;
    seen.add(href);
    normalized.push({ ...item, href });
  }
  return normalized;
}

function normalizeHrefList(items) {
  if (!Array.isArray(items)) return [];
  return items.map(safeHref).filter(Boolean);
}

function termMatches(n, term) {
  const t = (term || '').toLowerCase().trim();
  if (!t) return false;
  const msg = (n.message || '').toLowerCase();
  const m = (n.href || '').match(/\/observations\/(\d+)/);
  const obsId = m ? m[1] : null;
  const hrefLower = (n.href || '').toLowerCase();
  return msg.includes(t) || (obsId && obsId === t) || hrefLower.includes(t);
}

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

let storedNotifications = [];
let seenHrefs = new Set();
let whitelist = ['mentioned you'];
let blacklist = [];
let loadingInterval = null;
let storageWriteQueue = Promise.resolve();

function queueStorageWrite(task) {
  const next = storageWriteQueue.then(task, task);
  storageWriteQueue = next.catch(() => {});
  return next;
}

async function publishRuntimeState() {
  await browser.storage.local.set({
    notifications: storedNotifications,
    seenHrefs: [...seenHrefs]
  });
}

async function clearRuntimeState() {
  storedNotifications = [];
  seenHrefs = new Set();
  await publishRuntimeState();
}

browser.storage.local.get(['whitelist', 'blacklist']).then(data => {
  whitelist = Array.isArray(data.whitelist) ? data.whitelist : ['mentioned you'];
  blacklist = Array.isArray(data.blacklist) ? data.blacklist : [];
  console.log('[iNat BG] loaded whitelist:', whitelist, 'blacklist:', blacklist);
});

function setGrayIcon() {
  if (loadingInterval) {
    clearInterval(loadingInterval);
    loadingInterval = null;
  }
  browser.browserAction.setIcon({ path: 'icon_gray.png' });
  browser.browserAction.setTitle({ title: 'iNat Notifications - waiting for iNaturalist page' });
  if (storedNotifications.length > 0) {
    browser.browserAction.setPopup({ popup: 'popup.html' });
    updateBadge();
  } else {
    browser.browserAction.setBadgeText({ text: '' });
    browser.browserAction.setPopup({ popup: '' });
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

  browser.browserAction.setIcon({ path: frames[0] });
  browser.browserAction.setBadgeText({ text: dots[0] });
  browser.browserAction.setBadgeBackgroundColor({ color: '#4a7c00' });
  browser.browserAction.setBadgeTextColor({ color: '#ffffff' });
  browser.browserAction.setTitle({ title: 'iNat Notifications - loading...' });

  loadingInterval = setInterval(() => {
    frame = (frame + 1) % frames.length;
    browser.browserAction.setIcon({ path: frames[frame] });
    browser.browserAction.setBadgeText({ text: dots[frame] });
  }, 400);
}

function updateBadge() {
  let newCount = 0;
  for (const item of storedNotifications) {
    const href = safeHref(item.href);
    if (!href) continue;
    if (!seenHrefs.has(href)) newCount++;
  }
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
  browser.browserAction.setTitle({ title: `iNat Notifications - ${count} loaded` });
  browser.browserAction.setPopup({ popup: 'popup.html' });
  updateBadge();
}

storageWriteQueue = clearRuntimeState().then(() => setGrayIcon());

browser.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'startLoading') {
    startLoadingAnimation();
    return Promise.resolve({ ok: true });
  }

  if (msg.action === 'saveNotifications') {
    return queueStorageWrite(async () => {
      storedNotifications = normalizeStoredNotifications(storedNotifications);
      seenHrefs = new Set(normalizeHrefList([...seenHrefs]));
      const existingHrefs = new Set(storedNotifications.map(n => n.href));
      const incoming = Array.isArray(msg.notifications) ? msg.notifications : [];
      const newItems = [];
      const seenIncoming = new Set();

      for (const n of incoming) {
        const href = safeHref(n && n.href);
        if (!href) continue;
        if (existingHrefs.has(href) || seenIncoming.has(href)) continue;
        seenIncoming.add(href);
        newItems.push({ ...n, href });
      }

      storedNotifications = [...newItems, ...storedNotifications];
      await publishRuntimeState();

      const prefs = await browser.storage.local.get([
        'whitelist', 'blacklist', 'useFilter', 'useBlacklist', 'hideClickedNotifications'
      ]);
      const visibleCount = countVisible(storedNotifications, seenHrefs, prefs);
      console.log('[iNat BG] total stored:', storedNotifications.length, 'visible:', visibleCount);
      return { ok: true, totalStored: storedNotifications.length, visibleCount };
    });
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

  if (msg.action === 'getBlacklist') {
    return Promise.resolve({ blacklist });
  }

  if (msg.action === 'setBlacklist') {
    blacklist = msg.blacklist || [];
    browser.storage.local.set({ blacklist });
    return Promise.resolve({ ok: true });
  }

  if (msg.action === 'getSeenHrefs') {
    return Promise.resolve({ seenHrefs: [...seenHrefs] });
  }

  if (msg.action === 'markHrefSeen') {
    const href = safeHref(msg.href);
    if (!href) return Promise.resolve({ ok: false });

    return queueStorageWrite(async () => {
      seenHrefs.add(href);
      await publishRuntimeState();
      updateBadge();
      return { ok: true };
    });
  }

  if (msg.action === 'requestMoreNotifications') {
    return browser.tabs.query({
      url: [
        '*://www.inaturalist.org/*',
        '*://inaturalist.org/*',
        '*://www.inaturalist.ca/*',
        '*://inaturalist.ca/*'
      ]
    }).then(tabs => {
      if (!tabs || tabs.length === 0) {
        return { ok: false, reason: 'no-inat-tab' };
      }
      const target = tabs.find(t => t.active) || tabs[0];
      return browser.tabs.sendMessage(target.id, { action: 'triggerFetch' }).then(
        () => ({ ok: true }),
        e => ({ ok: false, reason: String(e) })
      );
    });
  }

  if (msg.action === 'clearUnreadBacklog') {
    return browser.storage.local.get('maxPages').then(stored => {
      const maxPages = msg.maxPages || stored.maxPages || 10;
      return browser.tabs.query({
        url: [
          '*://www.inaturalist.org/*',
          '*://inaturalist.org/*',
          '*://www.inaturalist.ca/*',
          '*://inaturalist.ca/*'
        ]
      }).then(tabs => {
        if (!tabs || tabs.length === 0) {
          return { ok: false, reason: 'no-inat-tab' };
        }
        const target = tabs.find(t => t.active) || tabs[0];
        return browser.tabs.sendMessage(target.id, {
          action: 'clearUnreadBacklog',
          maxPages
        }).then(
          result => result || { ok: true },
          e => ({ ok: false, reason: String(e) })
        );
      });
    });
  }

  if (msg.action === 'purgeNotifications') {
    return queueStorageWrite(async () => {
      await clearRuntimeState();
      setGrayIcon();
      console.log('[iNat BG] notifications purged');
      return { ok: true };
    });
  }

  return false;
});
