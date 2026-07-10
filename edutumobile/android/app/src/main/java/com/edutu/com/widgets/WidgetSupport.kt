package com.edutu.com.widgets

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import androidx.core.content.ContextCompat
import com.edutu.com.R
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

/**
 * Shared plumbing for every Edutu home-screen widget provider: deep links,
 * the app-written data files (with staleness rules), deadline formatting and
 * the urgency colour system. Mirrors packages/core/src/utils/deadline.ts and
 * widgets/theme.ts on the JS side — keep the three in sync.
 */
object WidgetSupport {

  // Once the app-written list is a day old, refresh any network fallback;
  // after a week, stop preferring the stale personalised list over it.
  const val APP_ITEMS_REFRESH_AFTER_MS = 24L * 60 * 60 * 1000
  const val APP_ITEMS_TRUST_FOR_MS = 7L * 24 * 60 * 60 * 1000

  /** An app-written data file plus when the app wrote it (null = unknown/legacy). */
  data class AppItems(val items: JSONArray, val syncedAt: Long?) {
    fun isOlderThan(thresholdMs: Long): Boolean {
      val stamp = syncedAt ?: return true
      return System.currentTimeMillis() - stamp > thresholdMs
    }
  }

  /**
   * Read an app-written widget file ({"syncedAt": <epoch ms>, "items": [...]}
   * or a legacy bare array) from the app's documents dir (filesDir). Items are
   * NOT expiry-filtered here — each provider decides what "expired" means.
   */
  fun readAppItemsFile(context: Context, fileName: String): AppItems? {
    return try {
      val file = java.io.File(context.filesDir, fileName)
      if (!file.exists()) return null
      val text = file.readText().trim()
      if (text.isBlank()) return null

      if (text.startsWith("{")) {
        val envelope = JSONObject(text)
        val items = envelope.optJSONArray("items") ?: return null
        val stamp = envelope.optLong("syncedAt", 0L)
        AppItems(items, if (stamp > 0L) stamp else null)
      } else {
        AppItems(JSONArray(text), null)
      }
    } catch (e: Exception) {
      null
    }
  }

