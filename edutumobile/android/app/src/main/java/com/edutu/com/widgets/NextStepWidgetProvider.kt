package com.edutu.com.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.view.View
import android.widget.RemoteViews
import com.edutu.com.R
import org.json.JSONObject

/** Account-owned task snapshot, written by authenticated app sync. No native auth secrets or writes. */
class NextStepWidgetProvider : AppWidgetProvider() {
  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: android.os.Bundle) {
    onUpdate(context, manager, intArrayOf(id))
  }
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    val data = try { JSONObject(java.io.File(context.filesDir, "edutu_widget_next_step.json").readText()) } catch (_: Exception) { JSONObject() }
    ids.forEach { id -> WidgetSupport.updateSafely(context, manager, id) { width, height -> buildViews(context, data, width, height) } }
  }
  private fun buildViews(context: Context, data: JSONObject, width: Int, height: Int): RemoteViews {
    val small = width < 220
    val large = !small && height >= 260
    val views = RemoteViews(context.packageName, when { small -> R.layout.edutu_next_step_widget_small; large -> R.layout.edutu_next_step_widget_large; else -> R.layout.edutu_next_step_widget_medium })
    val items = data.optJSONArray("items")
    val hero = items?.optJSONObject(0)
    val usable = data.optString("state") == "ready" && hero != null && !WidgetSupport.isExpired(hero.optString("deadline"))
    val link = if (usable) hero!!.optString("deepLink", "edutu://my-plan") else "edutu://my-plan"
    views.setOnClickPendingIntent(R.id.edutu_ns_root, WidgetSupport.deepLinkIntent(context, link))
    views.setOnClickPendingIntent(R.id.edutu_ns_action, WidgetSupport.deepLinkIntent(context, link))
    views.setViewVisibility(R.id.edutu_ns_secondary, View.GONE)
    if (!usable) {
      val title = when (data.optString("state")) { "signed_out" -> R.string.edutu_next_step_signed_out; "empty" -> R.string.edutu_next_step_empty; else -> R.string.edutu_next_step_unavailable }
      views.setTextViewText(R.id.edutu_ns_title, context.getString(title))
      views.setTextViewText(R.id.edutu_ns_context, context.getString(R.string.edutu_next_step_empty_hint))
      views.setTextViewText(R.id.edutu_ns_action, context.getString(R.string.edutu_next_step_open))
      views.setViewVisibility(R.id.edutu_ns_progress, View.GONE)
      views.setViewVisibility(R.id.edutu_ns_due, View.GONE)
      return views
    }
    val item = hero!!
    views.setInt(R.id.edutu_ns_title, "setMaxLines", WidgetSizing.titleLines(height, context.resources.configuration.fontScale, 2))
    views.setTextViewText(R.id.edutu_ns_title, item.optString("title"))
    val total = item.optInt("total", 0).coerceAtLeast(0)
    val completed = item.optInt("completed", 0).coerceIn(0, total)
    val progress = context.getString(R.string.edutu_next_step_progress, completed, total)
    views.setTextViewText(R.id.edutu_ns_context, item.optString("opportunity") + if (total > 0) " · $progress" else "")
    views.setProgressBar(R.id.edutu_ns_progress, maxOf(1, total), completed, false)
    views.setViewVisibility(R.id.edutu_ns_progress, if (large && total > 0 && context.resources.configuration.fontScale <= 1.3f) View.VISIBLE else View.GONE)
    val stamp = data.optLong("syncedAt", 0L)
    val stale = data.optBoolean("stale") || System.currentTimeMillis() - stamp > WidgetSupport.APP_ITEMS_REFRESH_AFTER_MS
    val due = WidgetSupport.parseDays(item.optString("dueAt"))
    views.setViewVisibility(R.id.edutu_ns_context, if (small || context.resources.configuration.fontScale > 1.3f) View.GONE else View.VISIBLE)
    val dueText = if (stale) context.getString(R.string.edutu_next_step_cached) else when {
      due == null -> ""
      due < 0 -> "Overdue · Open your plan"
      due == 0 -> "Due today"
      due == 1 -> "Due tomorrow"
      else -> "Due in $due days"
    }
    views.setTextViewText(R.id.edutu_ns_due, dueText)
    views.setViewVisibility(R.id.edutu_ns_due, if (dueText.isEmpty() || height < 300) View.GONE else View.VISIBLE)
    val second = items?.optJSONObject(1)
    if (large && context.resources.configuration.fontScale <= 1.3f && second != null && !WidgetSupport.isExpired(second.optString("deadline"))) {
      views.setViewVisibility(R.id.edutu_ns_secondary, View.VISIBLE)
      views.setTextViewText(R.id.edutu_ns_secondary, "Up next\n" + second.optString("title"))
      views.setOnClickPendingIntent(R.id.edutu_ns_secondary, WidgetSupport.deepLinkIntent(context, second.optString("deepLink", "edutu://my-plan")))
    }
    return views
  }
}
