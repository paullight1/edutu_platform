package com.edutu.com.widgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.graphics.Color
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
import java.util.Calendar
import java.util.Locale
import java.util.concurrent.Executors

/**
 * Dynamic home-screen widget for Android. Mirrors the iOS WidgetKit widget:
 * it shows the user's top live opportunity (match %, title, sponsor, an
 * urgency-coloured deadline) and opens the app to that opportunity on tap.
 *
 * Data path (self-contained, no extra Gradle deps, no JS bridge):
 *   1. Render instantly from the SharedPreferences cache.
 *   2. Fetch fresh opportunities from the product API on a background thread.
 *   3. Drop closed ones, cache the top items, re-render.
 *
 * Sizes: a compact layout for small placements and an expanded layout for
 * larger ones, mapped responsively on Android 12+ (falls back to expanded).
 */
class EdutuWidgetProvider : AppWidgetProvider() {

  companion object {
    private const val PREFS = "edutu_widget_prefs"
    private const val KEY_ITEMS = "items_json"
    // The JS app writes its personalised, ranked list here (in the app's
    // documents dir, i.e. filesDir — the same path expo-file-system's
    // `Paths.document` maps to).
    private const val APP_ITEMS_FILE = "edutu_widget_items.json"
    private const val COLOR_RED = "#EF4444"
    private const val COLOR_AMBER = "#F59E0B"
    private const val COLOR_GREEN = "#10B981"
    private const val COLOR_SLATE = "#94A3B8"

    private const val SIZE_COMPACT = 0
    private const val SIZE_EXPANDED = 1
    private const val SIZE_LARGE = 2

    // Once the app-written list is a day old, refresh the generic fallback
    // cache from the network; after a week, stop preferring the stale
    // personalised list over that fresher generic data.
    private const val APP_ITEMS_REFRESH_AFTER_MS = 24L * 60 * 60 * 1000
    private const val APP_ITEMS_TRUST_FOR_MS = 7L * 24 * 60 * 60 * 1000

    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
  }

  /** The app-written personalised list plus when the app wrote it (null = unknown). */
  private data class AppItems(val items: JSONArray, val syncedAt: Long?) {
    fun ageMs(): Long? = syncedAt?.let { System.currentTimeMillis() - it }
    fun isOlderThan(thresholdMs: Long): Boolean {
      // Unknown age (legacy bare-array file) is treated as stale so the
      // fallback cache still gets refreshed.
      val age = ageMs() ?: return true
      return age > thresholdMs
    }
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
    if (appItems != null && !appItems.isOlderThan(APP_ITEMS_REFRESH_AFTER_MS)) return
    executor.execute {
      val items = fetchItems(appContext) ?: return@execute
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
      appItems != null && !appItems.isOlderThan(APP_ITEMS_TRUST_FOR_MS) -> appItems.items
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
    // tries to cram the 3-row list.
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
      deepLinkIntent(context, "edutu://opportunities")
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
    views.setTextViewText(R.id.edutu_widget_deadline, formatDeadline(deadlineRaw))
    views.setTextColor(R.id.edutu_widget_deadline, Color.parseColor(urgencyColor(deadlineRaw)))
    views.setOnClickPendingIntent(R.id.edutu_widget_root, heroLink(context, id))
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
    views.setTextViewText(R.id.edutu_widget_deadline, formatDeadline(deadlineRaw))
    views.setTextColor(R.id.edutu_widget_deadline, Color.parseColor(urgencyColor(deadlineRaw)))
    views.setTextViewText(
      R.id.edutu_widget_match,
      if (match > 0) "$match% match" else "Top pick"
    )
    views.setOnClickPendingIntent(R.id.edutu_widget_root, heroLink(context, id))
    return views
  }

  /**
   * The "Opportunity radar" list — up to three opportunities, each its own tap
   * target. Mirrors the iOS systemLarge widget.
   */
  private fun largeViews(context: Context, items: JSONArray): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.edutu_widget_large)
    views.setTextViewText(R.id.edutu_widget_header, context.getString(R.string.edutu_widget_radar))

