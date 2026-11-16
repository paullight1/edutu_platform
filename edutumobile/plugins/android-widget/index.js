const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const pkg = require("../../package.json");

const WIDGET_CLASS_NAME = "EdutuWidgetProvider";
const WIDGET_INFO_NAME = "edutu_widget_info";

function getAndroidPackage(config) {
  return AndroidConfig.Package.getPackage(config);
}

function getMainApplication(manifest) {
  const application = manifest.manifest.application;
  if (!application || application.length === 0) {
    throw new Error("AndroidManifest.xml is missing an <application> element.");
  }

  return application[0];
}

function hasReceiver(application, receiverName) {
  return (application.receiver || []).some((receiver) => {
    const attrs = receiver.$ || {};
    return attrs["android:name"] === receiverName;
  });
}

// Every widget receiver the app ships. Keep in step with the committed
// AndroidManifest.xml and the provider classes under java/…/widgets/.
const WIDGET_RECEIVERS = [
  { className: "NextStepWidgetProvider", label: "@string/edutu_next_step_widget_name", infoName: "edutu_next_step_widget_info" },
  {
    className: WIDGET_CLASS_NAME,
    label: "@string/edutu_widget_name",
    infoName: WIDGET_INFO_NAME,
  },
  {
    className: "DeadlineWidgetProvider",
    label: "@string/edutu_deadline_widget_name",
    infoName: "edutu_deadline_widget_info",
  },
  {
    className: "TrendingWidgetProvider",
    label: "@string/edutu_trending_widget_name",
    infoName: "edutu_trending_widget_info",
  },
  {
    className: "ChatWidgetProvider",
    label: "@string/edutu_chat_widget_name",
    infoName: "edutu_chat_widget_info",
  },
  {
    className: "TrendingSpotlightWidgetProvider",
    label: "@string/edutu_trending_spotlight_widget_name",
    infoName: "edutu_trending_spotlight_widget_info",
  },
  {
    className: "TrendingGridWidgetProvider",
    label: "@string/edutu_trending_grid_widget_name",
    infoName: "edutu_trending_grid_widget_info",
  },
  {
    className: "TrendingTickerWidgetProvider",
    label: "@string/edutu_trending_ticker_widget_name",
    infoName: "edutu_trending_ticker_widget_info",
  },
  {
    className: "TrendingThumbListWidgetProvider",
    label: "@string/edutu_trending_thumblist_widget_name",
    infoName: "edutu_trending_thumblist_widget_info",
  },
  {
    className: "NewsWidgetProvider",
    label: "@string/edutu_news_widget_name",
    infoName: "edutu_news_widget_info",
  },
];

function addWidgetReceiver(androidManifest, props) {
  const application = getMainApplication(androidManifest);
  application.receiver = application.receiver || [];

  for (const widget of WIDGET_RECEIVERS) {
    const receiverName = `.widgets.${widget.className}`;
    if (hasReceiver(application, receiverName)) {
      continue;
    }

    const infoName =
      widget.className === WIDGET_CLASS_NAME
        ? props.widgetInfoName || widget.infoName
        : widget.infoName;

    application.receiver.push({
      $: {
        "android:name": receiverName,
        "android:exported": "true",
        "android:label": widget.label,
      },
      "intent-filter": [
        {
          action: [
            {
              $: {
                "android:name": "android.appwidget.action.APPWIDGET_UPDATE",
              },
            },
          ],
        },
      ],
      "meta-data": [
        {
          $: {
            "android:name": "android.appwidget.provider",
            "android:resource": `@xml/${infoName}`,
          },
        },
      ],
    });
  }

  return androidManifest;
}

function copyTemplates(mainRoot, packageName) {
  const templateRoot = path.join(__dirname, "templates");
  function copyTree(source, destination) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      const from = path.join(source, entry.name);
      const to = path.join(destination, entry.name);
      if (entry.isDirectory()) {
        copyTree(from, to);
      } else if (entry.name.endsWith(".kt")) {
        fs.writeFileSync(to, fs.readFileSync(from, "utf8").replaceAll("com.edutu.com", packageName));
      } else {
        fs.copyFileSync(from, to);
      }
    }
  }
  copyTree(path.join(templateRoot, "widgets"), path.join(mainRoot, "java", ...packageName.split("."), "widgets"));
  copyTree(path.join(templateRoot, "res"), path.join(mainRoot, "res"));
}

function withAndroidWidget(config, props = {}) {
  config = withAndroidManifest(config, (modConfig) => {
    modConfig.modResults = addWidgetReceiver(modConfig.modResults, props);
    return modConfig;
  });
  config = withMainApplication(config, (modConfig) => {
    const packageName = getAndroidPackage(modConfig);
    const start = `${packageName}.widgets.WidgetRefreshObserver.start(this)`;
    if (!modConfig.modResults.contents.includes(start)) {
      modConfig.modResults.contents = modConfig.modResults.contents.replace(
        "super.onCreate()",
        `super.onCreate()\n    ${start}`,
      );
    }
    return modConfig;
  });
  return withDangerousMod(config, ["android", async (modConfig) => {
    const androidRoot = modConfig.modRequest.platformProjectRoot;
    if (!fs.existsSync(androidRoot)) throw new Error("Android project must exist before generating widgets.");
    copyTemplates(path.join(androidRoot, "app", "src", "main"), getAndroidPackage(modConfig));
    return modConfig;
  }]);
}

module.exports = createRunOncePlugin(withAndroidWidget, "with-edutu-android-widget", pkg.version);
