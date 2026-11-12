package com.edutu.widgetpreview;

import android.app.Activity;
import android.appwidget.*;
import android.content.*;
import android.graphics.*;
import android.os.*;
import android.util.SizeF;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.util.*;

/** Test-only host: binds the installed release APK, never substitutes production views. */
public class InstalledWidgetActivity extends Activity {
  AppWidgetHost host;
  AppWidgetManager manager;
  LinearLayout root;
  final Handler handler = new Handler(Looper.getMainLooper());
  final ArrayList<String[]> cases = new ArrayList<>();
  final JSONArray results = new JSONArray();
  String mode;
  File folder;
  int currentId;
  AppWidgetHostView currentView;
  int updateWaits;
  int expectedUpdates;
  String currentProvider="";

  static class ObservedView extends AppWidgetHostView {
    int updates;
    ObservedView(Context context) { super(context); }
    public void updateAppWidget(RemoteViews views) {
      super.updateAppWidget(views);
      if (views != null) updates++;
    }
  }

  public void onCreate(Bundle state) {
    super.onCreate(state);
    mode = getResources().getConfiguration().isNightModeActive() ? "dark" : "light";
    folder = new File(getExternalFilesDir(null), "installed-"+mode); folder.mkdirs();
    manager = AppWidgetManager.getInstance(this);
    host = new AppWidgetHost(this, 20261112) {
      protected AppWidgetHostView onCreateView(Context context,int id,AppWidgetProviderInfo info) { return new ObservedView(context); }
    };
    host.deleteHost();
    host.startListening();
    for (String provider : new String[]{"EdutuWidgetProvider","DeadlineWidgetProvider","TrendingWidgetProvider","ChatWidgetProvider","NextStepWidgetProvider","TrendingSpotlightWidgetProvider","TrendingGridWidgetProvider","TrendingTickerWidgetProvider","TrendingThumbListWidgetProvider","NewsWidgetProvider"}) {
      boolean wide = provider.contains("Ticker") || provider.equals("NewsWidgetProvider");
      boolean list = provider.contains("ThumbList");
      if (provider.contains("Spotlight") || provider.contains("Grid")) cases.add(new String[]{provider,"110","110"});
      cases.add(new String[]{provider,wide?"180":list?"220":"140",wide?"110":"140"});
      cases.add(new String[]{provider,"340","160"});
      if (!provider.equals("ChatWidgetProvider")) cases.add(new String[]{provider,"340","340"});
    }
    String only = getIntent().getStringExtra("provider");
    if (only != null) cases.removeIf(c -> !c[0].equals(only));
    next(0);
  }

  int px(int dp) { return Math.round(dp*getResources().getDisplayMetrics().density); }

