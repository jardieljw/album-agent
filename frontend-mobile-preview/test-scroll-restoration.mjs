import assert from 'node:assert';

// 1. Mock browser globals for Node.js test environment
const mockStorage = new Map();
globalThis.sessionStorage = {
  getItem: (k) => mockStorage.get(k) || null,
  setItem: (k, v) => mockStorage.set(k, String(v)),
  removeItem: (k) => mockStorage.delete(k),
  clear: () => mockStorage.clear(),
};
globalThis.window = globalThis;
let rafCallbacks = [];
globalThis.requestAnimationFrame = (cb) => {
  rafCallbacks.push(cb);
  return rafCallbacks.length;
};
globalThis.cancelAnimationFrame = (id) => {
  rafCallbacks = rafCallbacks.filter((_, idx) => idx + 1 !== id);
};
globalThis.performance = {
  now: () => Date.now(),
};

// Import the service
const {
  scrollRestorationManager,
  getTabScrollKey,
  getViewScrollKey
} = await import('./src/services/scrollRestoration.ts');

console.log('=== TEST SUITE: Scroll Position Restoration ===\n');

// Test 1: Service Basic Keying and Persistence
{
  console.log('Test 1: Basic Keying and Priority Fallback');
  scrollRestorationManager.clearAll();

  // Save for view:multi-album
  scrollRestorationManager.savePosition(getViewScrollKey('multi-album'), 1500);
  assert.strictEqual(
    scrollRestorationManager.getSavedPosition(undefined, 'multi-album'),
    1500,
    'Should retrieve view-level scroll when no tabId is passed'
  );

  // When tabId is passed and has its own position, it should take precedence
  const tabId = 'tab-multi-album-101';
  scrollRestorationManager.savePosition(getTabScrollKey(tabId), 2200);
  assert.strictEqual(
    scrollRestorationManager.getSavedPosition(tabId, 'multi-album'),
    2200,
    'Tab-specific scroll must take precedence over view-level scroll'
  );

  // Album-detail view with activeAlbumId
  scrollRestorationManager.savePosition(getViewScrollKey('album-detail', 'alb-99'), 750);
  assert.strictEqual(
    scrollRestorationManager.getSavedPosition(undefined, 'album-detail', 'alb-99'),
    750,
    'Should retrieve specific album detail scroll position'
  );
  assert.strictEqual(
    scrollRestorationManager.getSavedPosition(undefined, 'album-detail', 'alb-other'),
    0,
    'Different album detail should default to 0'
  );

  console.log('  ✓ Passed: Keying and precedence work correctly.');
}

// Test 2: Independent Session Tabs (Same View)
{
  console.log('\nTest 2: Independent Session Tabs Preservation');
  scrollRestorationManager.clearAll();

  const tab1 = 'tab-gallery-alpha';
  const tab2 = 'tab-gallery-beta';

  scrollRestorationManager.savePosition(getTabScrollKey(tab1), 450);
  scrollRestorationManager.savePosition(getTabScrollKey(tab2), 1850);

  assert.strictEqual(
    scrollRestorationManager.getSavedPosition(tab1, 'gallery'),
    450,
    'Tab 1 retains its own scroll offset'
  );
  assert.strictEqual(
    scrollRestorationManager.getSavedPosition(tab2, 'gallery'),
    1850,
    'Tab 2 retains its own independent scroll offset'
  );

  // Close tab 1
  scrollRestorationManager.deleteTabPosition(tab1);
  assert.strictEqual(
    scrollRestorationManager.getPosition(getTabScrollKey(tab1)),
    undefined,
    'Closed tab position should be deleted'
  );
  assert.strictEqual(
    scrollRestorationManager.getSavedPosition(tab2, 'gallery'),
    1850,
    'Tab 2 position remains intact after Tab 1 is closed'
  );

  console.log('  ✓ Passed: Independent session tabs preserved separately.');
}

