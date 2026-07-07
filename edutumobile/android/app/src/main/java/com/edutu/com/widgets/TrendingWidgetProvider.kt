package com.edutu.com.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.RemoteViews
import com.edutu.com.R
import org.json.JSONArray
import java.util.concurrent.Executors

/**
 * "Trending" widget: what's hot on Edutu right now (the public feed, not the
 * user's personalised ranking). Small placements show the #1 item as a
 * poster; larger ones a ranked list.
 *
 * Data: the app writes a trending file on sync; when it's missing or stale
 * the widget fetches the public API itself — same two-tier pattern as the
 * Top Matches widget.
 */
class TrendingWidgetProvider : AppWidgetProvider() {

  companion object {
    private const val PREFS = "edutu_trending_widget_prefs"
    private const val KEY_ITEMS = "items_json"
    private const val APP_ITEMS_FILE = "edutu_widget_trending.json"

    private const val SIZE_SMALL = 0
    private const val SIZE_MEDIUM = 1
    private const val SIZE_LARGE = 2

    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
  }

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray
  ) {
    render(context, appWidgetManager, appWidgetIds)
    refresh(context)
  }

  override fun onAppWidgetOptionsChanged(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetId: Int,
    newOptions: android.os.Bundle
  ) {
    render(context, appWidgetManager, intArrayOf(appWidgetId))
  }

  private fun refresh(context: Context) {
    val appContext = context.applicationContext
    val appItems = WidgetSupport.readAppItemsFile(appContext, APP_ITEMS_FILE)
    if (appItems != null && !appItems.isOlderThan(WidgetSupport.APP_ITEMS_REFRESH_AFTER_MS)) return
    executor.execute {
      val items = WidgetSupport.fetchOpportunities(appContext, limit = 8) ?: return@execute
      appContext
        .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString(KEY_ITEMS, items.toString())
        .apply()

      mainHandler.post {
        val manager = AppWidgetManager.getInstance(appContext)
        val ids = manager.getAppWidgetIds(
          android.content.ComponentName(appContext, TrendingWidgetProvider::class.java)
        )
        render(appContext, manager, ids)
      }
    }
  }

  private fun render(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray
  ) {
    val items = pickItems(context)
    appWidgetIds.forEach { appWidgetId ->
      val options = appWidgetManager.getAppWidgetOptions(appWidgetId)
      val views = buildViews(context, items, pickSize(options))
      appWidgetManager.updateAppWidget(appWidgetId, views)
    }
  }

  private fun pickItems(context: Context): JSONArray {
    val appItems = WidgetSupport.readAppItemsFile(context, APP_ITEMS_FILE)
    val cached = readCachedItems(context)
    val source = when {
      appItems != null && !appItems.isOlderThan(WidgetSupport.APP_ITEMS_TRUST_FOR_MS) -> appItems.items
      cached.length() > 0 -> cached
      else -> appItems?.items ?: JSONArray()
    }
    // Drop closed ones at render time so the list stays accurate.
    val fresh = JSONArray()
    for (i in 0 until source.length()) {
      val item = source.optJSONObject(i) ?: continue
      if (item.optString("title").isEmpty()) continue
      if (WidgetSupport.isExpired(item.optString("deadline"))) continue
      fresh.put(item)
    }
    return fresh
  }

  private fun pickSize(options: android.os.Bundle?): Int {
    val minWidth = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0) ?: 0
    val minHeight = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0) ?: 0
    return when {
      minHeight >= 200 -> SIZE_LARGE
      minWidth in 1 until 180 -> SIZE_SMALL
      else -> SIZE_MEDIUM
    }
  }

  private fun buildViews(context: Context, items: JSONArray, size: Int): RemoteViews {
    return if (size == SIZE_SMALL) {
      smallViews(context, items)
    } else {
      listViews(context, items, if (size == SIZE_LARGE) 5 else 3)
    }
  }

  private fun smallViews(context: Context, items: JSONArray): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.edutu_trending_widget_small)
    val hero = items.optJSONObject(0)
    if (hero == null) {
      views.setViewVisibility(R.id.edutu_tw_content, View.GONE)
      views.setViewVisibility(R.id.edutu_tw_empty, View.VISIBLE)
      views.setOnClickPendingIntent(
        R.id.edutu_tw_root,
        WidgetSupport.deepLinkIntent(context, "edutu://opportunities")
      )
      return views
    }

    views.setViewVisibility(R.id.edutu_tw_content, View.VISIBLE)
    views.setViewVisibility(R.id.edutu_tw_empty, View.GONE)

    val deadlineRaw = hero.optString("deadline")
    views.setTextViewText(R.id.edutu_tw_title, hero.optString("title"))
    views.setTextViewText(
      R.id.edutu_tw_category,
      hero.optString("category").ifEmpty { hero.optString("organization").ifEmpty { "Opportunity" } }
    )
    views.setTextViewText(R.id.edutu_tw_deadline, WidgetSupport.formatDeadline(context, deadlineRaw))
    views.setTextColor(R.id.edutu_tw_deadline, WidgetSupport.urgencyTextColor(context, deadlineRaw))
    views.setOnClickPendingIntent(
      R.id.edutu_tw_root,
      WidgetSupport.opportunityLink(context, hero.optString("id"))
    )
    return views
  }

  private fun listViews(context: Context, items: JSONArray, maxRows: Int): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.edutu_trending_widget)

    if (items.length() == 0) {
      views.setViewVisibility(R.id.edutu_tw_content, View.GONE)
      views.setViewVisibility(R.id.edutu_tw_empty, View.VISIBLE)
      views.setOnClickPendingIntent(
        R.id.edutu_tw_root,
        WidgetSupport.deepLinkIntent(context, "edutu://opportunities")
      )
      return views
    }

    views.setViewVisibility(R.id.edutu_tw_content, View.VISIBLE)
    views.setViewVisibility(R.id.edutu_tw_empty, View.GONE)

    val rows = listOf(
      listOf(R.id.edutu_tw_r1, R.id.edutu_tw_r1_title, R.id.edutu_tw_r1_sub, R.id.edutu_tw_r1_deadline),
      listOf(R.id.edutu_tw_r2, R.id.edutu_tw_r2_title, R.id.edutu_tw_r2_sub, R.id.edutu_tw_r2_deadline),
      listOf(R.id.edutu_tw_r3, R.id.edutu_tw_r3_title, R.id.edutu_tw_r3_sub, R.id.edutu_tw_r3_deadline),
      listOf(R.id.edutu_tw_r4, R.id.edutu_tw_r4_title, R.id.edutu_tw_r4_sub, R.id.edutu_tw_r4_deadline),
      listOf(R.id.edutu_tw_r5, R.id.edutu_tw_r5_title, R.id.edutu_tw_r5_sub, R.id.edutu_tw_r5_deadline)
    )

    for (i in rows.indices) {
      val (rowId, titleId, subId, deadlineId) = rows[i]
      val item = if (i < maxRows) items.optJSONObject(i) else null
      if (item == null) {
        views.setViewVisibility(rowId, View.GONE)
        continue
      }
      val deadlineRaw = item.optString("deadline")
      views.setViewVisibility(rowId, View.VISIBLE)
      views.setTextViewText(titleId, item.optString("title"))
      views.setTextViewText(subId, item.optString("organization").ifEmpty { "Edutu" })
      views.setTextViewText(deadlineId, WidgetSupport.formatDeadline(context, deadlineRaw))
      views.setTextColor(deadlineId, WidgetSupport.urgencyTextColor(context, deadlineRaw))
      views.setOnClickPendingIntent(rowId, WidgetSupport.opportunityLink(context, item.optString("id")))
    }

    views.setOnClickPendingIntent(
      R.id.edutu_tw_root,
      WidgetSupport.deepLinkIntent(context, "edutu://opportunities")
    )
    return views
  }

  private fun readCachedItems(context: Context): JSONArray {
    return try {
      val raw = context
        .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .getString(KEY_ITEMS, null)
      if (raw.isNullOrEmpty()) JSONArray() else JSONArray(raw)
    } catch (e: Exception) {
      JSONArray()
    }
  }
}
