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
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * "Top Matches" home-screen widget: the user's top live opportunities (match
 * %, title, organization, an urgency-coloured deadline chip) with the Edutu
 * logo as its only branding. Mirrors the iOS OpportunityWidget.
 *
 * Data path (self-contained, no extra Gradle deps, no JS bridge):
 *   1. Render instantly from the personalised list the app wrote (or the
 *      widget's own SharedPreferences cache).
 *   2. When that list is missing or stale, fetch fresh opportunities from the
 *      product API on a background thread, cache, re-render.
 *
 * Sizes: compact poster, expanded hero, and a ranked-list layout for large
 * placements, mapped responsively from the widget's cell size.
 */
class EdutuWidgetProvider : AppWidgetProvider() {

  companion object {
    private const val PREFS = "edutu_widget_prefs"
    private const val KEY_ITEMS = "items_json"
    // The JS app writes its personalised, ranked list here (in the app's
    // documents dir, i.e. filesDir — the same path expo-file-system's
    // `Paths.document` maps to).
    private const val APP_ITEMS_FILE = "edutu_widget_items.json"

    private const val SIZE_COMPACT = 0
    private const val SIZE_EXPANDED = 1
    private const val SIZE_LARGE = 2

    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
  }

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray
  ) {
    // Paint immediately from cache so the widget never shows a blank frame.
    render(context, appWidgetManager, appWidgetIds)
    // Then refresh from the network and repaint.
    refresh(context)
  }

  // Re-render a single widget when the user resizes it, so it can swap between
  // the compact / expanded / large-list layouts.
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
    // The app writes a personalised, already-ranked list when it runs. While
    // that list is fresh we show it and skip the widget's own generic fetch;
    // once it goes stale we refresh the fallback cache so render() has
    // current data to fall back to.
    val appItems = readAppItems(appContext)
    if (appItems != null && !appItems.isOlderThan(WidgetSupport.APP_ITEMS_REFRESH_AFTER_MS)) return
    executor.execute {
      val items = WidgetSupport.fetchOpportunities(appContext) ?: return@execute
      appContext
        .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString(KEY_ITEMS, items.toString())
        .apply()

      mainHandler.post {
        val manager = AppWidgetManager.getInstance(appContext)
        val ids = manager.getAppWidgetIds(
          android.content.ComponentName(appContext, EdutuWidgetProvider::class.java)
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
    // The personalised app-provided list wins while it's reasonably recent
    // (its deadlines are re-formatted and expiry-checked every render, so it
    // stays *accurate* — it just stops reflecting new opportunities). Once
    // it's over a week old, prefer the widget's own fresher generic fetch,
    // keeping the stale personalised list only as a last resort.
    val appItems = readAppItems(context)
    val cached = readCachedItems(context)
    val items = when {
      appItems != null && !appItems.isOlderThan(WidgetSupport.APP_ITEMS_TRUST_FOR_MS) -> appItems.items
      cached.length() > 0 -> cached
      else -> appItems?.items ?: JSONArray()
    }
    appWidgetIds.forEach { appWidgetId ->
      val options = appWidgetManager.getAppWidgetOptions(appWidgetId)
      val views = buildViews(context, items, pickSize(options))
      appWidgetManager.updateAppWidget(appWidgetId, views)
    }
  }

  /**
   * Choose a layout from the widget's current cell size. Works on every API
   * level (reads the options bundle), defaulting to expanded when the size is
   * not yet known.
   */
  private fun pickSize(options: android.os.Bundle?): Int {
    val minWidth = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0) ?: 0
    // MIN_HEIGHT is the guaranteed (portrait) height, so a short widget never
    // tries to cram the 4-row list.
    val minHeight = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0) ?: 0
    return when {
      minHeight >= 200 -> SIZE_LARGE
      minWidth in 1 until 180 -> SIZE_COMPACT
      else -> SIZE_EXPANDED
    }
  }

  private fun buildViews(context: Context, items: JSONArray, size: Int): RemoteViews {
    if (items.length() == 0) return emptyViews(context)
    return when (size) {
      SIZE_COMPACT -> compactViews(context, items)
      SIZE_LARGE -> largeViews(context, items)
      else -> expandedViews(context, items)
    }
  }

  private fun emptyViews(context: Context): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.edutu_widget)
    views.setTextViewText(R.id.edutu_widget_title, context.getString(R.string.edutu_widget_title))
    views.setTextViewText(R.id.edutu_widget_subtitle, context.getString(R.string.edutu_widget_subtitle))
    views.setTextViewText(R.id.edutu_widget_match, context.getString(R.string.edutu_widget_pick))
    views.setTextViewText(R.id.edutu_widget_deadline, context.getString(R.string.edutu_widget_open_now))
    views.setOnClickPendingIntent(
      R.id.edutu_widget_root,
      WidgetSupport.deepLinkIntent(context, "edutu://opportunities")
    )
    return views
  }

  private fun compactViews(context: Context, items: JSONArray): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.edutu_widget_compact)
    val hero = items.optJSONObject(0) ?: JSONObject()
    val deadlineRaw = hero.optString("deadline")
    val id = hero.optString("id")
    views.setTextViewText(
      R.id.edutu_widget_title,
      hero.optString("title", context.getString(R.string.edutu_widget_title))
    )
    bindDeadlineChip(context, views, deadlineRaw)
    views.setOnClickPendingIntent(R.id.edutu_widget_root, WidgetSupport.opportunityLink(context, id))
    return views
  }

  private fun expandedViews(context: Context, items: JSONArray): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.edutu_widget)
    val hero = items.optJSONObject(0) ?: JSONObject()
    val deadlineRaw = hero.optString("deadline")
    val match = hero.optInt("match", 0)
    val id = hero.optString("id")
    views.setTextViewText(
      R.id.edutu_widget_title,
      hero.optString("title", context.getString(R.string.edutu_widget_title))
    )
    views.setTextViewText(R.id.edutu_widget_subtitle, hero.optString("organization").ifEmpty { "Edutu" })
    bindDeadlineChip(context, views, deadlineRaw)
    views.setTextViewText(
      R.id.edutu_widget_match,
      if (match > 0) "$match% match" else context.getString(R.string.edutu_widget_pick)
    )
    views.setOnClickPendingIntent(R.id.edutu_widget_root, WidgetSupport.opportunityLink(context, id))
    return views
  }

  private fun bindDeadlineChip(context: Context, views: RemoteViews, deadlineRaw: String?) {
    views.setTextViewText(R.id.edutu_widget_deadline, WidgetSupport.formatDeadline(context, deadlineRaw))
    views.setInt(
      R.id.edutu_widget_deadline,
      "setBackgroundResource",
      WidgetSupport.chipBackgroundRes(deadlineRaw)
    )
  }

  /**
   * The ranked list — up to four opportunities, each its own tap target.
   * Mirrors the iOS systemLarge widget.
   */
  private fun largeViews(context: Context, items: JSONArray): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.edutu_widget_large)
    views.setTextViewText(R.id.edutu_widget_header, context.getString(R.string.edutu_widget_radar))

    val rows = listOf(
      listOf(R.id.edutu_widget_r1, R.id.edutu_widget_r1_title, R.id.edutu_widget_r1_sub, R.id.edutu_widget_r1_deadline),
      listOf(R.id.edutu_widget_r2, R.id.edutu_widget_r2_title, R.id.edutu_widget_r2_sub, R.id.edutu_widget_r2_deadline),
      listOf(R.id.edutu_widget_r3, R.id.edutu_widget_r3_title, R.id.edutu_widget_r3_sub, R.id.edutu_widget_r3_deadline),
      listOf(R.id.edutu_widget_r4, R.id.edutu_widget_r4_title, R.id.edutu_widget_r4_sub, R.id.edutu_widget_r4_deadline)
    )

    for (i in rows.indices) {
      val (rowId, titleId, subId, deadlineId) = rows[i]
      val item = items.optJSONObject(i)
      if (item == null) {
        views.setViewVisibility(rowId, View.GONE)
        continue
      }
      val deadlineRaw = item.optString("deadline")
      val match = item.optInt("match", 0)
      val organization = item.optString("organization").ifEmpty { "Edutu" }
      views.setViewVisibility(rowId, View.VISIBLE)
      views.setTextViewText(titleId, item.optString("title"))
      views.setTextViewText(subId, if (match > 0) "$match% match · $organization" else organization)
      views.setTextViewText(deadlineId, WidgetSupport.formatDeadline(context, deadlineRaw))
      views.setTextColor(deadlineId, WidgetSupport.urgencyTextColor(context, deadlineRaw))
      views.setOnClickPendingIntent(rowId, WidgetSupport.opportunityLink(context, item.optString("id")))
    }

    views.setOnClickPendingIntent(
      R.id.edutu_widget_root,
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

  /**
   * The personalised, ranked list the JS app wrote (via expo-file-system),
   * with expired items dropped. Returns null when there's no usable data.
   */
  private fun readAppItems(context: Context): WidgetSupport.AppItems? {
    val parsed = WidgetSupport.readAppItemsFile(context, APP_ITEMS_FILE) ?: return null
    val fresh = JSONArray()
    for (i in 0 until parsed.items.length()) {
      val item = parsed.items.optJSONObject(i) ?: continue
      if (WidgetSupport.isExpired(item.optString("deadline"))) continue
      fresh.put(item)
    }
    return if (fresh.length() > 0) WidgetSupport.AppItems(fresh, parsed.syncedAt) else null
  }
}
