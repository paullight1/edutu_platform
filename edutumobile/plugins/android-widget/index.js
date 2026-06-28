const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withDangerousMod,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const pkg = require("../../package.json");

const WIDGET_CLASS_NAME = "EdutuWidgetProvider";
const WIDGET_LAYOUT_NAME = "edutu_widget";
const WIDGET_INFO_NAME = "edutu_widget_info";
const WIDGET_STRING_NAME = "edutu_widget_strings";

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFileOnce(filePath, contents) {
  if (fs.existsSync(filePath)) {
    return;
  }

  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, contents);
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

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

function addWidgetReceiver(androidManifest, props) {
  const application = getMainApplication(androidManifest);
  const receiverName = `.widgets.${WIDGET_CLASS_NAME}`;

  if (hasReceiver(application, receiverName)) {
    return androidManifest;
  }

  application.receiver = application.receiver || [];
  application.receiver.push({
    $: {
      "android:name": receiverName,
      "android:exported": "true",
      "android:label": "@string/edutu_widget_name",
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
          "android:resource": `@xml/${props.widgetInfoName || WIDGET_INFO_NAME}`,
        },
      },
    ],
  });

  return androidManifest;
}

function createWidgetProvider(packageName) {
  return `package ${packageName}.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import ${packageName}.R

class ${WIDGET_CLASS_NAME} : AppWidgetProvider() {
  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray
  ) {
    appWidgetIds.forEach { appWidgetId ->
      val views = RemoteViews(context.packageName, R.layout.${WIDGET_LAYOUT_NAME})
      views.setTextViewText(R.id.edutu_widget_title, context.getString(R.string.edutu_widget_title))
      views.setTextViewText(R.id.edutu_widget_subtitle, context.getString(R.string.edutu_widget_subtitle))
      appWidgetManager.updateAppWidget(appWidgetId, views)
    }
  }
}
`;
}

function createWidgetInfoXml(props) {
  const minWidth = props.minWidth || "250dp";
  const minHeight = props.minHeight || "110dp";
  const targetCellWidth = props.targetCellWidth || "4";
  const targetCellHeight = props.targetCellHeight || "2";
  const updatePeriodMillis = String(props.updatePeriodMillis || 0);

  return `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
  android:minWidth="${escapeXml(minWidth)}"
  android:minHeight="${escapeXml(minHeight)}"
  android:targetCellWidth="${escapeXml(targetCellWidth)}"
  android:targetCellHeight="${escapeXml(targetCellHeight)}"
  android:updatePeriodMillis="${escapeXml(updatePeriodMillis)}"
  android:initialLayout="@layout/${WIDGET_LAYOUT_NAME}"
  android:resizeMode="horizontal|vertical"
  android:widgetCategory="home_screen" />
`;
}

function createWidgetLayoutXml() {
  return `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:id="@+id/edutu_widget_root"
  android:layout_width="match_parent"
  android:layout_height="match_parent"
  android:orientation="vertical"
  android:gravity="center_vertical"
  android:padding="16dp"
  android:background="@drawable/edutu_widget_background">

  <TextView
    android:id="@+id/edutu_widget_title"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:ellipsize="end"
    android:maxLines="1"
    android:text="@string/edutu_widget_title"
    android:textColor="@android:color/white"
    android:textSize="16sp"
    android:textStyle="bold" />

  <TextView
    android:id="@+id/edutu_widget_subtitle"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="6dp"
    android:ellipsize="end"
    android:maxLines="2"
    android:text="@string/edutu_widget_subtitle"
    android:textColor="#D6DBFF"
    android:textSize="13sp" />
</LinearLayout>
`;
}

function createWidgetBackgroundXml() {
  return `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
  <solid android:color="#171A4F" />
  <corners android:radius="18dp" />
  <padding
    android:left="0dp"
    android:top="0dp"
    android:right="0dp"
    android:bottom="0dp" />
</shape>
`;
}

function createWidgetStringsXml(props) {
  const widgetName = props.widgetName || "Edutu";
  const title = props.title || "Edutu";
  const subtitle = props.subtitle || "Track scholarships and next steps";

  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="edutu_widget_name">${escapeXml(widgetName)}</string>
  <string name="edutu_widget_title">${escapeXml(title)}</string>
  <string name="edutu_widget_subtitle">${escapeXml(subtitle)}</string>
</resources>
`;
}

function withAndroidWidget(config, props = {}) {
  config = withAndroidManifest(config, (modConfig) => {
    modConfig.modResults = addWidgetReceiver(modConfig.modResults, props);
    return modConfig;
  });

  return withDangerousMod(config, [
    "android",
    async (modConfig) => {
      const androidRoot = modConfig.modRequest.platformProjectRoot;
      if (!fs.existsSync(androidRoot)) {
        throw new Error("Android project was not generated before the widget plugin ran.");
      }

      const packageName = getAndroidPackage(modConfig);
      const packagePath = packageName.replace(/\./g, path.sep);
      const mainRoot = path.join(androidRoot, "app", "src", "main");

      writeFileOnce(
        path.join(mainRoot, "java", packagePath, "widgets", `${WIDGET_CLASS_NAME}.kt`),
        createWidgetProvider(packageName)
      );
      writeFileOnce(
        path.join(mainRoot, "res", "xml", `${props.widgetInfoName || WIDGET_INFO_NAME}.xml`),
        createWidgetInfoXml(props)
      );
      writeFileOnce(
        path.join(mainRoot, "res", "layout", `${WIDGET_LAYOUT_NAME}.xml`),
        createWidgetLayoutXml()
      );
      writeFileOnce(
        path.join(mainRoot, "res", "drawable", "edutu_widget_background.xml"),
        createWidgetBackgroundXml()
      );
      writeFileOnce(
        path.join(mainRoot, "res", "values", `${WIDGET_STRING_NAME}.xml`),
        createWidgetStringsXml(props)
      );

      return modConfig;
    },
  ]);
}

module.exports = createRunOncePlugin(
  withAndroidWidget,
  "with-edutu-android-widget",
  pkg.version
);
