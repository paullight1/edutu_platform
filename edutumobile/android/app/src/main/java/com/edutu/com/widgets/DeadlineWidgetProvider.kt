package com.edutu.com.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.view.View
import android.widget.RemoteViews
import com.edutu.com.R
import org.json.JSONArray
import org.json.JSONObject

/**
 * "Deadlines" widget: a calendar-style agenda of the user's applied + saved
 * opportunity deadlines. Small placements show the single nearest deadline as
 * a big countdown; larger ones an agenda with date rails.
 *
 * Data comes exclusively from the file the app writes on sync (this is
 * user-specific — there is no sensible unauthenticated fallback). Deadlines
 * are re-formatted and expiry-checked on every render, so the countdown stays
 * accurate even when the file is old; when it's empty we show a friendly
 * empty state that deep-links into the app.
 */
class DeadlineWidgetProvider : AppWidgetProvider() {

  companion object {
    private const val APP_ITEMS_FILE = "edutu_widget_deadlines.json"

    private const val SIZE_SMALL = 0
    private const val SIZE_MEDIUM = 1
    private const val SIZE_LARGE = 2
  }

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray
  ) {
    render(context, appWidgetManager, appWidgetIds)
  }

  override fun onAppWidgetOptionsChanged(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetId: Int,
    newOptions: android.os.Bundle
  ) {
    render(context, appWidgetManager, intArrayOf(appWidgetId))
  }

  private fun render(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray
  ) {
    val items = readDeadlines(context)
    appWidgetIds.forEach { appWidgetId ->
      val options = appWidgetManager.getAppWidgetOptions(appWidgetId)
      val views = buildViews(context, items, pickSize(options))
      appWidgetManager.updateAppWidget(appWidgetId, views)
    }
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
      agendaViews(context, items, if (size == SIZE_LARGE) 5 else 3)
    }
  }

  private fun smallViews(context: Context, items: JSONArray): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.edutu_deadline_widget_small)
    val hero = items.optJSONObject(0)
    if (hero == null) {
      views.setViewVisibility(R.id.edutu_dw_content, View.GONE)
      views.setViewVisibility(R.id.edutu_dw_empty, View.VISIBLE)
      views.setOnClickPendingIntent(
        R.id.edutu_dw_root,
        WidgetSupport.deepLinkIntent(context, "edutu://opportunities")
      )
      return views
    }

    views.setViewVisibility(R.id.edutu_dw_content, View.VISIBLE)
    views.setViewVisibility(R.id.edutu_dw_empty, View.GONE)

    val deadlineRaw = hero.optString("deadline")
    val days = WidgetSupport.parseDays(deadlineRaw)
    val urgency = WidgetSupport.urgencyTextColor(context, deadlineRaw)
    if (days != null && days >= 0) {
      views.setViewVisibility(R.id.edutu_dw_days, View.VISIBLE)
      views.setTextViewText(R.id.edutu_dw_days, days.toString())
      views.setTextColor(R.id.edutu_dw_days, urgency)
      views.setTextViewText(
        R.id.edutu_dw_days_label,
        if (days == 1) "day left" else "days left"
      )
    } else {
      views.setViewVisibility(R.id.edutu_dw_days, View.GONE)
      views.setTextViewText(
        R.id.edutu_dw_days_label,
        WidgetSupport.formatDeadline(context, deadlineRaw)
      )
    }
    views.setTextViewText(R.id.edutu_dw_title, hero.optString("title"))
    views.setOnClickPendingIntent(
      R.id.edutu_dw_root,
      WidgetSupport.opportunityLink(context, hero.optString("opportunityId"))
    )
    return views
  }

  private fun agendaViews(context: Context, items: JSONArray, maxRows: Int): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.edutu_deadline_widget)

    if (items.length() == 0) {
      views.setViewVisibility(R.id.edutu_dw_content, View.GONE)
      views.setViewVisibility(R.id.edutu_dw_empty, View.VISIBLE)
      views.setOnClickPendingIntent(
        R.id.edutu_dw_root,
        WidgetSupport.deepLinkIntent(context, "edutu://opportunities")
      )
      return views
    }

    views.setViewVisibility(R.id.edutu_dw_content, View.VISIBLE)
    views.setViewVisibility(R.id.edutu_dw_empty, View.GONE)

    val rows = listOf(
      listOf(R.id.edutu_dw_r1, R.id.edutu_dw_r1_month, R.id.edutu_dw_r1_day, R.id.edutu_dw_r1_title, R.id.edutu_dw_r1_meta, R.id.edutu_dw_r1_deadline),
      listOf(R.id.edutu_dw_r2, R.id.edutu_dw_r2_month, R.id.edutu_dw_r2_day, R.id.edutu_dw_r2_title, R.id.edutu_dw_r2_meta, R.id.edutu_dw_r2_deadline),
      listOf(R.id.edutu_dw_r3, R.id.edutu_dw_r3_month, R.id.edutu_dw_r3_day, R.id.edutu_dw_r3_title, R.id.edutu_dw_r3_meta, R.id.edutu_dw_r3_deadline),
      listOf(R.id.edutu_dw_r4, R.id.edutu_dw_r4_month, R.id.edutu_dw_r4_day, R.id.edutu_dw_r4_title, R.id.edutu_dw_r4_meta, R.id.edutu_dw_r4_deadline),
      listOf(R.id.edutu_dw_r5, R.id.edutu_dw_r5_month, R.id.edutu_dw_r5_day, R.id.edutu_dw_r5_title, R.id.edutu_dw_r5_meta, R.id.edutu_dw_r5_deadline)
    )

    for (i in rows.indices) {
      val row = rows[i]
      val item = if (i < maxRows) items.optJSONObject(i) else null
      if (item == null) {
        views.setViewVisibility(row[0], View.GONE)
        continue
      }
      val deadlineRaw = item.optString("deadline")
      val rail = WidgetSupport.dateRailParts(deadlineRaw)
      val kind = if (item.optString("kind") == "applied") "Applied" else "Saved"
      val organization = item.optString("organization").ifEmpty { "Edutu" }

      views.setViewVisibility(row[0], View.VISIBLE)
      views.setTextViewText(row[1], rail.second.ifEmpty { "—" })
      views.setTextViewText(row[2], rail.first.ifEmpty { "?" })
      views.setTextViewText(row[3], item.optString("title"))
      views.setTextViewText(row[4], "$kind · $organization")
      views.setTextViewText(row[5], WidgetSupport.formatDeadline(context, deadlineRaw))
      views.setTextColor(row[5], WidgetSupport.urgencyTextColor(context, deadlineRaw))
      views.setOnClickPendingIntent(
        row[0],
        WidgetSupport.opportunityLink(context, item.optString("opportunityId"))
      )
    }

    views.setOnClickPendingIntent(
      R.id.edutu_dw_root,
      WidgetSupport.deepLinkIntent(context, "edutu://deadlines")
    )
    return views
  }

  /** Upcoming (non-expired) deadlines from the app-written file, soonest first. */
  private fun readDeadlines(context: Context): JSONArray {
    val parsed = WidgetSupport.readAppItemsFile(context, APP_ITEMS_FILE) ?: return JSONArray()
    val upcoming = mutableListOf<JSONObject>()
    for (i in 0 until parsed.items.length()) {
      val item = parsed.items.optJSONObject(i) ?: continue
      if (item.optString("title").isEmpty()) continue
      if (WidgetSupport.isExpired(item.optString("deadline"))) continue
      upcoming.add(item)
    }
    upcoming.sortBy { WidgetSupport.parseDays(it.optString("deadline")) ?: Int.MAX_VALUE }
    val result = JSONArray()
    upcoming.forEach { result.put(it) }
    return result
  }
}
