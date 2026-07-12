package com.edutu.com.widgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.RemoteViews
import com.edutu.com.R
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.Executors

/**
 * "Edutu News" — a wide banner that fades through the latest published blog
 * posts (trending global-opportunity news) on-device via ViewFlipper. Data
 * comes from the app-written news file, then this widget's own cache, then a
 * direct fetch of the public /blog feed. Tapping a banner opens the article
 * on edutu.org in the browser.
 */
class NewsWidgetProvider : AppWidgetProvider() {

  companion object {
    private const val PREFS = "edutu_news_widget_prefs"
    private const val KEY_ITEMS = "news_items_json"
    private const val NEWS_FILE = "edutu_widget_news.json"
    private const val BANNER_COUNT = 3
    private const val FETCH_LIMIT = 6

    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
  }

  private data class Banner(
    val frameId: Int,
    val imageId: Int,
    val chipId: Int,
    val titleId: Int,
    val metaId: Int,
  )

  private val banners = listOf(
    Banner(R.id.edutu_nw_b1, R.id.edutu_nw_b1_image, R.id.edutu_nw_b1_chip, R.id.edutu_nw_b1_title, R.id.edutu_nw_b1_meta),
    Banner(R.id.edutu_nw_b2, R.id.edutu_nw_b2_image, R.id.edutu_nw_b2_chip, R.id.edutu_nw_b2_title, R.id.edutu_nw_b2_meta),
    Banner(R.id.edutu_nw_b3, R.id.edutu_nw_b3_image, R.id.edutu_nw_b3_chip, R.id.edutu_nw_b3_title, R.id.edutu_nw_b3_meta),
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
      val items = loadItems(appContext)
      if (items.length() == 0) return@execute

      val bitmaps = HashMap<Int, Bitmap>()
      for (i in 0 until BANNER_COUNT) {
        val item = items.optJSONObject(i % items.length()) ?: continue
        if (bitmaps.containsKey(i)) continue
        WidgetSupport.fetchBitmap(item.optString("imageUrl"))?.let { bitmaps[i] = it }
      }

      mainHandler.post {
        val manager = AppWidgetManager.getInstance(appContext)
        val ids = manager.getAppWidgetIds(
          ComponentName(appContext, NewsWidgetProvider::class.java)
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
    val items = loadItems(context)
    appWidgetIds.forEach { appWidgetId ->
      appWidgetManager.updateAppWidget(appWidgetId, buildViews(context, items, bitmaps))
    }
  }

  private fun buildViews(context: Context, items: JSONArray, bitmaps: Map<Int, Bitmap>?): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.edutu_news_widget)
    val blogBase = context.getString(R.string.edutu_news_blog_base).trimEnd('/')

    if (items.length() == 0) {
      views.setViewVisibility(R.id.edutu_nw_flipper, View.GONE)
      views.setViewVisibility(R.id.edutu_nw_empty, View.VISIBLE)
      views.setOnClickPendingIntent(R.id.edutu_nw_root, browserIntent(context, blogBase))
      return views
    }

    views.setViewVisibility(R.id.edutu_nw_flipper, View.VISIBLE)
    views.setViewVisibility(R.id.edutu_nw_empty, View.GONE)

    for (i in banners.indices) {
      val banner = banners[i]
      val item = items.optJSONObject(i % items.length()) ?: JSONObject()
      val category = item.optString("category").ifBlank { "News" }

      views.setTextViewText(banner.chipId, category.uppercase(Locale.getDefault()))
      views.setTextViewText(banner.titleId, item.optString("title"))
      views.setTextViewText(banner.metaId, formatPublished(item.optString("publishedAt")))

      val bitmap = bitmaps?.get(i)
      if (bitmap != null) {
        views.setImageViewBitmap(banner.imageId, bitmap)
        views.setViewVisibility(banner.imageId, View.VISIBLE)
      } else {
        views.setViewVisibility(banner.imageId, View.GONE)
      }

      val url = item.optString("url").ifBlank { blogBase }
      views.setOnClickPendingIntent(banner.frameId, browserIntent(context, url))
    }

    return views
  }

  /**
   * Articles live on edutu.org, so (unlike the opportunity widgets) clicks
   * open the browser — deliberately NOT package-scoped to the app.
   */
  private fun browserIntent(context: Context, url: String): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    var flags = PendingIntent.FLAG_UPDATE_CURRENT
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      flags = flags or PendingIntent.FLAG_IMMUTABLE
    }
    return PendingIntent.getActivity(context, url.hashCode(), intent, flags)
  }

  private fun formatPublished(publishedAt: String?): String {
    if (publishedAt.isNullOrBlank()) return "Edutu Blog"
    return try {
      val parser = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
      }
      val date = parser.parse(publishedAt.take(10)) ?: return "Edutu Blog"
      SimpleDateFormat("MMM d, yyyy", Locale.getDefault()).format(date)
    } catch (e: Exception) {
      "Edutu Blog"
    }
  }

  // ---- Data: app file → widget cache → public /blog fetch -------------------

  private fun loadItems(context: Context): JSONArray {
    val fromFile = WidgetSupport.readAppItemsFile(context, NEWS_FILE)
    if (fromFile != null && fromFile.items.length() > 0) return fromFile.items

    val cached = readCache(context)
    if (cached.length() > 0) return cached

    val fetched = fetchNews(context)
    if (fetched != null && fetched.length() > 0) {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit().putString(KEY_ITEMS, fetched.toString()).apply()
      return fetched
    }
    return JSONArray()
  }

  private fun readCache(context: Context): JSONArray {
    return try {
      val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .getString(KEY_ITEMS, null)
      if (raw.isNullOrEmpty()) JSONArray() else JSONArray(raw)
    } catch (e: Exception) {
      JSONArray()
    }
  }

  private fun fetchNews(context: Context): JSONArray? {
    val base = context.getString(R.string.edutu_widget_api_base).trimEnd('/')
    val blogBase = context.getString(R.string.edutu_news_blog_base).trimEnd('/')
    val endpoint = "$base/blog?status=published&limit=$FETCH_LIMIT"
    var connection: HttpURLConnection? = null
    try {
      connection = (URL(endpoint).openConnection() as HttpURLConnection).apply {
        requestMethod = "GET"
        connectTimeout = 10000
        readTimeout = 10000
        setRequestProperty("Accept", "application/json")
      }
      if (connection.responseCode !in 200..299) return null

      val body = connection.inputStream.bufferedReader().use { it.readText() }
      val rows = WidgetSupport.parseRows(body)
      val result = JSONArray()
      for (i in 0 until rows.length()) {
        val row = rows.optJSONObject(i) ?: continue
        val title = WidgetSupport.firstString(row, "title")
        val slug = WidgetSupport.firstString(row, "slug")
        if (title.isEmpty() || slug.isEmpty()) continue
        result.put(
          JSONObject()
            .put("id", WidgetSupport.firstString(row, "id").ifBlank { slug })
            .put("title", title)
            .put("category", WidgetSupport.firstString(row, "category"))
            .put("publishedAt", WidgetSupport.firstString(row, "publishedAt", "published_at"))
            .put("imageUrl", WidgetSupport.firstString(row, "coverImage", "cover_image"))
            .put("url", "$blogBase/$slug")
        )
        if (result.length() >= FETCH_LIMIT) break
      }
      return result
    } catch (e: Exception) {
      return null
    } finally {
      connection?.disconnect()
    }
  }
}
