/* global require, module, __dirname */
/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("path");

module.exports = {
  dependencies: {
    "controller-native": {
      root: path.resolve(__dirname, "modules/controller"),
      platforms: {
        ios: {
          podspecPath: path.resolve(
            __dirname,
            "modules/controller/Controller.podspec"
          ),
        },
        android: {
          sourceDir: path.resolve(__dirname, "modules/controller/android"),
          packageImportPath:
            "import com.cartridge.controller.ControllerPackage;",
          packageInstance: "new ControllerPackage()",
        },
      },
    },
  },
};
