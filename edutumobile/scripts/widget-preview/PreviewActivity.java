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
    java.util.ArrayList<String> failures = new java.util.ArrayList<>();
    for (boolean dark : new boolean[]{false, true}) {
      for (float scale : new float[]{1f, 1.6f, 2f}) {
        Configuration configuration = new Configuration(base.getResources().getConfiguration());
        configuration.uiMode = (configuration.uiMode & ~Configuration.UI_MODE_NIGHT_MASK) | (dark ? Configuration.UI_MODE_NIGHT_YES : Configuration.UI_MODE_NIGHT_NO);
        configuration.fontScale = scale;
        Context context = base.createConfigurationContext(configuration);
        context.setTheme(android.R.style.Theme_Material_Light_NoActionBar);
        for (String type : new String[]{"nextstep", "matches", "chat", "deadlines", "trending", "spotlight", "grid", "ticker", "list", "news"}) {
          for (int[] size : sizes(type)) {
            if (type.equals("chat") && size[1] == 340) continue;
            if ((type.equals("ticker") || type.equals("news") || type.equals("list")) && size[0] == 160) continue;
            JSONArray items = new JSONArray();
            String[] titles = {"Review your personal statement", "Prepare your reference letter", "Check the application requirements", "Update your CV"};
            for (int i = 0; i < 4; i++) items.put(new JSONObject().put("id", "sample-"+i).put("title", type.equals("matches") ? new String[]{"Global scholarship opportunities", "Student leadership programme", "International internship", "Research fellowship"}[i] : titles[i]).put("organization", "Edutu").put("opportunity", "Global scholarship").put("deadline", java.time.LocalDate.now().plusDays(8).toString()).put("dueAt", java.time.LocalDate.now().plusDays(3).toString()).put("completed",1).put("total",3).put("deepLink","edutu://my-plan/sample").put("match",92).put("url","https://edutu.org").put("published_at","2026-11-12T10:00:00Z").put("source","Edutu News"));
            RemoteViews remote;
            if (type.equals("nextstep")) {
              JSONObject data = new JSONObject().put("state","ready").put("syncedAt",System.currentTimeMillis()).put("items",items);
              Method method = NextStepWidgetProvider.class.getDeclaredMethod("buildViews", Context.class, JSONObject.class, int.class, int.class); method.setAccessible(true);
              remote = (RemoteViews)method.invoke(new NextStepWidgetProvider(),context,data,size[0],size[1]);
            } else if (type.equals("matches")) {
              Method method = EdutuWidgetProvider.class.getDeclaredMethod("buildViews", Context.class, JSONArray.class, int.class, int.class); method.setAccessible(true);
              remote = (RemoteViews)method.invoke(new EdutuWidgetProvider(),context,items,size[0],size[1]);
            } else if (type.equals("chat")) {
              remote = new RemoteViews(context.getPackageName(),size[0] < 260 ? R.layout.edutu_chat_widget : R.layout.edutu_chat_widget_medium);
              remote.setViewVisibility(R.id.edutu_cw_hint, scale > 1.3f ? View.GONE : View.VISIBLE);
              boolean compactLargeText = size[0] < 260 && scale > 1.3f;
              remote.setViewVisibility(R.id.edutu_cw_title, compactLargeText ? View.GONE : View.VISIBLE);
              remote.setTextViewText(R.id.edutu_cw_action, context.getString(compactLargeText ? R.string.edutu_widget_ask_short : R.string.edutu_widget_ask_action));
              if (size[0] >= 260) remote.setViewVisibility(R.id.edutu_cw_label, scale > 1.3f ? View.GONE : View.VISIBLE);
            } else {
              String provider = new java.util.HashMap<String,String>() {{ put("deadlines","DeadlineWidgetProvider"); put("trending","TrendingWidgetProvider"); put("spotlight","TrendingSpotlightWidgetProvider"); put("grid","TrendingGridWidgetProvider"); put("ticker","TrendingTickerWidgetProvider"); put("list","TrendingThumbListWidgetProvider"); put("news","NewsWidgetProvider"); }}.get(type);
              Class<?> cls = Class.forName("com.edutu.com.widgets."+provider);
              boolean sized = true;
              boolean images = !(type.equals("deadlines") || type.equals("trending"));
              java.util.ArrayList<Class<?>> signature = new java.util.ArrayList<>(); signature.add(Context.class); signature.add(JSONArray.class);
              java.util.ArrayList<Object> args = new java.util.ArrayList<>(); args.add(context); args.add(items);
              if (images) { signature.add(java.util.Map.class); args.add(null); }
              if (sized) { signature.add(int.class); signature.add(int.class); args.add(size[0]); args.add(size[1]); }
              Method method = cls.getDeclaredMethod("buildViews",signature.toArray(new Class<?>[0])); method.setAccessible(true);
              remote = (RemoteViews)method.invoke(cls.getDeclaredConstructor().newInstance(),args.toArray());
            }
            String name = type+"_"+size[0]+"x"+size[1]+(dark ? "_dark" : "_light")+(scale==1f ? "" : "_font"+scale);
            try { render(context, remote, size[0], size[1], new File(folder,name+".png")); } catch (AssertionError error) { failures.add(error.getMessage()); }
          }
        }
      }
    }
    if (!failures.isEmpty()) throw new AssertionError(String.join("\n", failures));
    // Exercise empty/error/signed-out native states and the actual fallback view as well.
    for (String status : new String[]{"empty", "signed_out", "unavailable"}) {
      Method method = NextStepWidgetProvider.class.getDeclaredMethod("buildViews", Context.class, JSONObject.class, int.class, int.class); method.setAccessible(true);
      RemoteViews remote = (RemoteViews)method.invoke(new NextStepWidgetProvider(),base,new JSONObject().put("state",status),160,160);
      render(base,remote,160,160,new File(folder,"nextstep_"+status+".png"));
    }
  }
  private static int[][] sizes(String type) {
    if (type.equals("ticker") || type.equals("news")) return new int[][]{{180,110},{340,160},{340,340}};
    if (type.equals("list")) return new int[][]{{220,140},{340,160},{340,340}};
    if (type.equals("chat")) return new int[][]{{140,140},{160,160},{340,160}};
    if (type.equals("spotlight") || type.equals("grid")) return new int[][]{{110,110},{140,140},{160,160},{340,160},{340,340}};
    return new int[][]{{140,140},{160,160},{340,160},{340,340}};
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
    verifyAction(view, R.id.edutu_cw_action, destination.getName());
    verifyAction(view, R.id.edutu_ns_action, destination.getName());
    verifyTextBounds((android.view.ViewGroup)view, view, destination.getName(), new java.util.ArrayList<android.graphics.Rect>());

  }
  private static void verifyAction(View root, int id, String variant) {
    android.widget.TextView action = root.findViewById(id);
    if (action == null || action.getVisibility() != View.VISIBLE) return;
    android.text.Layout layout = action.getLayout();
    if (layout == null || action.getHeight() <= 0) throw new AssertionError(variant+": action is not laid out");
    for (int i=0;i<layout.getLineCount();i++) {
      if (layout.getEllipsisCount(i)>0) throw new AssertionError(variant+": action text is truncated: "+action.getText());
    }
  }
  private static void verifyTextBounds(android.view.ViewGroup root, View view, String variant, java.util.ArrayList<android.graphics.Rect> occupied) {
    if (view.getVisibility() != View.VISIBLE) return;
    if (view instanceof android.widget.TextView && ((android.widget.TextView)view).getText().length()>0) {
      android.graphics.Rect rect = new android.graphics.Rect(0,0,view.getWidth(),view.getHeight());
      root.offsetDescendantRectToMyCoords(view,rect);
      if (rect.top < 0 || rect.bottom > root.getHeight()+1 || rect.left < 0 || rect.right > root.getWidth()+1)
        throw new AssertionError(variant+": text falls outside widget: "+((android.widget.TextView)view).getText()+" "+rect);
      for (android.graphics.Rect previous : occupied) if (android.graphics.Rect.intersects(rect,previous))
        throw new AssertionError(variant+": overlapping text: "+((android.widget.TextView)view).getText());
      occupied.add(rect);
    }
    if (view instanceof android.view.ViewGroup) {
      android.view.ViewGroup group=(android.view.ViewGroup)view;
      for (int i=0;i<group.getChildCount();i++) verifyTextBounds(root,group.getChildAt(i),variant,occupied);
    }
  }
}
