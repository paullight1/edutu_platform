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

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray
  ) {
    appWidgetIds.forEach { appWidgetId ->
      val views = RemoteViews(context.packageName, R.layout.edutu_chat_widget)
      views.setOnClickPendingIntent(
        R.id.edutu_cw_root,
        WidgetSupport.deepLinkIntent(context, "edutu://chat")
      )
      appWidgetManager.updateAppWidget(appWidgetId, views)
    }
  }
}
