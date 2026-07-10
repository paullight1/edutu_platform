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
 * "Trending Grid" — a 2x2 board of trending opportunities, each tile a photo
 * cover with the title and deadline overlaid, each its own tap target. Covers
 * are downloaded + downsampled off the main thread; a tile with no photo falls
 * back to the brand inset surface.
 */
class TrendingGridWidgetProvider : AppWidgetProvider() {

  companion object {
    private const val PREFS = "edutu_trending_grid_prefs"
    private const val KEY_ITEMS = "grid_items_json"
    private const val TRENDING_FILE = "edutu_widget_trending.json"
    private const val TILE_COUNT = 4

    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
  }

  private data class Tile(val frameId: Int, val imageId: Int, val titleId: Int, val deadlineId: Int)

  private val tiles = listOf(
    Tile(R.id.edutu_tg_t1, R.id.edutu_tg_t1_image, R.id.edutu_tg_t1_title, R.id.edutu_tg_t1_deadline),
    Tile(R.id.edutu_tg_t2, R.id.edutu_tg_t2_image, R.id.edutu_tg_t2_title, R.id.edutu_tg_t2_deadline),
    Tile(R.id.edutu_tg_t3, R.id.edutu_tg_t3_image, R.id.edutu_tg_t3_title, R.id.edutu_tg_t3_deadline),
    Tile(R.id.edutu_tg_t4, R.id.edutu_tg_t4_image, R.id.edutu_tg_t4_title, R.id.edutu_tg_t4_deadline),
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
      val items = TrendingWidgetData.load(appContext, TRENDING_FILE, PREFS, KEY_ITEMS, TILE_COUNT * 2)
      if (items.length() == 0) return@execute

      val bitmaps = HashMap<Int, Bitmap>()
      for (i in 0 until minOf(TILE_COUNT, items.length())) {
        val item = items.optJSONObject(i) ?: continue
        WidgetSupport.fetchBitmap(item.optString("imageUrl"))?.let { bitmaps[i] = it }
      }

      mainHandler.post {
        val manager = AppWidgetManager.getInstance(appContext)
        val ids = manager.getAppWidgetIds(
          ComponentName(appContext, TrendingGridWidgetProvider::class.java)
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
    val items = TrendingWidgetData.load(context, TRENDING_FILE, PREFS, KEY_ITEMS, TILE_COUNT * 2)
    appWidgetIds.forEach { appWidgetId ->
      appWidgetManager.updateAppWidget(appWidgetId, buildViews(context, items, bitmaps))
    }
  }

  private fun buildViews(context: Context, items: JSONArray, bitmaps: Map<Int, Bitmap>?): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.edutu_trending_grid_widget)

    if (items.length() == 0) {
      views.setViewVisibility(R.id.edutu_tg_content, View.GONE)
      views.setViewVisibility(R.id.edutu_tg_empty, View.VISIBLE)
      views.setOnClickPendingIntent(
        R.id.edutu_tg_root,
        WidgetSupport.deepLinkIntent(context, "edutu://opportunities")
      )
      return views
    }

    views.setViewVisibility(R.id.edutu_tg_content, View.VISIBLE)
    views.setViewVisibility(R.id.edutu_tg_empty, View.GONE)

    for (i in tiles.indices) {
      val tile = tiles[i]
      val item = items.optJSONObject(i)
      if (item == null) {
        // Fewer than four trending items: leave the empty tiles as brand surface.
        views.setViewVisibility(tile.imageId, View.GONE)
        views.setTextViewText(tile.titleId, "")
        views.setTextViewText(tile.deadlineId, "")
        views.setOnClickPendingIntent(
          tile.frameId,
          WidgetSupport.deepLinkIntent(context, "edutu://opportunities")
        )
        continue
      }

      views.setTextViewText(tile.titleId, item.optString("title"))
      views.setTextViewText(tile.deadlineId, WidgetSupport.formatDeadline(context, item.optString("deadline")))

      val bitmap = bitmaps?.get(i)
      if (bitmap != null) {
        views.setImageViewBitmap(tile.imageId, bitmap)
        views.setViewVisibility(tile.imageId, View.VISIBLE)
      } else {
        views.setViewVisibility(tile.imageId, View.GONE)
      }

      views.setOnClickPendingIntent(
        tile.frameId,
        WidgetSupport.opportunityLink(context, item.optString("id"))
      )
    }

    return views
  }
}
