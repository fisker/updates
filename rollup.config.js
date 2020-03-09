const {name} = require("./package.json");

module.exports = {
  input: `${name}.js`,
  output: {
    file: name,
    name,
    format: "cjs",
  },
  plugins: [
    require("rollup-plugin-hashbang")(),
    require("@rollup/plugin-json")(),
    require("@rollup/plugin-node-resolve")({
      preferBuiltins: true,
      jail: __dirname,
      customResolveOptions: {
        packageFilter: (pkg) => {
          if (pkg.name === "cacache") {
            return {main: "/dev/null"};
          }
          return pkg;
        }
      }
    }),
    require("@rollup/plugin-commonjs")(),
    require("rollup-plugin-terser").terser({output: {comments: false}}),
  ],
};
