import assert from 'node:assert';

// Setup mock browser globals
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

const {
  scrollRestorationManager,
  getTabScrollKey,
  getViewScrollKey
} = await import('./src/services/scrollRestoration.ts');

console.log('=== RUNNING DEEP ADVERSARIAL STRESS SUITE ===\n');

// Attack 1: Corrupted or Malformed sessionStorage data
{
  console.log('Attack 1: Malformed sessionStorage data');
  mockStorage.set('imagex_scroll_positions_v1', '{"tab:broken": "not a number", "tab:null": null, "tab:bool": true, "tab:neg": -50, "valid": 400}');
  
  // Re-instantiate or trigger constructor hydration
  const ServiceClass = scrollRestorationManager.constructor;
  const instance = new ServiceClass();

  assert.strictEqual(instance.getPosition('tab:broken'), undefined);
  assert.strictEqual(instance.getPosition('tab:null'), undefined);
  assert.strictEqual(instance.getPosition('tab:bool'), undefined);
  assert.strictEqual(instance.getPosition('tab:neg'), undefined);
  assert.strictEqual(instance.getPosition('valid'), 400);
  console.log('  ✓ Passed: Malformed storage handled gracefully without crash or poisoning.');
}

// Attack 2: Subpixel, NaN, Negative and boundary inputs to savePosition
{
  console.log('\nAttack 2: Boundary and invalid inputs to savePosition');
  scrollRestorationManager.clearAll();
  
  // NaN, null, undefined, strings
  scrollRestorationManager.savePosition('key1', NaN);
  assert.strictEqual(scrollRestorationManager.getPosition('key1'), undefined);

  scrollRestorationManager.savePosition('key2', null);
  assert.strictEqual(scrollRestorationManager.getPosition('key2'), undefined);

  scrollRestorationManager.savePosition('', 500);
  assert.strictEqual(scrollRestorationManager.getPosition(''), undefined);

  // Subpixel handling
  scrollRestorationManager.savePosition('subpixel', 1234.678);
  assert.strictEqual(scrollRestorationManager.getPosition('subpixel'), 1235);

  // Negative scroll
  scrollRestorationManager.savePosition('neg', -100);
  assert.strictEqual(scrollRestorationManager.getPosition('neg'), 0);

  console.log('  ✓ Passed: Boundary and invalid inputs safely sanitized.');
}

// Attack 3: Precedence logic when tabId and viewId have conflicting positions
{
  console.log('\nAttack 3: Precedence between activeTabId and viewId');
  scrollRestorationManager.clearAll();

  // Tab 1 is on gallery at 800px
  scrollRestorationManager.savePosition(getTabScrollKey('tab-1'), 800);
  // View gallery is at 200px
  scrollRestorationManager.savePosition(getViewScrollKey('gallery'), 200);

  // When tab 1 is queried, it MUST return 800px
  assert.strictEqual(scrollRestorationManager.getSavedPosition('tab-1', 'gallery'), 800);

  // When unknown tab on gallery is queried, it MUST fall back to view:gallery (200px)
  assert.strictEqual(scrollRestorationManager.getSavedPosition('tab-unknown', 'gallery'), 200);

  // When no tabId is passed, it MUST return view:gallery (200px)
  assert.strictEqual(scrollRestorationManager.getSavedPosition(undefined, 'gallery'), 200);

  console.log('  ✓ Passed: Precedence hierarchy is strictly followed.');
}

// Attack 4: Two independent session tabs of the same view (e.g. two Gallery tabs)
{
  console.log('\nAttack 4: Independent session tabs with same viewId');
  scrollRestorationManager.clearAll();

  const tabA = 'tab-gallery-1';
  const tabB = 'tab-gallery-2';

  scrollRestorationManager.savePosition(getTabScrollKey(tabA), 1500);
  scrollRestorationManager.savePosition(getTabScrollKey(tabB), 3500);

  assert.strictEqual(scrollRestorationManager.getSavedPosition(tabA, 'gallery'), 1500);
  assert.strictEqual(scrollRestorationManager.getSavedPosition(tabB, 'gallery'), 3500);

  console.log('  ✓ Passed: Multiple tabs of same view maintain independent scroll offsets.');
}

// Attack 5: Unmount clamping and lock protection
{
  console.log('\nAttack 5: Lock protection during unmount / layout re-render');
  scrollRestorationManager.clearAll();

  let currentScroll = 4500;
  const mockContainer = {
    get scrollTop() { return currentScroll; },
    set scrollTop(v) { currentScroll = v; }
  };
  scrollRestorationManager.registerContainer(mockContainer);

  // User was at 4500 on multi-album
  scrollRestorationManager.savePosition(getTabScrollKey('tab-multi'), 4500);
  scrollRestorationManager.savePosition(getViewScrollKey('multi-album'), 4500);

  // Now simulate navigation: lock is set to true
  scrollRestorationManager.setLocked(true);

  // Browser unmounts Multi-Album children -> container scrolls to 0
  currentScroll = 0;

  // An unexpected snapshot or scroll event during this time must NOT overwrite 4500
  const snapResult = scrollRestorationManager.snapshotCurrentPosition('tab-multi', 'multi-album');
  assert.strictEqual(snapResult, null);
  assert.strictEqual(scrollRestorationManager.getPosition(getTabScrollKey('tab-multi')), 4500);
  assert.strictEqual(scrollRestorationManager.getPosition(getViewScrollKey('multi-album')), 4500);

  // Unlock
  scrollRestorationManager.setLocked(false);
  console.log('  ✓ Passed: Intermediate zero-clamping during unmount does not corrupt stored position.');
}

console.log('\n=== ALL DEEP ADVERSARIAL ATTACKS PASSED ===\n');
