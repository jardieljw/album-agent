import React from 'react';
import { createPortal } from 'react-dom';

export interface ModalPortalProps {
  children: React.ReactNode;
}

/**
 * Renders modal/dialog overlays directly into document.body using React Portals.
 * Guarantees that fixed-position backdrops and modals are ALWAYS centered in the
 * viewport/screen, regardless of parent scroll position, CSS transforms, filters,
 * or layout stacking contexts.
 */
export const ModalPortal: React.FC<ModalPortalProps> = ({ children }) => {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
};
