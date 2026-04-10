// RohlikHealth — Popup Script

const toggle = document.getElementById('enableToggle');
const ratedCount = document.getElementById('rated-count');
const clearBtn = document.getElementById('clearCache');
const statusMsg = document.getElementById('status-msg');

// Load state from local storage (faster than sync)
chrome.storage.local.get('rohlikHealthEnabled', ({ rohlikHealthEnabled }) => {
  toggle.checked = rohlikHealthEnabled !== false;
});

// Defer the tab query so it never blocks first paint
requestAnimationFrame(() => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab?.url?.includes('rohlik.cz')) return;
    chrome.tabs.sendMessage(tab.id, { type: 'GET_COUNT' }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response?.count != null) ratedCount.textContent = response.count;
    });
  });
});

toggle.addEventListener('change', () => {
  chrome.storage.local.set({ rohlikHealthEnabled: toggle.checked });
});

clearBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' }, () => {
    statusMsg.textContent = 'Cache cleared!';
    setTimeout(() => { statusMsg.textContent = ''; }, 2000);
  });
});
