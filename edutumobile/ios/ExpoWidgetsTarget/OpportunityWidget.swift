import WidgetKit
import SwiftUI
internal import ExpoWidgets

struct OpportunityWidget: Widget {
  let name: String = "OpportunityWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: name, provider: WidgetsTimelineProvider(name: name)) { entry in
      WidgetsEntryView(entry: entry)
    }
    .configurationDisplayName("Top Matches")
    .description("Your best-matched opportunities and their deadlines.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    .contentMarginsDisabled()
  }
}

struct DeadlineWidget: Widget {
  let name: String = "DeadlineWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: name, provider: WidgetsTimelineProvider(name: name)) { entry in
      WidgetsEntryView(entry: entry)
    }
    .configurationDisplayName("Deadlines")
    .description("A calendar of your applied and saved opportunity deadlines.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular])
    .contentMarginsDisabled()
  }
}

struct TrendingWidget: Widget {
  let name: String = "TrendingWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: name, provider: WidgetsTimelineProvider(name: name)) { entry in
      WidgetsEntryView(entry: entry)
    }
    .configurationDisplayName("Trending")
    .description("What's hot on Edutu right now.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    .contentMarginsDisabled()
  }
}

struct ChatWidget: Widget {
  let name: String = "ChatWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: name, provider: WidgetsTimelineProvider(name: name)) { entry in
      WidgetsEntryView(entry: entry)
    }
    .configurationDisplayName("Ask Edutu")
    .description("Jump straight into a chat with your AI opportunity coach.")
    .supportedFamilies([.systemSmall, .accessoryCircular])
    .contentMarginsDisabled()
  }
}