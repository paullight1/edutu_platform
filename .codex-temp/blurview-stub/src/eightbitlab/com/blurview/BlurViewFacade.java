package eightbitlab.com.blurview;

import android.graphics.drawable.Drawable;

public interface BlurViewFacade {
  BlurViewFacade setFrameClearDrawable(Drawable drawable);

  BlurViewFacade setBlurRadius(float radius);

  BlurViewFacade setOverlayColor(int color);
}
