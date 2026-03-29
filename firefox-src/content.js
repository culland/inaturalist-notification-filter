console.log('[iNat] content script loaded');

const BASE_URL = location.origin;
const NOTIFICATIONS_URL = `${BASE_URL}/users/new_updates?notification=activity,mention`;

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

function sendToBg(notifications) {
  if (notifications.length) {
    browser.runtime.sendMessage({ action: 'saveNotifications', notifications });
  }
}

async function fetchAllNotifications() {
  await browser.runtime.sendMessage({ action: 'startLoading' });

  const stored = await browser.storage.local.get('maxPages');
  const maxPages = stored.maxPages || 2;

  console.log('[iNat] fetching notifications...');
  let page = 1;
  let totalFetched = 0;

  while (page <= maxPages) {
    try {
      const html = await fetchPage(page);
      const notifications = parseNotificationsFromHTML(html);
      console.log('[iNat] page', page, 'got', notifications.length, 'items');

      if (notifications.length === 0) break;

      sendToBg(notifications);
      totalFetched += notifications.length;
      page++;

      await new Promise(r => setTimeout(r, 500));
    } catch(e) {
      console.log('[iNat] error on page', page, e.message);
      break;
    }
  }

  console.log('[iNat] done, total fetched:', totalFetched);
  browser.runtime.sendMessage({ action: 'loadingDone' });
}

fetchAllNotifications();
