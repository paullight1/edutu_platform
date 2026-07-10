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
 * "Trending Thumbnail List" — a ranked list of trending opportunities, each row
 * a photo thumbnail + title/organization + an urgency-coloured deadline. Rows
 * with no item are hidden; thumbnails load off the main thread.
 */
class TrendingThumbListWidgetProvider : AppWidgetProvider() {

  companion object {
    private const val PREFS = "edutu_trending_thumblist_prefs"
    private const val KEY_ITEMS = "thumblist_items_json"
    private const val TRENDING_FILE = "edutu_widget_trending.json"
    private const val ROW_COUNT = 4
    private const val THUMB_WIDTH = 160

    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
  }

  private data class Row(
    val rowId: Int,
    val imageId: Int,
    val titleId: Int,
    val metaId: Int,
    val deadlineId: Int,
  )

  private val rows = listOf(
    Row(R.id.edutu_thl_r1, R.id.edutu_thl_r1_image, R.id.edutu_thl_r1_title, R.id.edutu_thl_r1_meta, R.id.edutu_thl_r1_deadline),
    Row(R.id.edutu_thl_r2, R.id.edutu_thl_r2_image, R.id.edutu_thl_r2_title, R.id.edutu_thl_r2_meta, R.id.edutu_thl_r2_deadline),
    Row(R.id.edutu_thl_r3, R.id.edutu_thl_r3_image, R.id.edutu_thl_r3_title, R.id.edutu_thl_r3_meta, R.id.edutu_thl_r3_deadline),
    Row(R.id.edutu_thl_r4, R.id.edutu_thl_r4_image, R.id.edutu_thl_r4_title, R.id.edutu_thl_r4_meta, R.id.edutu_thl_r4_deadline),
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
      val items = TrendingWidgetData.load(appContext, TRENDING_FILE, PREFS, KEY_ITEMS, ROW_COUNT * 2)
      if (items.length() == 0) return@execute

      val bitmaps = HashMap<Int, Bitmap>()
      for (i in 0 until minOf(ROW_COUNT, items.length())) {
        val item = items.optJSONObject(i) ?: continue
        WidgetSupport.fetchBitmap(item.optString("imageUrl"), THUMB_WIDTH)?.let { bitmaps[i] = it }
      }

      mainHandler.post {
        val manager = AppWidgetManager.getInstance(appContext)
        val ids = manager.getAppWidgetIds(
          ComponentName(appContext, TrendingThumbListWidgetProvider::class.java)
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
    val items = TrendingWidgetData.load(context, TRENDING_FILE, PREFS, KEY_ITEMS, ROW_COUNT * 2)
    appWidgetIds.forEach { appWidgetId ->
      appWidgetManager.updateAppWidget(appWidgetId, buildViews(context, items, bitmaps))
    }
  }

  private fun buildViews(context: Context, items: JSONArray, bitmaps: Map<Int, Bitmap>?): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.edutu_trending_thumblist_widget)

    if (items.length() == 0) {
      views.setViewVisibility(R.id.edutu_thl_content, View.GONE)
      views.setViewVisibility(R.id.edutu_thl_empty, View.VISIBLE)
      views.setOnClickPendingIntent(
        R.id.edutu_thl_root,
        WidgetSupport.deepLinkIntent(context, "edutu://opportunities")
      )
      return views
    }

    views.setViewVisibility(R.id.edutu_thl_content, View.VISIBLE)
    views.setViewVisibility(R.id.edutu_thl_empty, View.GONE)

    for (i in rows.indices) {
      val row = rows[i]
      val item = items.optJSONObject(i)
      if (item == null) {
        views.setViewVisibility(row.rowId, View.GONE)
        continue
      }

      val category = item.optString("category").ifBlank { "Trending" }
      val organization = item.optString("organization").ifBlank { "Edutu" }
      val deadlineRaw = item.optString("deadline")

      views.setViewVisibility(row.rowId, View.VISIBLE)
      views.setTextViewText(row.titleId, item.optString("title"))
      views.setTextViewText(row.metaId, "$category · $organization")
      views.setTextViewText(row.deadlineId, WidgetSupport.formatDeadline(context, deadlineRaw))
      views.setTextColor(row.deadlineId, WidgetSupport.urgencyTextColor(context, deadlineRaw))

      val bitmap = bitmaps?.get(i)
      if (bitmap != null) {
        views.setImageViewBitmap(row.imageId, bitmap)
      }

      views.setOnClickPendingIntent(
        row.rowId,
        WidgetSupport.opportunityLink(context, item.optString("id"))
      )
    }

    return views
  }
}
