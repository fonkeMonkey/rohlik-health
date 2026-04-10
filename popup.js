// RohlikHealth — Popup Script

const toggle = document.getElementById('enableToggle');
const ratedCount = document.getElementById('rated-count');
const clearBtn = document.getElementById('clearCache');
const statusMsg = document.getElementById('status-msg');

// Load current state
chrome.storage.sync.get('rohlikHealthEnabled', ({ rohlikHealthEnabled }) => {
  toggle.checked = rohlikHealthEnabled !== false;
});

// Get rated count from active tab
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (tab?.url?.includes('rohlik.cz')) {
    chrome.tabs.sendMessage(tab.id, { type: 'GET_COUNT' }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response?.count != null) {
        ratedCount.textContent = response.count;
      }
    });
  }
});

// Toggle handler
toggle.addEventListener('change', () => {
  chrome.storage.sync.set({ rohlikHealthEnabled: toggle.checked });
});

// Clear cache
clearBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' }, () => {
    statusMsg.textContent = 'Cache cleared!';
    setTimeout(() => { statusMsg.textContent = ''; }, 2000);
  });
});

// Listen for count updates from content script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'PAGE_COUNT') {
    ratedCount.textContent = msg.count;
  }
});
