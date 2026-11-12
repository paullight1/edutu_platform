package com.edutu.com.widgets

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.FileObserver
import android.os.Handler
import android.os.Looper

/** Repaint placed widgets when JS writes or clears their data, without waiting for the OS timer. */
object WidgetRefreshObserver {
  private var observer: FileObserver? = null
  private val handler = Handler(Looper.getMainLooper())
  private val providers = listOf(
    EdutuWidgetProvider::class.java, DeadlineWidgetProvider::class.java,
    TrendingWidgetProvider::class.java, ChatWidgetProvider::class.java,
    TrendingSpotlightWidgetProvider::class.java, TrendingGridWidgetProvider::class.java,
    TrendingTickerWidgetProvider::class.java, TrendingThumbListWidgetProvider::class.java,
    NewsWidgetProvider::class.java, NextStepWidgetProvider::class.java,
  )

  @Suppress("DEPRECATION") // String constructor also works on Android 8–9.
  fun start(context: Context) {
    if (observer != null) return
    val app = context.applicationContext
    val repaint = Runnable {
      val manager = AppWidgetManager.getInstance(app)
      providers.forEach { provider ->
        val component = ComponentName(app, provider)
        val ids = manager.getAppWidgetIds(component)
        if (ids.isNotEmpty()) {
          app.sendBroadcast(Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE).apply {
            setComponent(component)
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
          })
        }
      }
    }
    observer = object : FileObserver(app.filesDir.path, CLOSE_WRITE or MOVED_TO or DELETE) {
      override fun onEvent(event: Int, path: String?) {
        if (path == null || !path.startsWith("edutu_widget_") || !path.endsWith(".json")) return
        handler.removeCallbacks(repaint)
        handler.postDelayed(repaint, 300)
      }
    }.also { it.startWatching() }
  }
}
