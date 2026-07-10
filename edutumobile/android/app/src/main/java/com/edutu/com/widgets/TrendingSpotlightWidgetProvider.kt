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
 * "Trending Spotlight" — a 2x2 poster that auto-rotates through the hottest
 * opportunities on-device. The layout's ViewFlipper fades between four full-bleed
 * image posters every few seconds with no app wake-up; this provider fills each
 * poster's background photo (downloaded + downsampled off the main thread),
 * category, title and deadline, and wires each poster to open its opportunity.
 *
 * When fewer than four opportunities are available the posters cycle through the
 * ones we have, so the flipper never lands on a blank frame.
 */
class TrendingSpotlightWidgetProvider : AppWidgetProvider() {

  companion object {
    private const val PREFS = "edutu_trending_widget_prefs"
    private const val KEY_ITEMS = "spotlight_items_json"
    private const val TRENDING_FILE = "edutu_widget_trending.json"
    private const val POSTER_COUNT = 4

    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
  }

  private data class Poster(
    val frameId: Int,
    val imageId: Int,
    val categoryId: Int,
    val titleId: Int,
    val deadlineId: Int,
  )

  private val posters = listOf(
    Poster(R.id.edutu_ts_p1, R.id.edutu_ts_p1_image, R.id.edutu_ts_p1_category, R.id.edutu_ts_p1_title, R.id.edutu_ts_p1_deadline),
    Poster(R.id.edutu_ts_p2, R.id.edutu_ts_p2_image, R.id.edutu_ts_p2_category, R.id.edutu_ts_p2_title, R.id.edutu_ts_p2_deadline),
    Poster(R.id.edutu_ts_p3, R.id.edutu_ts_p3_image, R.id.edutu_ts_p3_category, R.id.edutu_ts_p3_title, R.id.edutu_ts_p3_deadline),
    Poster(R.id.edutu_ts_p4, R.id.edutu_ts_p4_image, R.id.edutu_ts_p4_category, R.id.edutu_ts_p4_title, R.id.edutu_ts_p4_deadline),
  )

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray
  ) {
    // Paint text/layout instantly from cache, then load the poster images.
    render(context, appWidgetManager, appWidgetIds, null)
    refresh(context)
  }

  private fun refresh(context: Context) {
    val appContext = context.applicationContext
    executor.execute {
      val items = TrendingWidgetData.load(appContext, TRENDING_FILE, PREFS, KEY_ITEMS, POSTER_COUNT * 2)
      if (items.length() == 0) return@execute

      // Download a poster image per unique opportunity we will show.
      val bitmaps = HashMap<Int, Bitmap>()
      for (i in 0 until POSTER_COUNT) {
        val item = items.optJSONObject(i % items.length()) ?: continue
        val url = item.optString("imageUrl")
        if (url.isBlank() || bitmaps.containsKey(i)) continue
        WidgetSupport.fetchBitmap(url)?.let { bitmaps[i] = it }
      }

      mainHandler.post {
        val manager = AppWidgetManager.getInstance(appContext)
        val ids = manager.getAppWidgetIds(
          ComponentName(appContext, TrendingSpotlightWidgetProvider::class.java)
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
    val items = TrendingWidgetData.load(context, TRENDING_FILE, PREFS, KEY_ITEMS, POSTER_COUNT * 2)
    appWidgetIds.forEach { appWidgetId ->
      val views = buildViews(context, items, bitmaps)
      appWidgetManager.updateAppWidget(appWidgetId, views)
    }
  }

  private fun buildViews(context: Context, items: JSONArray, bitmaps: Map<Int, Bitmap>?): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.edutu_trending_spotlight_widget)

    if (items.length() == 0) {
      views.setViewVisibility(R.id.edutu_ts_flipper, View.GONE)
      views.setViewVisibility(R.id.edutu_ts_empty, View.VISIBLE)
      views.setOnClickPendingIntent(
        R.id.edutu_ts_root,
        WidgetSupport.deepLinkIntent(context, "edutu://opportunities")
      )
      return views
    }

    views.setViewVisibility(R.id.edutu_ts_flipper, View.VISIBLE)
    views.setViewVisibility(R.id.edutu_ts_empty, View.GONE)

    for (i in posters.indices) {
      val poster = posters[i]
      val item = items.optJSONObject(i % items.length()) ?: JSONObject()
      val deadlineRaw = item.optString("deadline")

      views.setTextViewText(
        poster.categoryId,
        item.optString("category").ifBlank { context.getString(R.string.edutu_widget_trending) }
      )
      views.setTextViewText(poster.titleId, item.optString("title"))
      views.setTextViewText(poster.deadlineId, WidgetSupport.formatDeadline(context, deadlineRaw))

      val bitmap = bitmaps?.get(i)
      if (bitmap != null) {
        views.setImageViewBitmap(poster.imageId, bitmap)
        views.setViewVisibility(poster.imageId, View.VISIBLE)
      } else {
        // No photo → the poster falls back to the brand navy surface behind it.
        views.setViewVisibility(poster.imageId, View.GONE)
      }

      views.setOnClickPendingIntent(
        poster.frameId,
        WidgetSupport.opportunityLink(context, item.optString("id"))
      )
    }

    return views
  }
}