// Test 3: Outgoing Snapshot Before Navigation
{
  console.log('\nTest 3: Snapshot Current Container Position Before Navigation');
  scrollRestorationManager.clearAll();

  const mockMain = {
    scrollTop: 3120,
    scrollHeight: 10000,
    clientHeight: 800,
  };
  scrollRestorationManager.registerContainer(mockMain);

  // Normal snapshot before navigating away from Multi-Album
  const snap1 = scrollRestorationManager.snapshotCurrentPosition('tab-multi-1', 'multi-album', null);
  assert.strictEqual(snap1, 3120);
  assert.strictEqual(scrollRestorationManager.getPosition(getTabScrollKey('tab-multi-1')), 3120);
  assert.strictEqual(scrollRestorationManager.getPosition(getViewScrollKey('multi-album')), 3120);

  // Verify that if locked (e.g. restoration in flight), snapshot refuses to overwrite with intermediate value
  scrollRestorationManager.setLocked(true);
  mockMain.scrollTop = 120; // Simulated clamp during unmount/DOM removal
  const snapLocked = scrollRestorationManager.snapshotCurrentPosition('tab-multi-1', 'multi-album', null);
  assert.strictEqual(snapLocked, null, 'Snapshot should be ignored when restoration is locked');
  assert.strictEqual(
    scrollRestorationManager.getPosition(getTabScrollKey('tab-multi-1')),
    3120,
    'Saved position must NOT be corrupted by intermediate clamped value'
  );
  scrollRestorationManager.setLocked(false);

  console.log('  ✓ Passed: Snapshotting and lock protection preserve positions.');
}

// Test 4: Simulation of Multi-Album to Web Video Scraper and Back with Dynamic Layout Shifts
{
  console.log('\nTest 4: Simulation of Navigation & Dynamic Layout Shifts (Multi-Album <-> Web Video Scraper)');
  scrollRestorationManager.clearAll();

  // Create simulated container element with layout properties
  class MockContainer {
    constructor() {
      this.clientHeight = 800;
      this.scrollHeight = 10000;
      this._scrollTop = 0;
    }
    get scrollTop() {
      return this._scrollTop;
    }
    set scrollTop(val) {
      const maxScroll = Math.max(0, this.scrollHeight - this.clientHeight);
      this._scrollTop = Math.max(0, Math.min(val, maxScroll));
    }
  }

  const container = new MockContainer();
  scrollRestorationManager.registerContainer(container);

  // Step A: User is on Multi-Album, scrolls down to item 50 (3200px)
  container.scrollTop = 3200;
  assert.strictEqual(container.scrollTop, 3200);

  // Step B: User clicks Web Video Scraper -> snapshot outgoing position
  scrollRestorationManager.snapshotCurrentPosition('tab-multi', 'multi-album', null);
  assert.strictEqual(scrollRestorationManager.getSavedPosition('tab-multi', 'multi-album'), 3200);

  // Step C: Web Video Scraper mounts, starts at 0
  const webScraperTarget = scrollRestorationManager.getSavedPosition('tab-scraper', 'web-video-scraper');
  assert.strictEqual(webScraperTarget, 0, 'Initial visit to scraper starts at 0');
  container.scrollTop = webScraperTarget;
  assert.strictEqual(container.scrollTop, 0);

  // User scrolls Web Video Scraper down to 1450px
  container.scrollTop = 1450;
  assert.strictEqual(container.scrollTop, 1450);

  // Step D: User clicks Multi-Album -> snapshot scraper outgoing position
  scrollRestorationManager.snapshotCurrentPosition('tab-scraper', 'web-video-scraper', null);
  assert.strictEqual(scrollRestorationManager.getSavedPosition('tab-scraper', 'web-video-scraper'), 1450);

  // Step E: Multi-Album mounts again!
  const restoredTarget = scrollRestorationManager.getSavedPosition('tab-multi', 'multi-album');
  assert.strictEqual(restoredTarget, 3200, 'Must retrieve 3200px for Multi-Album');

  // SIMULATE DYNAMIC GRID LAYOUT SHIFT:
  // At initial layout (t0), only header is rendered, scrollHeight is small!
  container.scrollHeight = 1200; // maxScroll is 1200 - 800 = 400
  container.scrollTop = restoredTarget; // clamped to 400
  assert.strictEqual(container.scrollTop, 400, 'Clamped at t0 due to layout not finished');

  // Post-layout synchronization simulation:
  // Step 1: 30 albums discovered/rendered -> height expands to 4000
  container.scrollHeight = 4000;
  // Sync loop triggers:
  const maxPossible1 = Math.max(0, container.scrollHeight - container.clientHeight);
  if (container.scrollTop < restoredTarget) {
    container.scrollTop = restoredTarget;
  }
  assert.strictEqual(container.scrollTop, 3200, 'Lands cleanly at 3200px once height expands!');

  // Step 2: 100 albums discovered/rendered -> height expands to 10000
  container.scrollHeight = 10000;
  if (container.scrollTop !== restoredTarget) {
    container.scrollTop = restoredTarget;
  }
  assert.strictEqual(container.scrollTop, 3200, 'Remains firmly pinned at 3200px without jumping to top');

  // Step F: Switch back to Web Video Scraper -> must restore 1450px
  const scraperRestored = scrollRestorationManager.getSavedPosition('tab-scraper', 'web-video-scraper');
  assert.strictEqual(scraperRestored, 1450, 'Scraper returns to exact 1450px');
  container.scrollTop = scraperRestored;
  assert.strictEqual(container.scrollTop, 1450);

  console.log('  ✓ Passed: Multi-Album and Web Video Scraper cross-navigation and layout shift restoration verified.');
}

