import WidgetKit
import SwiftUI
internal import ExpoWidgets

@main
struct ExportWidgets0: WidgetBundle {
  var body: some Widget {
    OpportunityWidget()
    DeadlineWidget()
    TrendingWidget()
    ExportWidgets1().body
    WidgetLiveActivity()
  }
}


struct ExportWidgets1: WidgetBundle {
  var body: some Widget {
    TrendingSpotlightWidget()
    TrendingGridWidget()
    TrendingTickerWidget()
    ExportWidgets2().body
  }
}

struct ExportWidgets2: WidgetBundle {
  var body: some Widget {
    TrendingThumbListWidget()
    ChatWidget()
    NextStepWidget()
  }
}
