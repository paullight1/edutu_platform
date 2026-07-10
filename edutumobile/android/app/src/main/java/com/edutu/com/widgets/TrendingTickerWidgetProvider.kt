package com.edutu.com.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.graphics.Bitmap
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.RemoteViews
import com.edutu.com.R
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * "Trending Ticker" — a wide banner that fades through the hottest opportunities
 * on-device (ViewFlipper), each a full-bleed photo with a headline and a
 * meta + deadline row. Photos load off the main thread; banners cycle the
 * available items so the flipper never lands on a blank frame.
 */
class TrendingTickerWidgetProvider : AppWidgetProvider() {

  companion object {
    private const val PREFS = "edutu_trending_ticker_prefs"
    private const val KEY_ITEMS = "ticker_items_json"
    private const val TRENDING_FILE = "edutu_widget_trending.json"
    private const val BANNER_COUNT = 4

    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
  }

  private data class Banner(
    val frameId: Int,
    val imageId: Int,
    val titleId: Int,
    val metaId: Int,
    val deadlineId: Int,
  )

  private val banners = listOf(
    Banner(R.id.edutu_tk_b1, R.id.edutu_tk_b1_image, R.id.edutu_tk_b1_title, R.id.edutu_tk_b1_meta, R.id.edutu_tk_b1_deadline),
    Banner(R.id.edutu_tk_b2, R.id.edutu_tk_b2_image, R.id.edutu_tk_b2_title, R.id.edutu_tk_b2_meta, R.id.edutu_tk_b2_deadline),
    Banner(R.id.edutu_tk_b3, R.id.edutu_tk_b3_image, R.id.edutu_tk_b3_title, R.id.edutu_tk_b3_meta, R.id.edutu_tk_b3_deadline),
    Banner(R.id.edutu_tk_b4, R.id.edutu_tk_b4_image, R.id.edutu_tk_b4_title, R.id.edutu_tk_b4_meta, R.id.edutu_tk_b4_deadline),
  )

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray
  ) {
    render(context, appWidgetManager, appWidgetIds, null)
    refresh(context)
  }

  private fun refresh(context: Context) {
    val appContext = context.applicationContext
    executor.execute {
      val items = TrendingWidgetData.load(appContext, TRENDING_FILE, PREFS, KEY_ITEMS, BANNER_COUNT * 2)
      if (items.length() == 0) return@execute

      val bitmaps = HashMap<Int, Bitmap>()
      for (i in 0 until BANNER_COUNT) {
        val item = items.optJSONObject(i % items.length()) ?: continue
        if (bitmaps.containsKey(i)) continue
        WidgetSupport.fetchBitmap(item.optString("imageUrl"))?.let { bitmaps[i] = it }
      }

      mainHandler.post {
        val manager = AppWidgetManager.getInstance(appContext)
        val ids = manager.getAppWidgetIds(
          ComponentName(appContext, TrendingTickerWidgetProvider::class.java)
        )
        render(appContext, manager, ids, bitmaps)
      }
    }
  }

  private fun render(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
    bitmaps: Map<Int, Bitmap>?,
  ) {
    val items = TrendingWidgetData.load(context, TRENDING_FILE, PREFS, KEY_ITEMS, BANNER_COUNT * 2)
    appWidgetIds.forEach { appWidgetId ->
      appWidgetManager.updateAppWidget(appWidgetId, buildViews(context, items, bitmaps))
    }
  }

  private fun buildViews(context: Context, items: JSONArray, bitmaps: Map<Int, Bitmap>?): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.edutu_trending_ticker_widget)

    if (items.length() == 0) {
      views.setViewVisibility(R.id.edutu_tk_flipper, View.GONE)
      views.setViewVisibility(R.id.edutu_tk_empty, View.VISIBLE)
      views.setOnClickPendingIntent(
        R.id.edutu_tk_root,
        WidgetSupport.deepLinkIntent(context, "edutu://opportunities")
      )
      return views
    }

    views.setViewVisibility(R.id.edutu_tk_flipper, View.VISIBLE)
    views.setViewVisibility(R.id.edutu_tk_empty, View.GONE)

    for (i in banners.indices) {
      val banner = banners[i]
      val item = items.optJSONObject(i % items.length()) ?: JSONObject()
      val category = item.optString("category").ifBlank { "Trending" }
      val organization = item.optString("organization").ifBlank { "Edutu" }

      views.setTextViewText(banner.titleId, item.optString("title"))
      views.setTextViewText(banner.metaId, "$category · $organization")
      views.setTextViewText(banner.deadlineId, WidgetSupport.formatDeadline(context, item.optString("deadline")))

      val bitmap = bitmaps?.get(i)
      if (bitmap != null) {
        views.setImageViewBitmap(banner.imageId, bitmap)
        views.setViewVisibility(banner.imageId, View.VISIBLE)
      } else {
        views.setViewVisibility(banner.imageId, View.GONE)
      }

      views.setOnClickPendingIntent(
        banner.frameId,
        WidgetSupport.opportunityLink(context, item.optString("id"))
      )
    }

    return views
  }
}
