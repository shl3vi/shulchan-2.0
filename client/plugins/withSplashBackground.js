const fs = require("fs");
const path = require("path");
const { AndroidConfig, withAndroidStyles, withDangerousMod, withMainActivity } = require("expo/config-plugins");

const SPLASH = "splash_full";

function withSplashBackground(config) {
  config = withDangerousMod(config, [
    "android",
    async (config) => {
      const res = path.join(config.modRequest.platformProjectRoot, "app/src/main/res");
      const drawable = path.join(res, "drawable-nodpi");
      fs.mkdirSync(drawable, { recursive: true });
      fs.copyFileSync(
        path.join(config.modRequest.projectRoot, "assets/images/splash.jpg"),
        path.join(drawable, `${SPLASH}.jpg`),
      );
      const drawableDir = path.join(res, "drawable");
      fs.mkdirSync(drawableDir, { recursive: true });
      fs.writeFileSync(
        path.join(drawableDir, `${SPLASH}_bg.xml`),
        `<?xml version="1.0" encoding="utf-8"?>
<bitmap xmlns:android="http://schemas.android.com/apk/res/android"
  android:gravity="fill"
  android:src="@drawable/${SPLASH}" />
`,
      );
      fs.writeFileSync(
        path.join(drawableDir, "splash_empty.xml"),
        `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
  <size android:width="1dp" android:height="1dp" />
  <solid android:color="@android:color/transparent" />
</shape>
`,
      );
      return config;
    },
  ]);

  config = withAndroidStyles(config, (config) => {
    const splashTheme = { name: "Theme.App.SplashScreen", parent: "Theme.SplashScreen" };
    const appTheme = { name: "AppTheme", parent: "Theme.AppCompat.DayNight.NoActionBar" };
    config.modResults = AndroidConfig.Styles.assignStylesValue(config.modResults, {
      add: true,
      parent: splashTheme,
      name: "android:windowBackground",
      value: `@drawable/${SPLASH}_bg`,
    });
    config.modResults = AndroidConfig.Styles.assignStylesValue(config.modResults, {
      add: true,
      parent: appTheme,
      name: "android:windowBackground",
      value: `@drawable/${SPLASH}_bg`,
    });
    config.modResults = AndroidConfig.Styles.assignStylesValue(config.modResults, {
      add: true,
      parent: splashTheme,
      name: "windowSplashScreenAnimatedIcon",
      value: "@drawable/splash_empty",
    });
    config.modResults = AndroidConfig.Styles.assignStylesValue(config.modResults, {
      add: true,
      parent: splashTheme,
      name: "windowSplashScreenBackground",
      value: "#4C3500",
    });
    return config;
  });

  return withMainActivity(config, (config) => {
    const needle = "SplashScreenManager.registerOnActivity(this)";
    if (!config.modResults.contents.includes("SplashScreenManager.hide()")) {
      config.modResults.contents = config.modResults.contents.replace(
        needle,
        `${needle}\n    SplashScreenManager.hide()`,
      );
    }
    return config;
  });
}

module.exports = withSplashBackground;
