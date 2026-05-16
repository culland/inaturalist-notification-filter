let whitelist = [];
let blacklist = [];
let maxPages = 10;
let minVisibleNotifications = 25;
let notificationFetchMode = 'unread';
let hideClickedNotifications = true;

const termList = document.getElementById('term-list');
const newTermInput = document.getElementById('new-term');
const addBtn = document.getElementById('add-btn');
const blTermList = document.getElementById('bl-term-list');
const newBlTermInput = document.getElementById('new-bl-term');
const addBlBtn = document.getElementById('add-bl-btn');
const savedMsg = document.getElementById('saved-msg');
const maxPagesInput = document.getElementById('max-pages');
const minVisibleInput = document.getElementById('min-visible');
const purgeBtn = document.getElementById('purge-btn');
const purgeMsg = document.getElementById('purge-msg');
const fetchModeSelect = document.getElementById('fetch-mode');
const hideClickedCheckbox = document.getElementById('hide-clicked');

function showSaved() {
  savedMsg.classList.add('show');
  setTimeout(() => savedMsg.classList.remove('show'), 2000);
}

function renderTermList(container, terms, emptyText, onRemove) {
  container.replaceChildren();

  if (terms.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = emptyText;
    container.appendChild(empty);
    return;
  }

  terms.forEach((term, i) => {
    const item = document.createElement('div');
    item.className = 'term-item';

    const span = document.createElement('span');
    span.className = 'term-text';
    span.textContent = term;
    item.appendChild(span);

    const btn = document.createElement('button');
    btn.className = 'remove-btn';
    btn.title = 'Remove';
    btn.textContent = '×';
    btn.addEventListener('click', () => onRemove(i));
    item.appendChild(btn);

    container.appendChild(item);
  });
}

function renderWhitelist() {
  renderTermList(termList, whitelist, 'No whitelist terms yet. Add one above.', (i) => {
    whitelist.splice(i, 1);
    save();
  });
}

function renderBlacklist() {
  renderTermList(blTermList, blacklist, 'No blacklist terms yet. Add one above.', (i) => {
    blacklist.splice(i, 1);
    save();
  });
}

function save() {
  chrome.storage.local.set({
    whitelist,
    blacklist,
    maxPages,
    minVisibleNotifications,
    notificationFetchMode,
    hideClickedNotifications
  }).then(() => {
    chrome.runtime.sendMessage({ action: 'setWhitelist', whitelist });
    chrome.runtime.sendMessage({ action: 'setBlacklist', blacklist });
    renderWhitelist();
    renderBlacklist();
    showSaved();
  });
}

function addTerm(input, list) {
  const term = input.value.trim();
  if (!term) return;
  if (list.map(t => t.toLowerCase()).includes(term.toLowerCase())) {
    input.value = '';
    return;
  }
  list.push(term);
  input.value = '';
  save();
}

addBtn.addEventListener('click', () => addTerm(newTermInput, whitelist));
newTermInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addTerm(newTermInput, whitelist);
});

addBlBtn.addEventListener('click', () => addTerm(newBlTermInput, blacklist));
newBlTermInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addTerm(newBlTermInput, blacklist);
});

maxPagesInput.addEventListener('change', () => {
  const val = parseInt(maxPagesInput.value);
  if (val >= 1 && val <= 50) {
    maxPages = val;
    save();
  } else {
    maxPagesInput.value = maxPages;
  }
});

minVisibleInput.addEventListener('change', () => {
  const val = parseInt(minVisibleInput.value);
  if (val >= 1 && val <= 200) {
    minVisibleNotifications = val;
    save();
  } else {
    minVisibleInput.value = minVisibleNotifications;
  }
});

fetchModeSelect.addEventListener('change', () => {
  const val = fetchModeSelect.value;
  if (['unread', 'read', 'both'].includes(val)) {
    notificationFetchMode = val;
    save();
  } else {
    fetchModeSelect.value = notificationFetchMode;
  }
});

hideClickedCheckbox.addEventListener('change', () => {
  hideClickedNotifications = hideClickedCheckbox.checked;
  save();
});

purgeBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'purgeNotifications' }).then(() => {
    purgeMsg.classList.add('show');
    setTimeout(() => purgeMsg.classList.remove('show'), 2000);
  });
});

chrome.storage.local.get([
  'whitelist',
  'blacklist',
  'maxPages',
  'minVisibleNotifications',
  'notificationFetchMode',
  'hideClickedNotifications'
]).then(data => {
  whitelist = data.whitelist || ['mentioned you'];
  blacklist = data.blacklist || [];
  maxPages = data.maxPages || 10;
  minVisibleNotifications = data.minVisibleNotifications || 25;
  notificationFetchMode = ['unread', 'read', 'both'].includes(data.notificationFetchMode)
    ? data.notificationFetchMode
    : 'unread';
  hideClickedNotifications = data.hideClickedNotifications !== undefined
    ? !!data.hideClickedNotifications
    : true;
  maxPagesInput.value = maxPages;
  minVisibleInput.value = minVisibleNotifications;
  fetchModeSelect.value = notificationFetchMode;
  hideClickedCheckbox.checked = hideClickedNotifications;
  renderWhitelist();
  renderBlacklist();
});