  void next(int index) {
    if (index == cases.size()) {
      if (currentId != 0) host.deleteAppWidgetId(currentId);
      try (FileWriter writer = new FileWriter(new File(folder,"results.json"))) { writer.write(results.toString(2)); }
      catch (Exception e) { throw new RuntimeException(e); }
      android.util.Log.i("EdutuInstalledTest", "DONE "+mode+" "+results.length()+" cases");
      return;
    }
    String[] test = cases.get(index);
    int width = Integer.parseInt(test[1]), height = Integer.parseInt(test[2]);
    root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL);
    root.setGravity(Gravity.CENTER_HORIZONTAL); root.setPadding(px(8),px(24),px(8),px(8));
    root.setBackgroundColor(mode.equals("dark")?0xff141820:0xffedf1f5);
    TextView label = new TextView(this); label.setText(test[0]+"\n"+width+" × "+height+" dp · "+mode+" · installed APK"); label.setTextSize(14);
    label.setTextColor(mode.equals("dark")?Color.WHITE:Color.BLACK); label.setPadding(0,0,0,px(20)); root.addView(label);
    setContentView(root);
    try {
      ComponentName component = new ComponentName("com.edutu.com","com.edutu.com.widgets."+test[0]);
      boolean resizing = currentProvider.equals(test[0]);
      if (!resizing) {
        if (currentId != 0) host.deleteAppWidgetId(currentId);
        currentId = host.allocateAppWidgetId();
        currentProvider=test[0];
      }
      Bundle options = new Bundle();
      options.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,width);
      options.putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH,width);
      options.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,height);
      options.putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT,height);
      options.putInt(AppWidgetManager.OPTION_APPWIDGET_HOST_CATEGORY,AppWidgetProviderInfo.WIDGET_CATEGORY_HOME_SCREEN);
      options.putParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES,new ArrayList<>(Arrays.asList(new SizeF(width,height))));
      if (!resizing && !manager.bindAppWidgetIdIfAllowed(currentId,component,options)) throw new IllegalStateException("Host binding permission missing");
      AppWidgetProviderInfo info = manager.getAppWidgetInfo(currentId);
      currentView = host.createView(this,currentId,info); currentView.setPadding(0,0,0,0);
      updateWaits=0;
      expectedUpdates=resizing?((ObservedView)currentView).updates+1:1;
      root.addView(currentView,new LinearLayout.LayoutParams(px(width),px(height)));
      manager.updateAppWidgetOptions(currentId,options);
      handler.postDelayed(() -> capture(index,test,width,height),4000);
    } catch (Exception e) { record(test,e.toString(),new JSONArray()); handler.postDelayed(() -> next(index+1),100); }
  }

  void inspect(View view, JSONArray text) throws Exception {
    if (view.getVisibility() != View.VISIBLE) return;
    if (view instanceof TextView) {
      TextView tv = (TextView)view;
      if (tv.getText().length()>0) text.put(new JSONObject().put("text",tv.getText()).put("width",tv.getWidth()).put("height",tv.getHeight()).put("clickable",tv.isClickable()));
    }
    if (view instanceof ViewGroup) for (int i=0;i<((ViewGroup)view).getChildCount();i++) inspect(((ViewGroup)view).getChildAt(i),text);
  }

  void record(String[] test,String error,JSONArray text) {
    try { results.put(new JSONObject().put("provider",test[0]).put("width",test[1]).put("height",test[2]).put("theme",mode).put("providerUpdates",currentView instanceof ObservedView?((ObservedView)currentView).updates:0).put("error",error).put("text",text)); }
    catch (Exception e) { throw new RuntimeException(e); }
  }

  void capture(int index,String[] test,int width,int height) {
    // PixelCopy needs a visible window. Pause rather than misreport a widget failure
    // when the user switches to Edutu to sign in during a test run.
    if (!hasWindowFocus()) {
      handler.postDelayed(() -> capture(index,test,width,height),1000);
      return;
    }
    if (((ObservedView)currentView).updates < expectedUpdates && updateWaits++ < 30) {
      handler.postDelayed(() -> capture(index,test,width,height),1000);
      return;
    }
    String name=test[0]+"_"+width+"x"+height;
    try {
      Bitmap bitmap=Bitmap.createBitmap(px(width),px(height),Bitmap.Config.ARGB_8888);
      int[] position=new int[2]; currentView.getLocationInWindow(position);
      Rect area=new Rect(position[0],position[1],position[0]+px(width),position[1]+px(height));
      PixelCopy.request(getWindow(),area,bitmap,status -> {
        try {
          if (status != PixelCopy.SUCCESS) throw new IllegalStateException("PixelCopy failed: "+status);
          try (FileOutputStream output=new FileOutputStream(new File(folder,name+".png"))) { bitmap.compress(Bitmap.CompressFormat.PNG,100,output); }
          JSONArray text=new JSONArray(); inspect(currentView,text);
          String visible=text.toString().toLowerCase();
          String error=(visible.contains("can't load") || visible.contains("couldn't add widget") || visible.contains("problem loading widget"))?"HOST_INFLATION_FAILURE":((ObservedView)currentView).updates<expectedUpdates?"NO_PROVIDER_UPDATE":"";
          record(test,error,text);
          android.util.Log.i("EdutuInstalledTest",name+" "+(error.isEmpty()?"RENDERED":error));
        } catch (Exception e) { record(test,e.toString(),new JSONArray()); }
        bitmap.recycle();
        handler.postDelayed(() -> next(index+1),100);
      },handler);
    } catch (Exception e) {
      record(test,e.toString(),new JSONArray());
      handler.postDelayed(() -> next(index+1),100);
    }
  }
  public void onDestroy() { handler.removeCallbacksAndMessages(null); if(host!=null)host.stopListening(); super.onDestroy(); }
}
