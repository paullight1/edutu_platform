package com.edutu.widgetpreview;

import android.app.Activity;
import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.Bundle;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.RemoteViews;
import com.edutu.com.R;
import com.edutu.com.widgets.EdutuWidgetProvider;
import com.edutu.com.widgets.NextStepWidgetProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.Method;
import org.json.JSONArray;
import org.json.JSONObject;

/** Isolated preview APK: inflates the actual production RemoteViews using sample data. No network/auth. */
@SuppressWarnings("deprecation")
public class PreviewActivity extends Activity {
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    setContentView(new FrameLayout(this));
    new android.os.Handler().post(() -> {
      try { renderAll(this); android.util.Log.i("EdutuPreview", "PASS: rendered all widget variants"); }
      catch (Throwable error) { android.util.Log.e("EdutuPreview", "FAIL", error); }
    });
  }
  public static void renderAll(Context base) throws Exception {
    File folder = new File(base.getExternalFilesDir(null), "previews"); folder.mkdirs();
    for (boolean dark : new boolean[]{false, true}) {
      for (float scale : new float[]{1f, 1.6f, 2f}) {
        Configuration configuration = new Configuration(base.getResources().getConfiguration());
        configuration.uiMode = (configuration.uiMode & ~Configuration.UI_MODE_NIGHT_MASK) | (dark ? Configuration.UI_MODE_NIGHT_YES : Configuration.UI_MODE_NIGHT_NO);
        configuration.fontScale = scale;
        Context context = base.createConfigurationContext(configuration);
        context.setTheme(android.R.style.Theme_Material_Light_NoActionBar);
        for (String type : new String[]{"nextstep", "matches", "chat"}) {
          for (int[] size : new int[][]{{160,160},{340,160},{340,340}}) {
            if (type.equals("chat") && size[1] == 340) continue;
            JSONArray items = new JSONArray();
            String[] titles = {"Review your personal statement", "Prepare your reference letter", "Check the application requirements", "Update your CV"};
            for (int i = 0; i < 4; i++) items.put(new JSONObject().put("id", "sample-"+i).put("title", type.equals("matches") ? new String[]{"Global scholarship opportunities", "Student leadership programme", "International internship", "Research fellowship"}[i] : titles[i]).put("organization", "Edutu").put("opportunity", "Global scholarship").put("deadline", "2099-12-01").put("dueAt", "2099-11-14").put("completed",1).put("total",3).put("deepLink","edutu://my-plan/sample").put("match",92));
            RemoteViews remote;
            if (type.equals("nextstep")) {
              JSONObject data = new JSONObject().put("state","ready").put("syncedAt",System.currentTimeMillis()).put("items",items);
              Method method = NextStepWidgetProvider.class.getDeclaredMethod("buildViews", Context.class, JSONObject.class, int.class, int.class); method.setAccessible(true);
              remote = (RemoteViews)method.invoke(new NextStepWidgetProvider(),context,data,size[0],size[1]);
            } else if (type.equals("matches")) {
              Method method = EdutuWidgetProvider.class.getDeclaredMethod("buildViews", Context.class, JSONArray.class, int.class, int.class); method.setAccessible(true);
              remote = (RemoteViews)method.invoke(new EdutuWidgetProvider(),context,items,size[0],size[1]);
            } else remote = new RemoteViews(context.getPackageName(),size[0] < 260 ? R.layout.edutu_chat_widget : R.layout.edutu_chat_widget_medium);
            String name = type+"_"+size[0]+"x"+size[1]+(dark ? "_dark" : "_light")+(scale==1f ? "" : "_font"+scale);
            render(context, remote, size[0], size[1], new File(folder,name+".png"));
          }
        }
      }
    }
    // Exercise empty/error/signed-out native states and the actual fallback view as well.
    for (String status : new String[]{"empty", "signed_out", "unavailable"}) {
      Method method = NextStepWidgetProvider.class.getDeclaredMethod("buildViews", Context.class, JSONObject.class, int.class, int.class); method.setAccessible(true);
      RemoteViews remote = (RemoteViews)method.invoke(new NextStepWidgetProvider(),base,new JSONObject().put("state",status),160,160);
      render(base,remote,160,160,new File(folder,"nextstep_"+status+".png"));
    }
  }
  private static void render(Context context, RemoteViews remote, int width, int height, File destination) throws Exception {
    FrameLayout parent = new FrameLayout(context);
    View view = remote.apply(context,parent);
    float density = context.getResources().getDisplayMetrics().density;
    int w = Math.round(width*density), h = Math.round(height*density);
    view.measure(View.MeasureSpec.makeMeasureSpec(w,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(h,View.MeasureSpec.EXACTLY));
    view.layout(0,0,w,h);
    Bitmap bitmap = Bitmap.createBitmap(w,h,Bitmap.Config.ARGB_8888);
    view.draw(new Canvas(bitmap));
    try (FileOutputStream output = new FileOutputStream(destination)) { bitmap.compress(Bitmap.CompressFormat.PNG,100,output); }
    bitmap.recycle();
  }
}
