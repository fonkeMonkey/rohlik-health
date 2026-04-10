// RohlikHealth — Popup Script

const toggle = document.getElementById('enableToggle');
const ratedCount = document.getElementById('rated-count');
const clearBtn = document.getElementById('clearCache');
const statusMsg = document.getElementById('status-msg');

// Load toggle state — use local cache to avoid async delay on open
const cachedEnabled = localStorage.getItem('rohlikHealthEnabled');
if (cachedEnabled === 'false') toggle.checked = false;

// Sync local cache with extension storage (non-blocking)
setTimeout(() => {
  chrome.storage.local.get('rohlikHealthEnabled', ({ rohlikHealthEnabled }) => {
    const enabled = rohlikHealthEnabled !== false;
    toggle.checked = enabled;
    localStorage.setItem('rohlikHealthEnabled', enabled);
  });

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab?.url?.includes('rohlik.cz')) return;
    chrome.tabs.sendMessage(tab.id, { type: 'GET_COUNT' }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response?.count != null) ratedCount.textContent = response.count;
    });
  });
}, 50);

toggle.addEventListener('change', () => {
  const enabled = toggle.checked;
  localStorage.setItem('rohlikHealthEnabled', enabled);
  chrome.storage.local.set({ rohlikHealthEnabled: enabled });
});

clearBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' }, () => {
    statusMsg.textContent = 'Cache cleared!';
    setTimeout(() => { statusMsg.textContent = ''; }, 2000);
  });
});
