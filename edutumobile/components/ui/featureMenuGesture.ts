export type FeatureMenuSwipeGesture = {
  dx: number;
  dy: number;
  vx: number;
};

export function shouldCloseFeatureMenuOnSwipe({
  dx,
  dy,
  vx,
}: FeatureMenuSwipeGesture): boolean {
  const horizontal = Math.abs(dx) > Math.abs(dy) * 1.25;
  const deliberateLeftSwipe = dx <= -56 || (dx <= -30 && vx <= -0.45);

  return dx < -14 && horizontal && deliberateLeftSwipe;
}
