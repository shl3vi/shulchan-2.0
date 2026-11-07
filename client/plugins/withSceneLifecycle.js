const { withAppDelegate, withInfoPlist, withXcodeProject } = require("expo/config-plugins");

/** iOS 27 stops apps at launch unless they adopt the scene life cycle, so the window moves to Expo's scene delegate. */
function withSceneLifecycle(config) {
  config = withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "EXExpoAppSceneDelegate",
          },
        ],
      },
    };
    return config;
  });

  config = withAppDelegate(config, (config) => {
    let contents = config.modResults.contents;
    contents = contents.replace(
      "class AppDelegate: ExpoAppDelegate {",
      "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {",
    );
    contents = contents.replace(
      /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/,
      "\n",
    );
    config.modResults.contents = contents;
    return config;
  });

  // The project folder has a space in its name, and the template runs the bundle script unquoted.
  return withXcodeProject(config, (config) => {
    const phases = config.modResults.hash.project.objects.PBXShellScriptBuildPhase ?? {};
    for (const phase of Object.values(phases)) {
      if (typeof phase !== "object" || typeof phase.shellScript !== "string") continue;
      phase.shellScript = phase.shellScript.replace(
        /`\\"\$NODE_BINARY\\" --print \\"(require\('path'\)\.dirname\(require\.resolve\('react-native\/package\.json'\)\) \+ '\/scripts\/react-native-xcode\.sh')\\"`/,
        '/bin/sh \\"$(\\"$NODE_BINARY\\" --print \\"$1\\")\\"',
      );
    }
    return config;
  });
}

module.exports = withSceneLifecycle;
