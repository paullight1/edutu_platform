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
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular])
    .contentMarginsDisabled()
  }
}

struct TrendingSpotlightWidget: Widget {
  let name = "TrendingSpotlightWidget"
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: name, provider: WidgetsTimelineProvider(name: name)) { entry in
      WidgetsEntryView(entry: entry)
    }
    .configurationDisplayName("Trending Spotlight")
    .description("A rotating photo spotlight of trending opportunities.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    .contentMarginsDisabled()
  }
}

struct TrendingGridWidget: Widget {
  let name = "TrendingGridWidget"
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: name, provider: WidgetsTimelineProvider(name: name)) { entry in
      WidgetsEntryView(entry: entry)
    }
    .configurationDisplayName("Trending Grid")
    .description("A grid of trending opportunities with photo covers.")
    .supportedFamilies([.systemMedium, .systemLarge])
    .contentMarginsDisabled()
  }
}

struct TrendingTickerWidget: Widget {
  let name = "TrendingTickerWidget"
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: name, provider: WidgetsTimelineProvider(name: name)) { entry in
      WidgetsEntryView(entry: entry)
    }
    .configurationDisplayName("Trending Ticker")
    .description("A wide banner spotlighting a trending opportunity.")
    .supportedFamilies([.systemMedium])
    .contentMarginsDisabled()
  }
}

struct TrendingThumbListWidget: Widget {
  let name = "TrendingThumbListWidget"
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: name, provider: WidgetsTimelineProvider(name: name)) { entry in
      WidgetsEntryView(entry: entry)
    }
    .configurationDisplayName("Trending List")
    .description("A ranked list of trending opportunities with photo thumbnails.")
    .supportedFamilies([.systemMedium, .systemLarge])
    .contentMarginsDisabled()
  }
}

struct NextStepWidget: Widget {
  let name = "NextStepWidget"
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: name, provider: WidgetsTimelineProvider(name: name)) { entry in
      WidgetsEntryView(entry: entry)
    }
    .configurationDisplayName("Today’s Next Step")
    .description("A real preparation task from your My Plan, ready to continue.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    .contentMarginsDisabled()
  }
}
