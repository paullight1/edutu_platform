import { useState, useRef, useEffect, useCallback } from 'react';

interface SwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
  preventDefault?: boolean;
}

export const useSwipe = (options: SwipeOptions = {}) => {
  const { onSwipeLeft, onSwipeRight, threshold = 50, preventDefault = true } = options;
  
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  
  const touchStartRef = useRef(false);

  const onTouchStart = useCallback((e: TouchEvent | React.TouchEvent) => {
    if (preventDefault) {
      e.preventDefault?.();
    }
    
    const touch = 'touches' in e ? e.touches[0] : (e as TouchEvent).touches[0];
    setStartX(touch.clientX);
    setStartY(touch.clientY);
    setIsSwiping(true);
    touchStartRef.current = true;
  }, [preventDefault]);

  const onTouchMove = useCallback((e: TouchEvent | React.TouchEvent) => {
    if (!isSwiping) return;
    if (preventDefault) {
      e.preventDefault?.();
    }
    
    const touch = 'touches' in e ? e.touches[0] : (e as TouchEvent).changedTouches[0];
    const diffX = touch.clientX - startX;
    const diffY = touch.clientY - startY;
    
    // If vertical swipe is larger than horizontal, ignore it
    if (Math.abs(diffY) > Math.abs(diffX)) {
      return;
    }
    
    // Check if swiping horizontally exceeds threshold
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