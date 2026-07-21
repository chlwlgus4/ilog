const { withPodfile } = require("@expo/config-plugins");

const MODULAR_HEADERS_DIRECTIVE = "use_modular_headers!";
const PODFILE_ANCHOR = "prepare_react_native_project!\n\n";

module.exports = function withGoogleSignInModularHeaders(config) {
  return withPodfile(config, (config) => {
    if (config.modResults.contents.includes(MODULAR_HEADERS_DIRECTIVE)) {
      return config;
    }

    if (!config.modResults.contents.includes(PODFILE_ANCHOR)) {
      throw new Error("Unable to add modular headers to the generated iOS Podfile.");
    }

    // GoogleSignIn 9 pulls Swift App Check pods that need module maps with static libraries.
    config.modResults.contents = config.modResults.contents.replace(
      PODFILE_ANCHOR,
      `${PODFILE_ANCHOR}${MODULAR_HEADERS_DIRECTIVE}\n\n`,
    );

    return config;
  });
};
