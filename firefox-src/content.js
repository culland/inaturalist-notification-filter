console.log('[iNat] content script loaded');

const BASE_URL = location.origin;
const NOTIFICATIONS_URL = `${BASE_URL}/users/new_updates?notification=activity,mention&skip_view=true`;
const API_BASE = 'https://api.inaturalist.org/v1';

async function fetchPage(page) {
  const url = `${NOTIFICATIONS_URL}&page=${page}`;
  console.log('[iNat] fetching page', page, url);
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

function parseNotificationsFromHTML(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return [...doc.querySelectorAll('li a')].map(a => {
    const img = a.querySelector('img');
    const dateEl = a.querySelector('.small.meta');
    const textNode = a.querySelector('.inlineblock');
    let message = '';
    if (textNode) {
      const clone = textNode.cloneNode(true);
      clone.querySelector('.small.meta')?.remove();
      message = clone.textContent.trim().replace(/\s+/g, ' ');
    }
    return {
      href: a.href,
      image: img?.src || null,
      date: dateEl?.textContent.trim() || '',
      message
    };
  }).filter(n => n.message);
}

async function fetchApiToken() {
  const res = await fetch(`${BASE_URL}/users/api_token.json`, { credentials: 'include' });
  if (!res.ok) throw new Error('api_token HTTP ' + res.status);
  const data = await res.json();
  if (!data?.api_token) throw new Error('api_token missing in response');
  return data.api_token;
}

function relativeTime(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (abs < 60) return rtf.format(Math.round(diffSec), 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), 'day');
  if (abs < 86400 * 365) return rtf.format(Math.round(diffSec / 2592000), 'month');
  return rtf.format(Math.round(diffSec / 31536000), 'year');
}

function apiHitToNotification(hit) {
  const resourceId = hit.resource_id;
  if (!resourceId) return null;
  const noun = hit.notifier_type === 'Comment' ? 'comment'
    : hit.notifier_type === 'Identification' ? 'identification'
    : 'update';
  let detail = '';
  if (hit.comment && typeof hit.comment.body === 'string') {
    detail = hit.comment.body.trim().replace(/\s+/g, ' ');
  } else if (hit.identification && hit.identification.taxon && hit.identification.taxon.name) {
    detail = `as ${hit.identification.taxon.name}`;
  }
  if (detail.length > 140) detail = detail.slice(0, 137) + '…';
  const message = detail
    ? `New ${noun} on observation #${resourceId}: ${detail}`
    : `New ${noun} on observation #${resourceId}`;
  return {
    href: `${BASE_URL}/observations/${resourceId}`,
    image: null,
    date: relativeTime(hit.created_at),
    message
  };
}

async function fetchViewedFromApi() {
  const token = await fetchApiToken();
  const res = await fetch(`${API_BASE}/observations/updates?per_page=200&viewed=true`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('api updates HTTP ' + res.status);
  const data = await res.json();
  const hits = (data.results || []).filter(r => r.viewed === true);
  return hits.map(apiHitToNotification).filter(Boolean);
}

async function saveAndCount(notifications) {
  // Returns { totalStored, visibleCount } from the background after save.
  if (!notifications.length) return { totalStored: 0, visibleCount: 0 };
  const resp = await browser.runtime.sendMessage({ action: 'saveNotifications', notifications });
  return {
    totalStored: resp?.totalStored ?? 0,
    visibleCount: resp?.visibleCount ?? 0
  };
}

function sendToBg(notifications) {
  if (notifications.length) {
    browser.runtime.sendMessage({ action: 'saveNotifications', notifications });
  }
}

async function fetchUnreadHtml(maxPages, minVisible) {
  let page = 1;
  let total = 0;
  while (page <= maxPages) {
    let parsed;
    try {
      const html = await fetchPage(page);
      parsed = parseNotificationsFromHTML(html);
    } catch (e) {
      console.log('[iNat] error on page', page, e.message, '— stopping');
      break;
    }
    if (parsed.length === 0) {
      console.log('[iNat] stopping: page', page, 'returned zero notifications');
      break;
    }
    const { totalStored, visibleCount } = await saveAndCount(parsed);
    total += parsed.length;
    console.log(
      '[iNat] page', page,
      '| parsed:', parsed.length,
      '| total stored:', totalStored,
      '| visible after filters:', visibleCount,
      '| target:', minVisible
    );
    if (visibleCount >= minVisible) {
      console.log('[iNat] stopping: visible', visibleCount, '>= minimum', minVisible);
      break;
    }
    if (page >= maxPages) {
      console.log('[iNat] stopping: reached max pages', maxPages);
      break;
    }
    page++;
    await new Promise(r => setTimeout(r, 500));
  }
  return total;
}

async function fetchReadApi() {
  try {
    const items = await fetchViewedFromApi();
    console.log('[iNat] read api returned', items.length, 'viewed items');
    if (items.length) sendToBg(items);
    return items.length;
  } catch (e) {
    console.log('[iNat] viewed api error', e.message);
    return 0;
  }
}

let fetchInFlight = false;

async function fetchAllNotifications() {
  if (fetchInFlight) {
    console.log('[iNat] fetch already in progress, skipping');
    return;
  }
  fetchInFlight = true;
  try {
    await runFetchAllNotifications();
  } finally {
    fetchInFlight = false;
  }
}

async function runFetchAllNotifications() {
  browser.runtime.sendMessage({ action: 'startLoading' });

  // Guarantee the loading animation always stops, even if a fetch step throws
  // unexpectedly — otherwise the toolbar icon would spin indefinitely.
  try {
    const stored = await browser.storage.local.get([
      'maxPages', 'minVisibleNotifications', 'notificationFetchMode'
    ]);
    const maxPages = stored.maxPages || 10;
    const minVisible = stored.minVisibleNotifications || 25;
    const mode = ['unread', 'read', 'both'].includes(stored.notificationFetchMode)
      ? stored.notificationFetchMode
      : 'unread';

    console.log('[iNat] fetching notifications, mode =', mode, '| maxPages =', maxPages, '| minVisible =', minVisible);
    let totalFetched = 0;

    if (mode === 'unread' || mode === 'both') {
      totalFetched += await fetchUnreadHtml(maxPages, minVisible);
    }

    // Read/recovery mode pulls up to 200 viewed items in a single API call.
    // Filter-aware pagination is not applicable here — it's one shot.
    if (mode === 'read' || mode === 'both') {
      totalFetched += await fetchReadApi();
    }

    console.log('[iNat] done, total fetched:', totalFetched);
  } catch (e) {
    console.log('[iNat] fetch failed:', e && e.message ? e.message : e);
  } finally {
    browser.runtime.sendMessage({ action: 'loadingDone' });
  }
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg && msg.action === 'triggerFetch') {
    fetchAllNotifications().catch(e => console.log('[iNat] triggered fetch error', e));
    return Promise.resolve({ ok: true });
  }
  return false;
});

fetchAllNotifications();
