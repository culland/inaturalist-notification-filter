const list = document.getElementById('list');
const filterToggle = document.getElementById('filter-toggle');
const filterLabel = document.getElementById('filter-label');
const blacklistToggle = document.getElementById('blacklist-toggle');
const blacklistLabel = document.getElementById('blacklist-label');
const settingsLink = document.getElementById('settings-link');
const headerCount = document.getElementById('header-count');

settingsLink.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

function getObservationId(href) {
  const match = href.match(/\/observations\/(\d+)/);
  return match ? match[1] : null;
}

function termMatches(n, term) {
  const t = term.toLowerCase().trim();
  if (!t) return false;
  const msg = n.message.toLowerCase();
  const obsId = getObservationId(n.href);
  const hrefLower = (n.href || '').toLowerCase();
  return msg.includes(t) || (obsId && obsId === t) || hrefLower.includes(t);
}

function applyWhitelist(notifications, whitelist, useFilter) {
  if (!useFilter) return notifications;
  if (whitelist.length === 0) return [];
  return notifications.filter(n => whitelist.some(term => termMatches(n, term)));
}

function applyBlacklist(notifications, blacklist, useBlacklist) {
  if (!useBlacklist || blacklist.length === 0) return notifications;
  return notifications.filter(n => !blacklist.some(term => termMatches(n, term)));
}

function updateHeader(filtered, total, anyFilterActive) {
  if (anyFilterActive) {
    headerCount.textContent = `${filtered} of ${total} notifications`;
  } else {
    headerCount.textContent = `${total} notification${total !== 1 ? 's' : ''}`;
  }
}

// Keep ALLOWED_HREF_HOSTS and safeHref() in sync with background.js — both sides
// must normalize hrefs identically so seenHrefs comparisons and badge counts agree.
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

function safeImageSrc(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href;
  } catch (e) {
    return null;
  }
}

function setStatus(text) {
  list.replaceChildren();
  const div = document.createElement('div');
  div.className = 'status';
  div.textContent = text;
  list.appendChild(div);
}

const LOW_VISIBLE_THRESHOLD = 5;
let fetchMoreRequestedAt = 0;
const FETCH_MORE_COOLDOWN_MS = 5000;

function maybeRequestMore(visibleCount) {
  if (visibleCount > LOW_VISIBLE_THRESHOLD) return;
  const now = Date.now();
  if (now - fetchMoreRequestedAt < FETCH_MORE_COOLDOWN_MS) return;
  fetchMoreRequestedAt = now;
  chrome.runtime.sendMessage({ action: 'requestMoreNotifications' }).catch(() => {});
}

function renderNotifications(state) {
  const {
    notifications, whitelist, useFilter, blacklist, useBlacklist,
    seenHrefs, hideClicked
  } = state;

  const anyFilterActive = useFilter || (useBlacklist && blacklist.length > 0);
  const afterWhitelist = applyWhitelist(notifications, whitelist, useFilter);
  const afterBlacklist = applyBlacklist(afterWhitelist, blacklist, useBlacklist);
  const filtered = afterBlacklist.filter(n => {
    const h = safeHref(n.href);
    if (!h) return false;
    if (hideClicked.value && seenHrefs.has(h)) return false;
    return true;
  });
  updateHeader(filtered.length, notifications.length, anyFilterActive);

  if (!notifications.length) {
    setStatus('No notifications yet.\nWait for the icon to turn green.');
    return;
  }

  if (useFilter && whitelist.length === 0) {
    setStatus('Nothing matches whitelist.\nAdd terms in Settings.');
    return;
  }

  if (filtered.length === 0) {
    setStatus(anyFilterActive ? 'Nothing matches filters.' : 'No unread notifications.');
    return;
  }

  function refreshAfterRowRemoved() {
    const visible = list.querySelectorAll('.item').length;
    if (visible === 0) {
      setStatus(anyFilterActive ? 'Nothing matches filters.' : 'No unread notifications.');
    }
    updateHeader(visible, notifications.length, anyFilterActive);
    maybeRequestMore(visible);
  }

  list.replaceChildren();
  for (const n of filtered) {
    const href = safeHref(n.href);
    if (!href) continue;

    const row = document.createElement('div');
    row.className = 'item';
    if (seenHrefs.has(href)) row.classList.add('seen');

    const link = document.createElement('a');
    link.className = 'item-link';
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    function openInBackground(e) {
      e.preventDefault();
      e.stopPropagation();
      chrome.tabs.create({ url: href, active: false });
      if (!seenHrefs.has(href)) {
        seenHrefs.add(href);
        row.classList.add('seen');
        chrome.runtime.sendMessage({ action: 'markHrefSeen', href });
      }
      if (hideClicked.value) {
        row.remove();
        refreshAfterRowRemoved();
      }
    }

    link.addEventListener('click', openInBackground);
    // Right-click intentionally behaves like left-click. Letting the browser
    // show "open in new tab" closes the extension popup; opening the tab here
    // keeps the popup open while still sending the notification to a new tab.
    link.addEventListener('contextmenu', openInBackground);

    const imgSrc = safeImageSrc(n.image);
    if (imgSrc) {
      const img = document.createElement('img');
      img.src = imgSrc;
      img.alt = '';
      link.appendChild(img);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'no-img';
      link.appendChild(placeholder);
    }

    const text = document.createElement('div');
    text.className = 'text';

    const msg = document.createElement('div');
    msg.className = 'msg';
    msg.textContent = n.message;
    text.appendChild(msg);

    const date = document.createElement('div');
    date.className = 'date';
    date.textContent = n.date;
    text.appendChild(date);

    link.appendChild(text);
    row.appendChild(link);

    const dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className = 'dismiss-btn';
    dismissBtn.title = 'Mark read and hide';
    dismissBtn.setAttribute('aria-label', 'Mark read and hide');
    dismissBtn.textContent = '×';
    dismissBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!seenHrefs.has(href)) {
        seenHrefs.add(href);
        chrome.runtime.sendMessage({ action: 'markHrefSeen', href });
      }
      row.remove();
      refreshAfterRowRemoved();
    });
    row.appendChild(dismissBtn);

    list.appendChild(row);
  }

  maybeRequestMore(filtered.length);
}

