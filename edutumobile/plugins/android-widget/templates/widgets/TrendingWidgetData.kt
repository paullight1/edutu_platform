package com.edutu.com.widgets

import android.content.Context
import org.json.JSONArray

/**
 * Shared source-of-truth loader for the image-led trending widgets (Spotlight,
 * Grid, Ticker, Thumbnail list). Prefers the app-written personalised trending
 * file, then the widget's own cached network fetch — always
 * dropping expired items. Keeps every trending widget on identical data + rules.
 */
object TrendingWidgetData {

  fun load(
    context: Context,
    fileName: String,
    prefsName: String,
    prefsKey: String,
  ): JSONArray {
    val fromFile = WidgetSupport.readAppItemsFile(context, fileName)
    if (fromFile != null && !fromFile.isOlderThan(WidgetSupport.APP_ITEMS_TRUST_FOR_MS) && fromFile.items.length() > 0) {
      val fresh = filterActive(fromFile.items)
      if (fresh.length() > 0) return fresh
    }

    val cached = readCache(context, prefsName, prefsKey)
    if (cached.length() > 0) return cached
    return if (fromFile != null) filterActive(fromFile.items) else JSONArray()
  }

  /** Called only on the provider's worker. Render paths never make network requests. */
  fun refresh(context: Context, fileName: String, prefsName: String, prefsKey: String, fetchLimit: Int): JSONArray {
    val fromFile = WidgetSupport.readAppItemsFile(context, fileName)
    val current = load(context, fileName, prefsName, prefsKey)
    val prefs = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
    val syncedAt = prefs.getLong("${prefsKey}_synced_at", 0L)
    if (current.length() > 0 && (
        (fromFile != null && !fromFile.isOlderThan(WidgetSupport.APP_ITEMS_REFRESH_AFTER_MS)) ||
        System.currentTimeMillis() - syncedAt < WidgetSupport.APP_ITEMS_REFRESH_AFTER_MS
      )) return current
    val fetched = WidgetSupport.fetchOpportunities(context, fetchLimit)
    if (fetched != null && fetched.length() > 0) {
      prefs.edit().putString(prefsKey, fetched.toString())
        .putLong("${prefsKey}_synced_at", System.currentTimeMillis()).apply()
      return fetched
    }
    return current
  }

  fun filterActive(items: JSONArray): JSONArray {
    val fresh = JSONArray()
    for (i in 0 until items.length()) {
      val item = items.optJSONObject(i) ?: continue
      if (WidgetSupport.isExpired(item.optString("deadline"))) continue
      fresh.put(item)
    }
    return fresh
  }

  private fun readCache(context: Context, prefsName: String, prefsKey: String): JSONArray {
    return try {
      val raw = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        .getString(prefsKey, null)
      if (raw.isNullOrEmpty()) JSONArray() else filterActive(JSONArray(raw))
    } catch (e: Exception) {
      JSONArray()
    }
  }
}
