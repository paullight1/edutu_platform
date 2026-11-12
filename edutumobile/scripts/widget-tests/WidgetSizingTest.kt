package com.edutu.com.widgets

fun main() {
  check(WidgetSizing.rows(140, 5) == 1) { "A short widget must not cram three rows" }
  check(WidgetSizing.rows(200, 5) == 2)
  check(WidgetSizing.rows(340, 5) == 5)
  check(WidgetSizing.rows(340, 5, 1.6f) == 3) { "Larger fonts need fewer rows" }
  check(WidgetSizing.rows(140, 5, 2f) == 1)
  check(WidgetSizing.useHero(150, 340)) { "Tall narrow widgets still need the hero" }
  check(!WidgetSizing.useHero(300, 140))
  check(WidgetSizing.titleLines(140, 1f) == 3)
  check(WidgetSizing.titleLines(140, 2f) == 1) { "Large text must leave space for the deadline" }
  check(WidgetSizing.titleLines(240, 1f) == 3)
  println("WidgetSizing: 10 checks passed")
}