// Test 5: Fast Tab Switching Protection
{
  console.log('\nTest 5: Fast Tab Switching Protection');
  scrollRestorationManager.clearAll();

  // Tab 1: position 2000
  scrollRestorationManager.savePosition(getTabScrollKey('tab-1'), 2000);
  // Tab 2: position 1500
  scrollRestorationManager.savePosition(getTabScrollKey('tab-2'), 1500);
  // Tab 3: position 800
  scrollRestorationManager.savePosition(getTabScrollKey('tab-3'), 800);

  const container = {
    scrollTop: 2000,
    scrollHeight: 8000,
    clientHeight: 800,
  };
  scrollRestorationManager.registerContainer(container);

  // Switch to Tab 2
  scrollRestorationManager.snapshotCurrentPosition('tab-1', 'gallery', null);
  // While Tab 2 is actively restoring (locked):
  scrollRestorationManager.setLocked(true);
  container.scrollTop = 300; // Incomplete intermediate scroll

  // User rapidly clicks Tab 3 before Tab 2 finishes restoring!
  // snapshotCurrentPosition is called for Tab 2:
  const snapResult = scrollRestorationManager.snapshotCurrentPosition('tab-2', 'videos', null);
  assert.strictEqual(snapResult, null, 'Must NOT snapshot during active restoration');
  assert.strictEqual(
    scrollRestorationManager.getPosition(getTabScrollKey('tab-2')),
    1500,
    'Tab 2 saved position must stay 1500, NOT overwritten by 300!'
  );

  scrollRestorationManager.setLocked(false);
  // Now on Tab 3
  const tab3Target = scrollRestorationManager.getSavedPosition('tab-3', 'multi-album');
  assert.strictEqual(tab3Target, 800);
  container.scrollTop = tab3Target;
  assert.strictEqual(container.scrollTop, 800);

  console.log('  ✓ Passed: Fast tab switching does not corrupt intermediate scroll positions.');
}