  fun deepLinkIntent(context: Context, uri: String): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    var flags = PendingIntent.FLAG_UPDATE_CURRENT
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      flags = flags or PendingIntent.FLAG_IMMUTABLE
    }
    // Unique request code per uri so distinct destinations get distinct intents.
    return PendingIntent.getActivity(context, uri.hashCode(), intent, flags)
  }

  fun opportunityLink(context: Context, id: String): PendingIntent {
    val link = if (id.isNotEmpty()) "edutu://opportunity/$id" else "edutu://opportunities"
    return deepLinkIntent(context, link)
  }

  // ---- Network fallback (unauthenticated product API) -----------------------

  /**
   * Fetch live opportunities from the product API, drop closed ones, keep the
   * top few. Returns null on any failure so callers preserve their cache.
   */
  fun fetchOpportunities(context: Context, limit: Int = 5): JSONArray? {
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
          .put("imageUrl", firstString(row, "imageUrl", "image_url", "image"))
        result.put(item)
        if (result.length() >= limit) break
      }
      return result
    } catch (e: Exception) {
      return null
    } finally {
      connection?.disconnect()
    }
  }

  /**
   * Download and decode a remote image for use as a widget background, downsampled
   * to keep the bitmap well under the ~1 MB Binder transaction limit RemoteViews
   * must respect. Returns null on any failure so callers fall back to a flat
   * brand surface. Must be called off the main thread.
   */
  fun fetchBitmap(urlString: String?, reqWidth: Int = 480): Bitmap? {
    if (urlString.isNullOrBlank()) return null
    var connection: HttpURLConnection? = null
    return try {
      connection = (URL(urlString).openConnection() as HttpURLConnection).apply {
        requestMethod = "GET"
        connectTimeout = 8000
        readTimeout = 8000
        instanceFollowRedirects = true
        setRequestProperty("Accept", "image/*")
      }
      if (connection.responseCode !in 200..299) return null
      val bytes = connection.inputStream.use { it.readBytes() }
      if (bytes.isEmpty()) return null

      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
      val decode = BitmapFactory.Options().apply {
        inSampleSize = sampleSizeFor(bounds.outWidth, reqWidth)
      }
      BitmapFactory.decodeByteArray(bytes, 0, bytes.size, decode)
    } catch (e: Exception) {
      null
    } finally {
      connection?.disconnect()
    }
  }

  private fun sampleSizeFor(sourceWidth: Int, reqWidth: Int): Int {
    if (sourceWidth <= 0 || reqWidth <= 0) return 1
    var sample = 1
    while (sourceWidth / (sample * 2) >= reqWidth) sample *= 2
    return sample
  }

  fun parseRows(body: String): JSONArray {
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

  fun firstString(obj: JSONObject, vararg keys: String): String {
    for (key in keys) {
      val value = obj.optString(key, "")
      if (value.isNotEmpty() && value != "null") return value
    }
    return ""
  }

  fun firstInt(obj: JSONObject, vararg keys: String): Int {
    for (key in keys) {
      if (obj.has(key) && !obj.isNull(key)) {
        val value = obj.optInt(key, 0)
        if (value != 0) return value
      }
    }
    return 0
  }

  // ---- Deadline helpers (mirror packages/core/src/utils/deadline.ts) --------

  fun parseDays(deadline: String?): Int? {
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

  fun isRolling(deadline: String?): Boolean {
    val d = deadline?.lowercase(Locale.US) ?: return false
    return d.contains("rolling") || d.contains("ongoing") || d.contains("continuous")
  }

  fun isExpired(deadline: String?): Boolean {
    val days = parseDays(deadline) ?: return false
    return days < 0
  }

  fun formatDeadline(context: Context, deadline: String?): String {
    if (isRolling(deadline)) return "Rolling"
    val days = parseDays(deadline) ?: return context.getString(R.string.edutu_widget_open_now)
    return when {
      days <= 0 -> "Closes today"
      days == 1 -> "Closes tomorrow"
      days <= 30 -> "$days days left"
      else -> formatDate(context, deadline)
    }
  }

  fun formatDate(context: Context, deadline: String?): String {
    val datePart = deadline?.trim()?.take(10)
      ?: return context.getString(R.string.edutu_widget_open_now)
    return try {
      val input = SimpleDateFormat("yyyy-MM-dd", Locale.US)
      val output = SimpleDateFormat("d MMM yyyy", Locale.US)
      val date = input.parse(datePart)
        ?: return context.getString(R.string.edutu_widget_open_now)
      output.format(date)
    } catch (e: Exception) {
      context.getString(R.string.edutu_widget_open_now)
    }
  }

  /** "22" / "May" pieces for calendar rails; empty when unparseable. */
  fun dateRailParts(deadline: String?): Pair<String, String> {
    val datePart = deadline?.trim()?.take(10) ?: return Pair("", "")
    return try {
      val input = SimpleDateFormat("yyyy-MM-dd", Locale.US)
      val date = input.parse(datePart) ?: return Pair("", "")
      val day = SimpleDateFormat("d", Locale.US).format(date)
      val month = SimpleDateFormat("MMM", Locale.US).format(date)
      Pair(day, month)
    } catch (e: Exception) {
      Pair("", "")
    }
  }

  // ---- Urgency colours (theme-aware via res/values[-night]) -----------------

  /** Text colour for a deadline countdown, resolved against the current theme. */
  fun urgencyTextColor(context: Context, deadline: String?): Int {
    return ContextCompat.getColor(context, urgencyColorRes(deadline))
  }

  private fun urgencyColorRes(deadline: String?): Int {
    if (isRolling(deadline)) return R.color.edutu_urgency_green
    val days = parseDays(deadline) ?: return R.color.edutu_urgency_slate
    return when {
      days <= 0 -> R.color.edutu_urgency_red
      days == 1 -> R.color.edutu_urgency_amber
      days <= 3 -> R.color.edutu_urgency_red
      days <= 7 -> R.color.edutu_urgency_amber
      else -> R.color.edutu_urgency_green
    }
  }

  /** Filled chip background for a deadline (same fills in light and dark). */
  fun chipBackgroundRes(deadline: String?): Int {
    if (isRolling(deadline)) return R.drawable.edutu_widget_chip_green
    val days = parseDays(deadline) ?: return R.drawable.edutu_widget_chip_slate
    return when {
      days <= 0 -> R.drawable.edutu_widget_chip_red
      days == 1 -> R.drawable.edutu_widget_chip_amber
      days <= 3 -> R.drawable.edutu_widget_chip_red
      days <= 7 -> R.drawable.edutu_widget_chip_amber
      else -> R.drawable.edutu_widget_chip_green
    }
  }
}
