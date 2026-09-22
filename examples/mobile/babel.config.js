module.exports = function (api) {
  api.cache(true);
  // unstable_transformImportMeta lets Metro handle the `import.meta` usage in
  // starkzap's dependency graph.
  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
  };
};
