package com.edutu.com.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import com.edutu.com.R

/**
 * "Ask Edutu" widget: a one-tap launcher into the AI chat. The logo mark
 * front and center over a faux input pill — no data, no network, no wordmark.
 */
class ChatWidgetProvider : AppWidgetProvider() {

  override fun onAppWidgetOptionsChanged(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetId: Int,
    newOptions: android.os.Bundle,
  ) {
    onUpdate(context, appWidgetManager, intArrayOf(appWidgetId))
  }

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray
  ) {
    appWidgetIds.forEach { appWidgetId ->
      WidgetSupport.updateSafely(context, appWidgetManager, appWidgetId) { width, height ->
        val views = RemoteViews(context.packageName, if (width >= 260) R.layout.edutu_chat_widget_medium else R.layout.edutu_chat_widget)
        val largeText = context.resources.configuration.fontScale > 1.3f
        views.setViewVisibility(R.id.edutu_cw_hint, if (largeText) android.view.View.GONE else android.view.View.VISIBLE)
        if (width >= 260) views.setViewVisibility(R.id.edutu_cw_label, if (largeText) android.view.View.GONE else android.view.View.VISIBLE)
        views.setOnClickPendingIntent(
          R.id.edutu_cw_root,
          WidgetSupport.deepLinkIntent(context, "edutu://chat")
        )
        views
      }
    }
  }
}
