// Babel config for Metro. babel-preset-expo does not compile static class blocks, which intl-messageformat 12
// (used by i18next-icu) ships untranspiled; without this plugin the Android bundle fails with a SyntaxError.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['@babel/plugin-transform-class-static-block'],
  };
};