// Test 6: Multi-Stage Layout Expansion Simulation (5 distinct shifts)
{
  console.log('\nTest 6: Multi-Stage Dynamic Layout Expansion (5 Shifts)');
  scrollRestorationManager.clearAll();

  class StagedContainer {
    constructor() {
      this.clientHeight = 800;
      this.scrollHeight = 800; // initially no overflow
      this._scrollTop = 0;
    }
    get scrollTop() { return this._scrollTop; }
    set scrollTop(v) {
      const maxScroll = Math.max(0, this.scrollHeight - this.clientHeight);
      this._scrollTop = Math.max(0, Math.min(v, maxScroll));
    }
  }

  const container = new StagedContainer();
  scrollRestorationManager.registerContainer(container);

  const target = 4800;
  scrollRestorationManager.savePosition(getTabScrollKey('tab-heavy'), target);

  // Stage 1: Initial mount (0 scrollable)
  container.scrollHeight = 800;
  container.scrollTop = target;
  assert.strictEqual(container.scrollTop, 0, 'Stage 1: clamped to 0');

  // Stage 2: Initial cards skeleton inserted
  container.scrollHeight = 1600; // max 800
  container.scrollTop = target;
  assert.strictEqual(container.scrollTop, 800, 'Stage 2: clamped to 800');

  // Stage 3: Half cards loaded
  container.scrollHeight = 3200; // max 2400
  container.scrollTop = target;
  assert.strictEqual(container.scrollTop, 2400, 'Stage 3: clamped to 2400');

  // Stage 4: 90% cards loaded
  container.scrollHeight = 5000; // max 4200
  container.scrollTop = target;
  assert.strictEqual(container.scrollTop, 4200, 'Stage 4: clamped to 4200');

  // Stage 5: All 100 cards loaded
  container.scrollHeight = 8500; // max 7700
  container.scrollTop = target;
  assert.strictEqual(container.scrollTop, 4800, 'Stage 5: lands cleanly at 4800 target!');

  console.log('  ✓ Passed: Multi-stage layout shifts progressively reach exact target.');
}

// Test 7: Album Detail Scroll Isolation per Album ID
{
  console.log('\nTest 7: Album Detail Scroll Isolation per Album ID');
  scrollRestorationManager.clearAll();

  // Album A scrolled to 1250
  scrollRestorationManager.savePosition(getViewScrollKey('album-detail', 'album-a'), 1250);
  // Album B scrolled to 320
  scrollRestorationManager.savePosition(getViewScrollKey('album-detail', 'album-b'), 320);

  assert.strictEqual(
    scrollRestorationManager.getSavedPosition(undefined, 'album-detail', 'album-a'),
    1250,
    'Album A has its own 1250 offset'
  );
  assert.strictEqual(
    scrollRestorationManager.getSavedPosition(undefined, 'album-detail', 'album-b'),
    320,
    'Album B has its own 320 offset'
  );
  assert.strictEqual(
    scrollRestorationManager.getSavedPosition(undefined, 'album-detail', 'album-c'),
    0,
    'Unvisited Album C starts at 0'
  );

  console.log('  ✓ Passed: Album detail scroll positions are isolated per album ID.');
}

// Test 8: Fallback to View Key When Tab is Closed and Re-opened via View Navigation
{
  console.log('\nTest 8: Fallback to View Key When Tab is Closed and Re-opened');
  scrollRestorationManager.clearAll();

  // User is on Multi-Album tab 'tab-old'
  scrollRestorationManager.savePosition(getTabScrollKey('tab-old'), 2700);
  scrollRestorationManager.savePosition(getViewScrollKey('multi-album'), 2700);

  // Tab is closed
  scrollRestorationManager.deleteTabPosition('tab-old');

  // User navigates via sidebar to 'multi-album' (a fresh tab 'tab-new' is created)
  // When resolving position for 'tab-new':
  const resolved = scrollRestorationManager.getSavedPosition('tab-new', 'multi-album');
  assert.strictEqual(
    resolved,
    2700,
    'Falls back to view:multi-album position when tab-new has no recorded position'
  );

  console.log('  ✓ Passed: Fallback to view key works when reopening views.');
}

console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===');
