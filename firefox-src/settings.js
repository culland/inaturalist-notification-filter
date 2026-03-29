let whitelist = [];
let maxPages = 2;

const termList = document.getElementById('term-list');
const newTermInput = document.getElementById('new-term');
const addBtn = document.getElementById('add-btn');
const savedMsg = document.getElementById('saved-msg');
const maxPagesInput = document.getElementById('max-pages');

function showSaved() {
  savedMsg.classList.add('show');
  setTimeout(() => savedMsg.classList.remove('show'), 2000);
}

function renderList() {
  if (whitelist.length === 0) {
    termList.innerHTML = '<div class="empty">No whitelist terms yet. Add one above.</div>';
    return;
  }
  termList.innerHTML = whitelist.map((term, i) => `
    <div class="term-item">
      <span class="term-text">${term}</span>
      <button class="remove-btn" data-index="${i}" title="Remove">×</button>
    </div>
  `).join('');

  termList.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      whitelist.splice(parseInt(btn.dataset.index), 1);
      save();
    });
  });
}

function save() {
  browser.storage.local.set({ whitelist, maxPages }).then(() => {
    browser.runtime.sendMessage({ action: 'setWhitelist', whitelist });
    renderList();
    showSaved();
  });
}

function addTerm() {
  const term = newTermInput.value.trim();
  if (!term) return;
  if (whitelist.map(t => t.toLowerCase()).includes(term.toLowerCase())) {
    newTermInput.value = '';
    return;
  }
  whitelist.push(term);
  newTermInput.value = '';
  save();
}

addBtn.addEventListener('click', addTerm);
newTermInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addTerm();
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

// Load from storage
browser.storage.local.get(['whitelist', 'maxPages']).then(data => {
  whitelist = data.whitelist || ['mentioned you'];
  maxPages = data.maxPages || 2;
  maxPagesInput.value = maxPages;
  renderList();
});

// Purge notifications
const purgeBtn = document.getElementById('purge-btn');
const purgeMsg = document.getElementById('purge-msg');

purgeBtn.addEventListener('click', () => {
  browser.runtime.sendMessage({ action: 'purgeNotifications' }).then(() => {
    purgeMsg.classList.add('show');
    setTimeout(() => purgeMsg.classList.remove('show'), 2000);
  });
});
