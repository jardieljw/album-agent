/**
 * Scroll Restoration Service for ImageX AI
 *
 * Provides reliable, instantaneous, flicker-free scroll position preservation
 * across views (currentView, activeAlbumId) and top session tabs (activeTabId).
 */

export const getTabScrollKey = (tabId: string): string => `tab:${tabId}`;

export const getViewScrollKey = (viewId: string, albumId?: string | null): string => {
  return albumId ? `view:${viewId}:${albumId}` : `view:${viewId}`;
};

class ScrollRestorationService {
  private positions = new Map<string, number>();
  private containerElement: HTMLElement | null = null;
  private isLocked = false;
  private persistTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly storageKey = 'imagex_scroll_positions_v1';

  constructor() {
    this.hydrateFromStorage();
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('beforeunload', () => {
        try {
          const payload: Record<string, number> = {};
          for (const [k, v] of this.positions.entries()) { payload[k] = v; }
          sessionStorage.setItem(this.storageKey, JSON.stringify(payload));
        } catch (_) {}
      });
      window.addEventListener('pagehide', () => {
        try {
          const payload: Record<string, number> = {};
          for (const [k, v] of this.positions.entries()) { payload[k] = v; }
          sessionStorage.setItem(this.storageKey, JSON.stringify(payload));
        } catch (_) {}
      });
    }
  }

  private hydrateFromStorage(): void {
    if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
      return;
    }
    try {
      const stored = sessionStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
              this.positions.set(key, Math.round(value));
            }
          }
        }
      }
    } catch (_) {
      // Ignore storage errors in restricted iframe/private mode
    }
  }

  private schedulePersist(): void {
    if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
      return;
    }
    if (this.persistTimeout) {
      clearTimeout(this.persistTimeout);
    }
    this.persistTimeout = setTimeout(() => {
      try {
        const payload: Record<string, number> = {};
        for (const [k, v] of this.positions.entries()) {
          payload[k] = v;
        }
        sessionStorage.setItem(this.storageKey, JSON.stringify(payload));
      } catch (_) {
        // Ignore quota/storage errors
      }
    }, 200);
  }

  /**
   * Register the main scrollable container (<main> in App.tsx)
   */
  public registerContainer(element: HTMLElement | null): void {
    this.containerElement = element;
  }

  /**
   * Get the registered container element
   */
  public getContainer(): HTMLElement | null {
    return this.containerElement;
  }

  /**
   * Check if a restoration is currently in progress
   */
  public isRestorationLocked(): boolean {
    return this.isLocked;
  }

  /**
   * Set restoration lock status
   */
  public setLocked(locked: boolean): void {
    this.isLocked = locked;
  }

  /**
   * Save a scroll position for a specific key
   */
  public savePosition(key: string, scrollTop: number): void {
    if (!key || typeof scrollTop !== 'number' || !Number.isFinite(scrollTop)) {
      return;
    }
    const clamped = Math.max(0, Math.round(scrollTop));
    this.positions.set(key, clamped);
    this.schedulePersist();
  }

  /**
   * Get a saved scroll position for a specific key
   */
  public getPosition(key: string): number | undefined {
    return this.positions.get(key);
  }

  /**
   * Resolve the saved scroll position for a tab or view.
   * Priority:
   * 1. tab:${tabId} (if tabId is provided and exists in position map)
   * 2. view:${viewId}:${albumId} (if albumId provided)
   * 3. view:${viewId}
   * 4. 0 (default fallback)
   */
  public getSavedPosition(tabId?: string, viewId?: string, albumId?: string | null): number {
    if (tabId) {
      const tabPos = this.getPosition(getTabScrollKey(tabId));
      if (typeof tabPos === 'number') {
        return tabPos;
      }
    }
    if (viewId) {
      const viewPos = this.getPosition(getViewScrollKey(viewId, albumId));
      if (typeof viewPos === 'number') {
        return viewPos;
      }
    }
    return 0;
  }

  /**
   * Check if a saved position exists for the given tab or view
   */
  public hasSavedPosition(tabId?: string, viewId?: string, albumId?: string | null): boolean {
    if (tabId && this.positions.has(getTabScrollKey(tabId))) {
      return true;
    }
    if (viewId && this.positions.has(getViewScrollKey(viewId, albumId))) {
      return true;
    }
    return false;
  }

  /**
   * Snapshots the current container's scroll position before navigation actions.
   * Safely ignores if restoration is currently locked to prevent saving intermediate clamped values.
   */
  public snapshotCurrentPosition(tabId?: string, viewId?: string, albumId?: string | null): number | null {
    if (this.isLocked) {
      return null;
    }
    if (!this.containerElement) {
      return null;
    }
    const currentScrollTop = this.containerElement.scrollTop;
    if (tabId) {
      this.savePosition(getTabScrollKey(tabId), currentScrollTop);
    }
    if (viewId) {
      this.savePosition(getViewScrollKey(viewId, albumId), currentScrollTop);
    }
    return currentScrollTop;
  }

  /**
   * Initialize a new tab's scroll position (e.g., set to 0 for a freshly created tab)
   */
  public initNewTabPosition(tabId: string, initialScroll = 0): void {
    if (!tabId) return;
    this.savePosition(getTabScrollKey(tabId), initialScroll);
  }

  /**
   * Delete a saved position for any arbitrary key
   */
  public deletePosition(key: string): void {
    if (!key) return;
    this.positions.delete(key);
    this.schedulePersist();
  }

  /**
   * Clean up a tab's saved scroll position when it is closed
   */
  public deleteTabPosition(tabId: string): void {
    if (!tabId) return;
    this.positions.delete(getTabScrollKey(tabId));
    this.schedulePersist();
  }

  /**
   * Clear all stored scroll positions
   */
  public clearAll(): void {
    this.positions.clear();
    if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.removeItem(this.storageKey);
      } catch (_) {}
    }
  }

  /**
   * Snapshot of all stored keys and offsets for debugging and verification
   */
  public getDebugSnapshot(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of this.positions.entries()) {
      out[k] = v;
    }
    return out;
  }
}

export const scrollRestorationManager = new ScrollRestorationService();