async function load() {
  const [notifResponse, whitelistResponse, blacklistResponse, seenResponse, stored] = await Promise.all([
    chrome.runtime.sendMessage({ action: 'getNotifications' }),
    chrome.runtime.sendMessage({ action: 'getWhitelist' }),
    chrome.runtime.sendMessage({ action: 'getBlacklist' }),
    chrome.runtime.sendMessage({ action: 'getSeenHrefs' }),
    chrome.storage.local.get(['useFilter', 'useBlacklist', 'hideClickedNotifications'])
  ]);

  const notifications = notifResponse?.notifications || [];
  const whitelist = whitelistResponse?.whitelist || [];
  const blacklist = blacklistResponse?.blacklist || [];
  const seenHrefs = new Set(seenResponse?.seenHrefs || []);
  let useFilter = stored.useFilter !== undefined ? !!stored.useFilter : false;
  let useBlacklist = stored.useBlacklist !== undefined
    ? !!stored.useBlacklist
    : blacklist.length > 0;
  const hideClicked = {
    value: stored.hideClickedNotifications !== undefined
      ? !!stored.hideClickedNotifications
      : true
  };

  filterToggle.checked = useFilter;
  filterLabel.textContent = useFilter ? 'Whitelist on' : 'Whitelist off';
  blacklistToggle.checked = useBlacklist;
  blacklistLabel.textContent = useBlacklist ? 'Blacklist on' : 'Blacklist off';

  function rerender() {
    renderNotifications({
      notifications, whitelist, useFilter, blacklist, useBlacklist,
      seenHrefs, hideClicked
    });
  }

  rerender();

  filterToggle.addEventListener('change', () => {
    useFilter = filterToggle.checked;
    filterLabel.textContent = useFilter ? 'Whitelist on' : 'Whitelist off';
    chrome.storage.local.set({ useFilter });
    rerender();
  });

  blacklistToggle.addEventListener('change', () => {
    useBlacklist = blacklistToggle.checked;
    blacklistLabel.textContent = useBlacklist ? 'Blacklist on' : 'Blacklist off';
    chrome.storage.local.set({ useBlacklist });
    rerender();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.hideClickedNotifications) {
      hideClicked.value = !!changes.hideClickedNotifications.newValue;
      rerender();
    }
    if (area === 'session' && changes.notifications) {
      const incoming = changes.notifications.newValue || [];
      if (incoming.length !== notifications.length) {
        notifications.length = 0;
        notifications.push(...incoming);
        rerender();
      }
    }
    if (area === 'session' && changes.seenHrefs) {
      const incoming = changes.seenHrefs.newValue || [];
      seenHrefs.clear();
      for (const h of incoming) seenHrefs.add(h);
    }
  });
}

load();
