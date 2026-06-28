import WidgetKit
import SwiftUI
internal import ExpoWidgets

struct OpportunityWidget: Widget {
  let name: String = "OpportunityWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: name, provider: WidgetsTimelineProvider(name: name)) { entry in
      WidgetsEntryView(entry: entry)
    }
    .configurationDisplayName("Opportunity")
    .description("See a highlighted Edutu opportunity at a glance.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    .contentMarginsDisabled()
  }
}