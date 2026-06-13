import { useState, useRef, useEffect, useCallback } from 'react';

interface SwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
  preventDefault?: boolean;
}

export const useSwipe = (options: SwipeOptions = {}) => {
  const { onSwipeLeft, onSwipeRight, threshold = 50, preventDefault = false } = options;
  
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  
  const touchStartRef = useRef(false);
  const swipeIgnoreSelector = 'input, textarea, select, button, a, [role="button"], [data-swipe-ignore="true"], [data-horizontal-scroll="true"]';

  const shouldIgnoreSwipeTarget = useCallback((target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    return Boolean(target.closest(swipeIgnoreSelector));
  }, []);

  const onTouchStart = useCallback((e: TouchEvent | React.TouchEvent) => {
    if (shouldIgnoreSwipeTarget(e.target)) {
      setIsSwiping(false);
      touchStartRef.current = false;
      return;
    }
    
    const touch = 'touches' in e ? e.touches[0] : (e as TouchEvent).touches[0];
    setStartX(touch.clientX);
    setStartY(touch.clientY);
    setIsSwiping(true);
    touchStartRef.current = true;
  }, [shouldIgnoreSwipeTarget]);

  const onTouchMove = useCallback((e: TouchEvent | React.TouchEvent) => {
    if (!isSwiping || !touchStartRef.current) return;

    const touch = 'touches' in e ? e.touches[0] : (e as TouchEvent).changedTouches[0] ?? (e as TouchEvent).touches[0];
    if (!touch) return;

    const diffX = touch.clientX - startX;
    const diffY = touch.clientY - startY;

    if (Math.abs(diffY) > Math.abs(diffX)) {
      setIsSwiping(false);
      touchStartRef.current = false;
      return;
    }

    if (preventDefault && Math.abs(diffX) > 8) {
      e.preventDefault?.();
    }

    if (Math.abs(diffX) > threshold) {
      if (diffX > threshold && onSwipeRight) {
        onSwipeRight();
        setIsSwiping(false);
        touchStartRef.current = false;
      } else if (diffX < -threshold && onSwipeLeft) {
        onSwipeLeft();
        setIsSwiping(false);
        touchStartRef.current = false;
      }
    }
  }, [isSwiping, startX, startY, threshold, onSwipeLeft, onSwipeRight, preventDefault]);

  const onTouchEnd = useCallback((e: TouchEvent | React.TouchEvent) => {
    if (isSwiping) {
      setIsSwiping(false);
    }
    touchStartRef.current = false;
  }, [isSwiping]);

  // Cleanup event listeners when component unmounts
  useEffect(() => {
    const element = document.querySelector('main') as HTMLElement;
    
    if (element) {
      element.addEventListener('touchstart', onTouchStart as EventListener, { passive: false });
      element.addEventListener('touchmove', onTouchMove as EventListener, { passive: false });
      element.addEventListener('touchend', onTouchEnd as EventListener, { passive: true });
      
      return () => {
        element.removeEventListener('touchstart', onTouchStart as EventListener);
        element.removeEventListener('touchmove', onTouchMove as EventListener);
        element.removeEventListener('touchend', onTouchEnd as EventListener);
      };
    }
  }, [onTouchStart, onTouchMove, onTouchEnd]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    isSwiping
  };
};
