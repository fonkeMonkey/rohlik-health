// RohlikHealth — Popup Script

const toggle = document.getElementById('enableToggle');
const ratedCount = document.getElementById('rated-count');
const clearBtn = document.getElementById('clearCache');
const statusMsg = document.getElementById('status-msg');

// Load toggle state from extension storage
chrome.storage.local.get('rohlikHealthEnabled', ({ rohlikHealthEnabled }) => {
  toggle.checked = rohlikHealthEnabled !== false;
});

// Sync count from active tab (non-blocking)
setTimeout(() => {

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab?.url?.includes('rohlik.cz')) return;
    chrome.tabs.sendMessage(tab.id, { type: 'GET_COUNT' }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response?.count != null) ratedCount.textContent = response.count;
    });
  });
}, 50);

toggle.addEventListener('change', () => {
  chrome.storage.local.set({ rohlikHealthEnabled: toggle.checked });
});

clearBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' }, () => {
    statusMsg.textContent = 'Cache cleared!';
    setTimeout(() => { statusMsg.textContent = ''; }, 2000);
  });
});
