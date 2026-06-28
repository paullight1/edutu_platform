package com.edutu.com.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import com.edutu.com.R

class EdutuWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray
  ) {
    appWidgetIds.forEach { appWidgetId ->
      val views = RemoteViews(context.packageName, R.layout.edutu_widget)
      views.setTextViewText(R.id.edutu_widget_title, context.getString(R.string.edutu_widget_title))
      views.setTextViewText(R.id.edutu_widget_subtitle, context.getString(R.string.edutu_widget_subtitle))
      appWidgetManager.updateAppWidget(appWidgetId, views)
    }
  }
}