    val rows = listOf(
      Triple(R.id.edutu_widget_r1, R.id.edutu_widget_r1_title, R.id.edutu_widget_r1_deadline),
      Triple(R.id.edutu_widget_r2, R.id.edutu_widget_r2_title, R.id.edutu_widget_r2_deadline),
      Triple(R.id.edutu_widget_r3, R.id.edutu_widget_r3_title, R.id.edutu_widget_r3_deadline)
    )

    for (i in rows.indices) {
      val (rowId, titleId, deadlineId) = rows[i]
      val item = items.optJSONObject(i)
      if (item == null) {
        views.setViewVisibility(rowId, View.GONE)
        continue
      }
      val deadlineRaw = item.optString("deadline")
      views.setViewVisibility(rowId, View.VISIBLE)
      views.setTextViewText(titleId, item.optString("title"))
      views.setTextViewText(deadlineId, formatDeadline(deadlineRaw))
      views.setTextColor(deadlineId, Color.parseColor(urgencyColor(deadlineRaw)))
      views.setOnClickPendingIntent(rowId, heroLink(context, item.optString("id")))
    }

    views.setOnClickPendingIntent(
      R.id.edutu_widget_root,
      deepLinkIntent(context, "edutu://opportunities")
    )
    return views
  }

  private fun heroLink(context: Context, id: String): PendingIntent {
    val link = if (id.isNotEmpty()) "edutu://opportunity/$id" else "edutu://opportunities"
    return deepLinkIntent(context, link)
  }

  private fun deepLinkIntent(context: Context, uri: String): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    var flags = PendingIntent.FLAG_UPDATE_CURRENT
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      flags = flags or PendingIntent.FLAG_IMMUTABLE
    }
    // Unique request code per uri so distinct opportunities get distinct intents.
    return PendingIntent.getActivity(context, uri.hashCode(), intent, flags)
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
   * The personalised, ranked list the JS app wrote (via expo-file-system) into
   * the app's documents dir, with the write timestamp when available. The
   * current format is `{"syncedAt": <epoch ms>, "items": [...]}`; a bare array
   * (written by older app versions) is still accepted, with an unknown age.
   * Any items that have since closed are dropped; returns null when there's no
   * usable app-provided data (so the widget falls back to its own fetch).
   */
  private fun readAppItems(context: Context): AppItems? {
    return try {
      val file = java.io.File(context.filesDir, APP_ITEMS_FILE)
      if (!file.exists()) return null
      val text = file.readText().trim()
      if (text.isBlank()) return null

      val parsed: JSONArray
      var syncedAt: Long? = null
      if (text.startsWith("{")) {
        val envelope = JSONObject(text)
        parsed = envelope.optJSONArray("items") ?: return null
        val stamp = envelope.optLong("syncedAt", 0L)
        if (stamp > 0L) syncedAt = stamp
      } else {
        parsed = JSONArray(text)
      }

      val fresh = JSONArray()
      for (i in 0 until parsed.length()) {
        val item = parsed.optJSONObject(i) ?: continue
        if (isExpired(item.optString("deadline"))) continue
        fresh.put(item)
      }
      if (fresh.length() > 0) AppItems(fresh, syncedAt) else null
    } catch (e: Exception) {
      null
    }
  }

  /**
   * Fetch live opportunities from the product API, drop closed ones, and keep
   * the top few. Returns null on any failure so the cached view is preserved.
   */
  private fun fetchItems(context: Context): JSONArray? {
    val base = context.getString(R.string.edutu_widget_api_base).trimEnd('/')
    val endpoint = "$base/opportunities?limit=12&status=active"
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
      val rows = parseRows(body)
      val result = JSONArray()
      for (i in 0 until rows.length()) {
        val row = rows.optJSONObject(i) ?: continue
        val deadline = firstString(row, "deadline", "close_date", "closeDate")
        if (isExpired(deadline)) continue
        val title = firstString(row, "title")
        if (title.isEmpty()) continue
        val item = JSONObject()
          .put("id", firstString(row, "id", "opportunityId", "opportunity_id"))
          .put("title", title)
          .put("organization", firstString(row, "organization", "provider", "organisation"))
          .put("category", firstString(row, "category"))
          .put("deadline", deadline)
          .put("match", firstInt(row, "match", "matchScore", "match_score"))
        result.put(item)
        if (result.length() >= 5) break
      }
      return result
    } catch (e: Exception) {
      return null
    } finally {
      connection?.disconnect()
    }
  }

  private fun parseRows(body: String): JSONArray {
    return try {
      val trimmed = body.trim()
      if (trimmed.startsWith("[")) {
        JSONArray(trimmed)
      } else {
        val obj = JSONObject(trimmed)
        obj.optJSONArray("data")
          ?: obj.optJSONArray("items")
          ?: obj.optJSONArray("opportunities")
          ?: JSONArray()
      }
    } catch (e: Exception) {
      JSONArray()
    }
  }

  // ---- Deadline helpers (mirror packages/core/src/utils/deadline.ts) --------

  private fun parseDays(deadline: String?): Int? {
    if (deadline.isNullOrBlank()) return null
    val datePart = deadline.trim().take(10)
    return try {
      val format = SimpleDateFormat("yyyy-MM-dd", Locale.US)
      val target = format.parse(datePart) ?: return null
      val cal = Calendar.getInstance()
      cal.set(Calendar.HOUR_OF_DAY, 0)
      cal.set(Calendar.MINUTE, 0)
      cal.set(Calendar.SECOND, 0)
      cal.set(Calendar.MILLISECOND, 0)
      val startOfToday = cal.timeInMillis
      val diff = target.time - startOfToday
      Math.ceil(diff.toDouble() / 86_400_000.0).toInt()
    } catch (e: Exception) {
      null
    }
  }

  private fun isRolling(deadline: String?): Boolean {
    val d = deadline?.lowercase(Locale.US) ?: return false
    return d.contains("rolling") || d.contains("ongoing") || d.contains("continuous")
  }

  private fun isExpired(deadline: String?): Boolean {
    val days = parseDays(deadline) ?: return false
    return days < 0
  }

  private fun formatDeadline(deadline: String?): String {
    if (isRolling(deadline)) return "Rolling"
    val days = parseDays(deadline) ?: return "Open now"
    return when {
      days <= 0 -> "Closes today"
      days == 1 -> "Closes tomorrow"
      days <= 30 -> "$days days left"
      else -> formatDate(deadline)
    }
  }

  private fun formatDate(deadline: String?): String {
    val datePart = deadline?.trim()?.take(10) ?: return "Open now"
    return try {
      val input = SimpleDateFormat("yyyy-MM-dd", Locale.US)
      val output = SimpleDateFormat("d MMM yyyy", Locale.US)
      val date = input.parse(datePart) ?: return "Open now"
      output.format(date)
    } catch (e: Exception) {
      "Open now"
    }
  }

  private fun urgencyColor(deadline: String?): String {
    if (isRolling(deadline)) return COLOR_GREEN
    val days = parseDays(deadline) ?: return COLOR_SLATE
    return when {
      days <= 0 -> COLOR_RED
      days == 1 -> COLOR_AMBER
      days <= 3 -> COLOR_RED
      days <= 7 -> COLOR_AMBER
      else -> COLOR_GREEN
    }
  }

  private fun firstString(obj: JSONObject, vararg keys: String): String {
    for (key in keys) {
      val value = obj.optString(key, "")
      if (value.isNotEmpty() && value != "null") return value
    }
    return ""
  }

  private fun firstInt(obj: JSONObject, vararg keys: String): Int {
    for (key in keys) {
      if (obj.has(key) && !obj.isNull(key)) {
        val value = obj.optInt(key, 0)
        if (value != 0) return value
      }
    }
    return 0
  }
}
