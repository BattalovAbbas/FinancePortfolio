const path = require('path');
const webpack = require('webpack');

module.exports = {
  mode: "development",
  entry: "./src/index.js",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bundle.js",
  },
  plugins: [
    new webpack.IgnorePlugin(/^pg-native$/)
  ],
  devtool: "source-map",
  target: "node",
};
