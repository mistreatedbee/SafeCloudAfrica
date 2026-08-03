import React, { useState, useRef, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

export type FloatingPanelPosition = {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  openUpward: boolean;
};

export type UseFloatingPanelOptions = {
  /** Estimated panel height used to decide whether to flip upward. Default 264. */
  panelHeight?: number;
  /** Gap between the trigger and the panel. Default 4. */
  gap?: number;
};

/**
 * Positions a floating panel (dropdown/popover options list) relative to a
 * trigger element using fixed screen coordinates computed from the trigger's
 * own bounding rect, instead of `position: absolute` inside the trigger's own
 * DOM subtree.
 *
 * Why this matters: an absolutely-positioned descendant does not expand its
 * scrolling ancestor's scrollable height. A panel nested inside a scrollable
 * container (e.g. one dropdown per row in a long form inside a modal) can be
 * silently clipped by that ancestor's scroll boundary with no way to scroll
 * it into view -- indistinguishable from "no options loaded" even though the
 * same data is present every time. This hook sidesteps the problem entirely
 * by portaling the panel to document.body and positioning it at a fixed
 * coordinate, recalculated on scroll/resize while open, flipping to open
 * upward when there isn't room below.
 */
export function useFloatingPanel(isOpen: boolean, options?: UseFloatingPanelOptions) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<FloatingPanelPosition | null>(null);
  const panelHeight = options?.panelHeight ?? 264;
  const gap = options?.gap ?? 4;

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < panelHeight && rect.top > spaceBelow;
    setPosition({
      top: openUpward ? undefined : rect.bottom + gap,
      bottom: openUpward ? window.innerHeight - rect.top + gap : undefined,
      left: rect.left,
      width: rect.width,
      openUpward
    });
  }, [panelHeight, gap]);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, updatePosition]);

  return { triggerRef, position };
}

export type FloatingPanelProps = {
  position: FloatingPanelPosition | null;
  className?: string;
  children: React.ReactNode;
};

/** A full-viewport, click-to-close overlay for a floating panel, portaled to document.body so it sits above everything regardless of DOM nesting. */
export function FloatingOutsideClickOverlay({ onClick }: { onClick: () => void }) {
  return createPortal(<div className="fixed inset-0 z-40" onClick={onClick} />, document.body);
}

/** Portals `children` to document.body at the fixed coordinates from useFloatingPanel. Renders nothing until a position is available. */
export function FloatingPanel({ position, className, children }: FloatingPanelProps) {
  if (!position) return null;
  return createPortal(
    <div
      className={className}
      style={{
        position: 'fixed',
        top: position.top,
        bottom: position.bottom,
        left: position.left,
        width: position.width,
        zIndex: 50
      }}
    >
      {children}
    </div>,
    document.body
  );
}
