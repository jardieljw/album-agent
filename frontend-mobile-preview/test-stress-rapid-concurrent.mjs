import assert from 'node:assert';

// Setup mock environment
const mockStorage = new Map();
globalThis.sessionStorage = {
  getItem: (k) => mockStorage.get(k) || null,
  setItem: (k, v) => mockStorage.set(k, String(v)),
  removeItem: (k) => mockStorage.delete(k),
  clear: () => mockStorage.clear(),
};
globalThis.window = globalThis;

let pendingRafs = [];
let rafIdCounter = 1;
globalThis.requestAnimationFrame = (cb) => {
  const id = rafIdCounter++;
  pendingRafs.push({ id, cb });
  return id;
};
globalThis.cancelAnimationFrame = (id) => {
  pendingRafs = pendingRafs.filter(r => r.id !== id);
};
globalThis.performance = {
  now: () => Date.now(),
};

const {
  scrollRestorationManager,
  getTabScrollKey,
  getViewScrollKey
} = await import('./src/services/scrollRestoration.ts');

console.log('=== STRESS TEST: Rapid Concurrent Tab Switching with Active Card Streaming ===\n');

class SimulatedContainer {
  constructor() {
    this.clientHeight = 800;
    this.scrollHeight = 1000;
    this._scrollTop = 0;
  }
  get scrollTop() { return this._scrollTop; }
  set scrollTop(val) {
    const maxScroll = Math.max(0, this.scrollHeight - this.clientHeight);
    this._scrollTop = Math.max(0, Math.min(val, maxScroll));
  }
}

const container = new SimulatedContainer();
scrollRestorationManager.registerContainer(container);

// Setup two tabs:
// Tab 1: Multi-Album with 100 items (height 10000), scrolled to 4200
// Tab 2: Web Video Scraper with 50 items (height 6000), scrolled to 2800
const tab1 = 'tab-multi-101';
const tab2 = 'tab-scraper-202';

scrollRestorationManager.savePosition(getTabScrollKey(tab1), 4200);
scrollRestorationManager.savePosition(getViewScrollKey('multi-album'), 4200);

scrollRestorationManager.savePosition(getTabScrollKey(tab2), 2800);
scrollRestorationManager.savePosition(getViewScrollKey('web-video-scraper'), 2800);

// SIMULATION: User starts on Tab 1
container.scrollHeight = 10000;
container.scrollTop = 4200;

// Now user rapidly clicks Tab 2, then Tab 1, then Tab 2 within milliseconds while SSE stream is adding cards!
for (let cycle = 0; cycle < 20; cycle++) {
  // 1. User clicks Tab 2
  scrollRestorationManager.snapshotCurrentPosition(tab1, 'multi-album');
  
  // Switch to Tab 2: new target is 2800
  const target2 = scrollRestorationManager.getSavedPosition(tab2, 'web-video-scraper');
  assert.strictEqual(target2, 2800, `Tab 2 target must be 2800 on cycle ${cycle}`);

  // Simulate tab unmount/mount: initial DOM has only header (height 800)
  container.scrollHeight = 800;
  scrollRestorationManager.setLocked(true);
  container.scrollTop = target2; // clamped to 0
  assert.strictEqual(container.scrollTop, 0);

  // SSE Stream adds 5 cards -> height increases to 2000
  container.scrollHeight = 2000;
  // If restoration adjusts:
  container.scrollTop = target2; // clamped to 1200
  assert.strictEqual(container.scrollTop, 1200);

  // BUT BEFORE TAB 2 FULLY RESTORES, USER RAPIDLY CLICKS TAB 1!
  // Snapshot called on outgoing Tab 2:
  const snapTab2 = scrollRestorationManager.snapshotCurrentPosition(tab2, 'web-video-scraper');
  // MUST BE NULL because restoration is locked! Tab 2 saved position must NOT become 1200!
  assert.strictEqual(snapTab2, null, 'Snapshot must be rejected during locked transition');
  assert.strictEqual(
    scrollRestorationManager.getPosition(getTabScrollKey(tab2)),
    2800,
    'Tab 2 saved position must remain 2800, not corrupted to 1200'
  );

  // Switch to Tab 1
  scrollRestorationManager.setLocked(false);
  const target1 = scrollRestorationManager.getSavedPosition(tab1, 'multi-album');
  assert.strictEqual(target1, 4200, `Tab 1 target must be 4200 on cycle ${cycle}`);

  // Tab 1 layout shift: height increases progressively
  container.scrollHeight = 1000;
  scrollRestorationManager.setLocked(true);
  container.scrollTop = target1; // clamped to 200

  // SSE adds cards to Tab 1 -> height 6000 -> 10000
  container.scrollHeight = 6000;
  container.scrollTop = target1; // reaches 4200
  assert.strictEqual(container.scrollTop, 4200);

  container.scrollHeight = 10000;
  container.scrollTop = target1;
  assert.strictEqual(container.scrollTop, 4200);

  // Settle Tab 1
  scrollRestorationManager.setLocked(false);
}

console.log('✓ Passed: 20 rapid concurrent tab switches with interleaved streaming layout expansions passed without any scroll corruption!');
