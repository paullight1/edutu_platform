package com.edutu.com.widgets

import android.content.Context
import org.json.JSONArray

/**
 * Shared source-of-truth loader for the image-led trending widgets (Spotlight,
 * Grid, Ticker, Thumbnail list). Prefers the app-written personalised trending
 * file, then the widget's own cached network fetch, then a fresh fetch — always
 * dropping expired items. Keeps every trending widget on identical data + rules.
 */
object TrendingWidgetData {

  fun load(
    context: Context,
    fileName: String,
    prefsName: String,
    prefsKey: String,
    fetchLimit: Int,
  ): JSONArray {
    val fromFile = WidgetSupport.readAppItemsFile(context, fileName)
    if (fromFile != null && fromFile.items.length() > 0) {
      val fresh = filterActive(fromFile.items)
      if (fresh.length() > 0) return fresh
    }

    val cached = readCache(context, prefsName, prefsKey)
    if (cached.length() > 0) return cached

    val fetched = WidgetSupport.fetchOpportunities(context, fetchLimit)
    if (fetched != null && fetched.length() > 0) {
      context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        .edit().putString(prefsKey, fetched.toString()).apply()
      return fetched
    }
    return JSONArray()
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
