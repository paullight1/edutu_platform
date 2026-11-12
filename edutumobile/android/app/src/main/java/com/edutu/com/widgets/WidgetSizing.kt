package com.edutu.com.widgets

/** dp-based layout policy shared by all lists; keep text readable as a widget shrinks. */
object WidgetSizing {
  fun useHero(width: Int, height: Int): Boolean = width < 220 || height < 140

  fun titleLines(height: Int, fontScale: Float, maximum: Int = 3): Int {
    val scale = fontScale.coerceAtLeast(1f)
    return ((height - 60 - 16 * scale) / (18 * scale)).toInt().coerceIn(1, maximum)
  }

  fun rows(height: Int, maximum: Int, fontScale: Float = 1f): Int {
    val scale = fontScale.coerceAtLeast(1f)
    val header = 48 * scale
    val row = 52 * scale
    return ((height - header) / row).toInt().coerceIn(1, maximum)
  }
}
