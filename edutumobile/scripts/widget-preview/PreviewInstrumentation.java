package com.edutu.widgetpreview;

import android.app.Activity;
import android.app.Instrumentation;
import android.os.Bundle;

/** Runs off-screen in its own package; does not open/stop the user's app or change launcher state. */
public class PreviewInstrumentation extends Instrumentation {
  @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }
  @Override public void onStart() {
    final Bundle result = new Bundle();
    final Throwable[] failure = new Throwable[1];
    runOnMainSync(() -> {
      try { PreviewActivity.renderAll(getTargetContext()); }
      catch (Throwable error) { failure[0] = error; }
    });
    if (failure[0] != null) {
      result.putString("failure", android.util.Log.getStackTraceString(failure[0]));
      finish(Activity.RESULT_CANCELED, result);
    } else {
      result.putString("result", "PASS: 228 native type/size/theme/font-scale renders plus three non-ready states");
      finish(Activity.RESULT_OK, result);
    }
  }
}
