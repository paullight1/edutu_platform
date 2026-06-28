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
      supportsTablet: true,
      buildNumber: "1",
      ...(enableAssociatedDomains ? { associatedDomains: ["applinks:edutu.org"] } : {}),
      config: {
        usesNonExemptEncryption: false
      },
      infoPlist: {
        UIBackgroundModes: ["fetch", "remote-notification"],
        NSPhotoLibraryUsageDescription: "Allow Edutu to access your photos to update your profile and create content.",
        NSCameraUsageDescription: "Allow Edutu to access your camera to take photos for your profile.",
        NSMicrophoneUsageDescription: "Allow Edutu to record audio when you use voice chat features.",
        NSPhotoLibraryAddUsageDescription: "Allow Edutu to save images to your photo library."
      }
    },
    android: {
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
      [
        "expo-notifications",
        {
          "icon": "./assets/icon.png",
          "color": "#171a4f",
          "sounds": []
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
              displayName: "Opportunity",
              description: "See a highlighted Edutu opportunity at a glance.",
              contentMarginsDisabled: true,
              supportedFamilies: [
                "systemSmall",
                "systemMedium",
                "systemLarge",
                "accessoryCircular",
                "accessoryRectangular",
                "accessoryInline"
              ]
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
      ]
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
      eas: {
        projectId: "97c7d577-7e08-4f3c-a199-d1ca149ebee9"
      }
    }
  }
};
