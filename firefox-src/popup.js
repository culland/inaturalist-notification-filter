const list = document.getElementById('list');
const filterToggle = document.getElementById('filter-toggle');
const filterLabel = document.getElementById('filter-label');
const settingsLink = document.getElementById('settings-link');
const headerCount = document.getElementById('header-count');

settingsLink.addEventListener('click', () => {
  browser.runtime.openOptionsPage();
});

function getObservationId(href) {
  const match = href.match(/\/observations\/(\d+)/);
  return match ? match[1] : null;
}

function applyFilter(notifications, whitelist, useFilter) {
  if (!useFilter) return notifications;
  if (whitelist.length === 0) return [];
  return notifications.filter(n => {
    const msg = n.message.toLowerCase();
    const obsId = getObservationId(n.href);
    return whitelist.some(term => {
      const t = term.toLowerCase().trim();
      return msg.includes(t) || (obsId && obsId === t) || n.href.includes(t);
    });
  });
}

function updateHeader(filtered, total, useFilter) {
  if (useFilter) {
    headerCount.textContent = `${filtered} of ${total} notifications`;
  } else {
    headerCount.textContent = `${total} notification${total !== 1 ? 's' : ''}`;
  }
}

function renderNotifications(notifications, whitelist, useFilter) {
  const filtered = applyFilter(notifications, whitelist, useFilter);
  updateHeader(filtered.length, notifications.length, useFilter);

  if (!notifications.length) {
    list.innerHTML = '<div class="status">No notifications yet.\nWait for the icon to turn green.</div>';
    return;
  }

  if (useFilter && whitelist.length === 0) {
    list.innerHTML = '<div class="status">Nothing matches whitelist.\nAdd terms in Settings.</div>';
    return;
  }

  if (useFilter && filtered.length === 0) {
    list.innerHTML = '<div class="status">Nothing matches whitelist.</div>';
    return;
  }

  list.innerHTML = filtered.map(n => `
    <a class="item" href="${n.href}" target="_blank">
      ${n.image ? `<img src="${n.image}" alt="">` : `<div class="no-img"></div>`}
      <div class="text">
        <div class="msg">${n.message}</div>
        <div class="date">${n.date}</div>
      </div>
    </a>
  `).join('');
}

const bg = browser.extension.getBackgroundPage();

async function load() {
  const [whitelistResponse, stored] = await Promise.all([
    browser.runtime.sendMessage({ action: 'getWhitelist' }),
    browser.storage.local.get('useFilter')
  ]);

  const notifications = bg?.storedNotifications || [];
  const whitelist = whitelistResponse?.whitelist || [];
  let useFilter = stored.useFilter !== undefined ? stored.useFilter : false;

  filterToggle.checked = useFilter;
  filterLabel.textContent = useFilter ? 'Whitelist on' : 'Whitelist off';

  renderNotifications(notifications, whitelist, useFilter);

  filterToggle.addEventListener('change', () => {
    useFilter = filterToggle.checked;
    filterLabel.textContent = useFilter ? 'Whitelist on' : 'Whitelist off';
    browser.storage.local.set({ useFilter });
    renderNotifications(notifications, whitelist, useFilter);
  });

  browser.runtime.sendMessage({ action: 'markAsSeen' });
}

load();
