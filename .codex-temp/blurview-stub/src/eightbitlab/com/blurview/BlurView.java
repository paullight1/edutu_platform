package eightbitlab.com.blurview;

import android.content.Context;
import android.graphics.drawable.Drawable;
import android.view.View;

public class BlurView extends View implements BlurViewFacade {
  public BlurView(Context context) {
    super(context);
  }

  public BlurViewFacade setBlurEnabled(boolean enabled) {
    return this;
  }

  public BlurViewFacade setupWith(BlurTarget target) {
    return this;
  }

  public BlurViewFacade setFrameClearDrawable(Drawable drawable) {
    return this;
  }

  public BlurViewFacade setBlurRadius(float radius) {
    return this;
  }

  public BlurViewFacade setOverlayColor(int color) {
    return this;
  }
}
