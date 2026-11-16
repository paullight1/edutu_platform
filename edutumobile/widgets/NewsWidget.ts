export type NewsWidgetItem = {
  id: string;
  title: string;
  category: string;
  /** Formatted date, e.g. "Apr 28". */
  published: string;
  /** Web article the widget opens in the browser. */
  url: string;
  imageUrl?: string;
};

export type NewsWidgetProps = {
  items: NewsWidgetItem[];
  logoUri?: string;
};

// Android owns this widget natively (NewsWidgetProvider reads the JSON file
// widgetSuiteSync writes); these exports keep the registry/module shape
// consistent with the other widgets until an iOS variant ships.
export function updateNewsWidget(_props: NewsWidgetProps) {
  return;
}

const NewsWidget = {
  updateSnapshot: updateNewsWidget,
};

export default NewsWidget;
