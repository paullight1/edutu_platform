import fs from "fs";
import path from "path";

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;

    process.env[key] = rawValue.trim().replace(/^['"]|['"]$/g, "");
  }
}

loadLocalEnv();

process.env.EXPO_ROUTER_APP_ROOT = 'app';

const enableAssociatedDomains = process.env.EXPO_ENABLE_ASSOCIATED_DOMAINS === "1";

function resolveGoogleServicesFile() {
  const candidates = [
    process.env.GOOGLE_SERVICES_JSON,
    "./google-services.json",
    "./android/app/google-services.json"
  ].filter(Boolean);

  for (const candidate of candidates) {
    const absolutePath = path.resolve(process.cwd(), candidate);
    if (fs.existsSync(absolutePath)) {
      return path.relative(process.cwd(), absolutePath);
    }
  }

  return null;
}

const googleServicesFile = resolveGoogleServicesFile();

export default {
    expo: {
    name: "Edutu",
    slug: "hanaedutu",
    owner: "edutu",
    version: "1.0.0",
    runtimeVersion: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "dark",
    scheme: "edutu",
    privacyPolicyUrl: "https://edutu.org/privacy",
    supportUrl: "https://edutu.org/support",
    splash: {
      image: "./assets/splash-icon.jpg",
      resizeMode: "contain",
      backgroundColor: "#171a4f"
    },
    ios: {
      // Must match ios/Edutu.xcodeproj (PRODUCT_BUNDLE_IDENTIFIER) so a
      // `prebuild` regeneration stays consistent with the committed project.
      bundleIdentifier: "com.tegm.edutuios",
      // iPhone-only for v1: the app is portrait-locked and iPad layouts are
      // untested — shipping tablet support invites App Review layout rejections.
      supportsTablet: false,
      buildNumber: "1",
      deploymentTarget: "16.4",
      ...(enableAssociatedDomains ? { associatedDomains: ["applinks:edutu.org"] } : {}),
      // APNs entitlement so remote push works in release builds (EAS still
      // needs a push key configured under this bundle id).
      entitlements: {
        "aps-environment": "production"
      },
      config: {
        usesNonExemptEncryption: false
      },
      infoPlist: {
        // Dark-first static default so the clock/signal/battery are light
        // (visible) on our dark chrome before JS asserts the style — and after
        // iOS reverts to this default on appearance transitions / resume. The
        // JS layer (expo-status-bar) flips it to dark content at runtime in the
        // light theme. UIViewControllerBasedStatusBarAppearance MUST stay false:
        // RCTStatusBarManager requires it, and true crashes on launch.
        UIStatusBarStyle: "UIStatusBarStyleLightContent",
        UIViewControllerBasedStatusBarAppearance: false,
        UIBackgroundModes: ["fetch", "remote-notification", "processing"],
        BGTaskSchedulerPermittedIdentifiers: [
          "com.expo.modules.backgroundtask.processing"
        ],
        NSPhotoLibraryUsageDescription: "Allow Edutu to access your photos to update your profile and create content.",
        NSCameraUsageDescription: "Allow Edutu to access your camera to take photos for your profile.",
        NSMicrophoneUsageDescription: "Allow Edutu to record audio when you use voice chat features.",
        NSPhotoLibraryAddUsageDescription: "Allow Edutu to save images to your photo library."
      }
    },
    android: {
      // Must match android/app/build.gradle applicationId AND the
      // package_name in google-services.json — a mismatch makes Firebase fail
      // to initialize and crashes the app on launch.
      package: "com.edutu.com",
      versionCode: 1,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#171a4f"
      },
      ...(googleServicesFile ? { googleServicesFile } : {}),
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            {
              scheme: "https",
              host: "edutu.org",
              pathPrefix: "/"
            }
          ],
          category: ["BROWSABLE", "DEFAULT"]
        }
      ]
    },
    web: {
      favicon: "./assets/favicon.png",
      bundler: "metro"
    },
    updates: {
      url: "https://u.expo.dev/97c7d577-7e08-4f3c-a199-d1ca149ebee9"
    },
    plugins: [
      "expo-router",
      "expo-localization",
      [
        "expo-notifications",
        {
          // Android renders notification icons as an alpha silhouette — must be
          // white-on-transparent, never the full-color app icon.
          "icon": "./assets/notification-icon.png",
          "color": "#171a4f",
          "sounds": []
        }
      ],
      [
        "expo-calendar",
        {
          "calendarPermission": "Allow Edutu to add your opportunity milestones and application deadlines to your calendar."
        }
      ],
      [
        "expo-image-picker",
        {
          "photosPermission": "Allow Edutu to access your photos to update your profile and create content.",
          "cameraPermission": "Allow Edutu to access your camera to take photos for your profile."
        }
      ],
      [
        "expo-widgets",
        {
          widgets: [
            {
              name: "OpportunityWidget",
              displayName: "Top Matches",
              description: "Your best-matched opportunities and their deadlines.",
              contentMarginsDisabled: true,
              supportedFamilies: [
                "systemSmall",
                "systemMedium",
                "systemLarge",
                "accessoryCircular",
                "accessoryRectangular",
                "accessoryInline"
              ]
            },
            {
              name: "DeadlineWidget",
              displayName: "Deadlines",
              description: "A calendar of your applied and saved opportunity deadlines.",
              contentMarginsDisabled: true,
              supportedFamilies: [
                "systemSmall",
                "systemMedium",
                "systemLarge",
                "accessoryRectangular"
              ]
            },
            {
              name: "TrendingWidget",
              displayName: "Trending",
              description: "What's hot on Edutu right now.",
              contentMarginsDisabled: true,
              supportedFamilies: ["systemSmall", "systemMedium", "systemLarge"]
            },
            {
              name: "TrendingSpotlightWidget",
              displayName: "Trending Spotlight",
              description: "A rotating photo spotlight of the hottest opportunities on Edutu.",
              contentMarginsDisabled: true,
              supportedFamilies: ["systemSmall", "systemMedium", "systemLarge"]
            },
            {
              name: "TrendingGridWidget",
              displayName: "Trending Grid",
              description: "A 2x2 grid of trending opportunities with photo covers.",
              contentMarginsDisabled: true,
              supportedFamilies: ["systemMedium", "systemLarge"]
            },
            {
              name: "TrendingTickerWidget",
              displayName: "Trending Ticker",
              description: "A wide banner spotlighting a rotating trending opportunity.",
              contentMarginsDisabled: true,
              supportedFamilies: ["systemMedium"]
            },
            {
              name: "TrendingThumbListWidget",
              displayName: "Trending List",
              description: "A ranked list of trending opportunities with photo thumbnails.",
              contentMarginsDisabled: true,
              supportedFamilies: ["systemMedium", "systemLarge"]
            },
            {
              name: "ChatWidget",
              displayName: "Ask Edutu",
              description: "Jump straight into a chat with your AI opportunity coach.",
              contentMarginsDisabled: true,
              supportedFamilies: ["systemSmall", "accessoryCircular"]
            }
          ]
        }
      ],
      [
        "./plugins/android-widget",
        {
          widgetName: "Edutu Opportunities",
          title: "Opportunities for you",
          subtitle: "Rotating scholarships, internships, and deadlines",
          minWidth: "180dp",
          minHeight: "110dp",
          targetCellWidth: "3",
          targetCellHeight: "2"
        }
      ],
      "expo-background-task"
    ],
    experiments: {
      tsconfigPaths: true,
      typedRoutes: true
    },
    extra: {
      clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      apiBaseUrl: process.env.EXPO_PUBLIC_API_URL,
      // Numeric App Store ID (e.g. "1234567890"), issued when the iOS app is
      // first created in App Store Connect. Until it is set, "Rate Edutu"
      // falls back to the website rather than opening a dead store link.
      // Android needs no equivalent — its store URL is the package name.
      iosAppStoreId: process.env.EXPO_PUBLIC_IOS_APP_STORE_ID,
      eas: {
        projectId: "97c7d577-7e08-4f3c-a199-d1ca149ebee9"
      }
    }
  }
};
