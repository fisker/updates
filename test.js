"use strict";

const del = require("del");
const execa = require("execa");
const restana = require("restana");
const tempy = require("tempy");
const {bin} = require("./package.json");
const {join} = require("path");
const {test, expect, beforeAll, afterAll} = global;
const {writeFile, readFile} = require("fs").promises;
const {isIPv6} = require("net");

const testFile = "./fixtures/test.json";
const testPkg = require(testFile);
const testDir = tempy.directory();
const script = join(__dirname, bin);

const dependencyTypes = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

const testPackages = new Set();
for (const dependencyType of dependencyTypes) {
  for (const name of Object.keys(testPkg[dependencyType] || [])) {
    testPackages.add(name);
  }
}

function makeUrl(server) {
  const {address, port} = server.address();
  const hostname = isIPv6(address) ? `[${address}]` : address;
  return Object.assign(new URL("http://x"), {hostname, port}).toString();
}

function defaultRoute(req, res) {
  console.error(`default handler hit for ${req.url}`);
  res.send(404);
}

let npmServer, githubServer, githubUrl, npmUrl;
beforeAll(async () => {
  let commits, tags;

  [npmServer, githubServer, commits, tags] = await Promise.all([
    restana({defaultRoute}),
    restana({defaultRoute}),
    readFile(join(__dirname, "fixtures/github/updates-commits.json")),
    readFile(join(__dirname, "fixtures/github/updates-tags.json"))
  ]);

  for (const packageName of testPackages) {
    const name = packageName.replace(/\//g, "%2f");
    const path = join(__dirname, `fixtures/npm/${name}.json`);
    npmServer.get(`/${name}`, async (_, res) => res.send(await readFile(path)));
  }

  githubServer.get("/repos/silverwind/updates/commits", (_, res) => res.send(commits));
  githubServer.get("/repos/silverwind/updates/git/refs/tags", (_, res) => res.send(tags));

  [githubServer, npmServer] = await Promise.all([
    githubServer.start(0),
    npmServer.start(0),
  ]);

  githubUrl = makeUrl(githubServer);
  npmUrl = makeUrl(npmServer);

  await writeFile(join(testDir, ".npmrc"), `registry=${npmUrl}`); // Fake registry
  await writeFile(join(testDir, "package.json"), JSON.stringify(testPkg, null, 2)); // Copy fixture
});

afterAll(async () => {
  await Promise.all([
    del(testDir, {force: true}),
    npmServer && npmServer.close(),
    githubServer && githubServer.close(),
  ]);
});

function makeTest(args, expected) {
  return async () => {
    const argsArr = [...args.split(/\s+/), "-c", "-G", githubUrl];
    const {stdout} = await execa(script, argsArr, {cwd: testDir});
    const {results} = JSON.parse(stdout);

    // Parse results, with custom validation for the dynamic "age" property
    for (const dependencyType of dependencyTypes) {
      for (const [dependencyName, actual] of Object.entries(results[dependencyType] || {})) {
        for (const [key, actualValue] of Object.entries(actual || {})) {
          const expectedValue = expected[dependencyType][dependencyName][key];
          if (key === "age") {
            expect(typeof actualValue).toEqual("string");
            expect(actualValue.length > 0).toBeTruthy();
          } else {
            expect(expectedValue).toEqual(actualValue);
          }
        }
      }
    }
  };
}

test("simple", async () => {
  const {stdout, stderr, exitCode} = await execa(script, ["-C", "-G", githubUrl, "-f", testFile]);
  expect(stderr).toEqual("");
  expect(stdout).toInclude("prismjs");
  expect(stdout).toInclude("https://github.com/silverwind/updates");
  expect(exitCode).toEqual(0);
});

if (process.env.CI) {
  test("global", async () => {
    await execa("npm", ["i", "-g", "."]);
    const {stdout, stderr, exitCode} = await execa("updates", ["-C", "-G", githubUrl, "-f", testFile]);
    expect(stderr).toEqual("");
    expect(stdout).toInclude("prismjs");
    expect(stdout).toInclude("https://github.com/silverwind/updates");
    expect(exitCode).toEqual(0);
  });
}

test("latest", makeTest("-j", {
  dependencies: {
    "gulp-sourcemaps": {
      old: "2.0.0",
      new: "2.6.5",
      info: "https://github.com/gulp-sourcemaps/gulp-sourcemaps",
    },
    "prismjs": {
      old: "1.0.0",
      new: "1.17.1",
      info: "https://github.com/LeaVerou/prism",
    },
    "svgstore": {
      old: "^3.0.0",
      new: "^3.0.0-2",
      info: "https://github.com/svgstore/svgstore",
    },
    "html-webpack-plugin": {
      old: "4.0.0-alpha.2",
      new: "4.0.0-beta.11",
      info: "https://github.com/jantimon/html-webpack-plugin",
    },
    "noty": {
      old: "3.1.0",
      new: "3.2.0-beta",
      info: "https://github.com/needim/noty",
    },
    "jpeg-buffer-orientation": {
      old: "0.0.0",
      new: "2.0.3",
      info: "https://github.com/fisker/jpeg-buffer-orientation",
    },
    "styled-components": {
      old: "2.5.0-1",
      new: "5.0.0-rc.2",
      info: "https://github.com/styled-components/styled-components",
    },
    "@babel/preset-env": {
      old: "7.0.0",
      new: "7.7.6",
      info: "https://github.com/babel/babel/tree/master/packages/babel-preset-env",
    },
    "updates": {
      old: "6941e05",
      new: "537ccb7",
      info: "https://github.com/silverwind/updates",
    },
  },
  peerDependencies: {
    "@babel/preset-env": {
      old: "~6.0.0",
      new: "~7.7.6",
      info: "https://github.com/babel/babel/tree/master/packages/babel-preset-env"
    }
  },
}));

test("greatest", makeTest("-j -g", {
  dependencies: {
    "gulp-sourcemaps": {
      old: "2.0.0",
      new: "2.6.5",
      info: "https://github.com/gulp-sourcemaps/gulp-sourcemaps",
    },
    "prismjs": {
      old: "1.0.0",
      new: "1.17.1",
      info: "https://github.com/LeaVerou/prism",
    },
    "html-webpack-plugin": {
      old: "4.0.0-alpha.2",
      new: "4.0.0-beta.11",
      info: "https://github.com/jantimon/html-webpack-plugin",
    },
    "noty": {
      old: "3.1.0",
      new: "3.1.4",
      info: "https://github.com/needim/noty",
    },
    "jpeg-buffer-orientation": {
      old: "0.0.0",
      new: "2.0.3",
      info: "https://github.com/fisker/jpeg-buffer-orientation",
    },
    "styled-components": {
      old: "2.5.0-1",
      new: "5.0.0-rc.2",
      info: "https://github.com/styled-components/styled-components",
    },
    "@babel/preset-env": {
      old: "7.0.0",
      new: "7.7.6",
      info: "https://github.com/babel/babel/tree/master/packages/babel-preset-env",
    },
    "updates": {
      old: "6941e05",
      new: "537ccb7",
      info: "https://github.com/silverwind/updates",
    },
  },
  peerDependencies: {
    "@babel/preset-env": {
      old: "~6.0.0",
      new: "~7.7.6",
      info: "https://github.com/babel/babel/tree/master/packages/babel-preset-env"
    }
  }
}));

test("prerelease", makeTest("-j -g -p", {
  dependencies: {
    "gulp-sourcemaps": {
      old: "2.0.0",
      new: "2.6.5",
      info: "https://github.com/gulp-sourcemaps/gulp-sourcemaps",
    },
    "prismjs": {
      old: "1.0.0",
      new: "1.17.1",
      info: "https://github.com/LeaVerou/prism",
    },
    "svgstore": {
      old: "^3.0.0",
      new: "^3.0.0-2",
      info: "https://github.com/svgstore/svgstore",
    },
    "html-webpack-plugin": {
      old: "4.0.0-alpha.2",
      new: "4.0.0-beta.11",
      info: "https://github.com/jantimon/html-webpack-plugin",
    },
    "noty": {
      old: "3.1.0",
      new: "3.2.0-beta",
      info: "https://github.com/needim/noty",
    },
    "jpeg-buffer-orientation": {
      old: "0.0.0",
      new: "2.0.3",
      info: "https://github.com/fisker/jpeg-buffer-orientation",
    },
    "styled-components": {
      old: "2.5.0-1",
      new: "5.0.0-rc.2",
      info: "https://github.com/styled-components/styled-components",
    },
    "@babel/preset-env": {
      old: "7.0.0",
      new: "7.7.6",
      info: "https://github.com/babel/babel/tree/master/packages/babel-preset-env",
    },
    "updates": {
      old: "6941e05",
      new: "537ccb7",
      info: "https://github.com/silverwind/updates",
    },
  },
  peerDependencies: {
    "@babel/preset-env": {
      old: "~6.0.0",
      new: "~7.7.6",
      info: "https://github.com/babel/babel/tree/master/packages/babel-preset-env"
    }
  },
}));

test("release", makeTest("-j -R", {
  dependencies: {
    "gulp-sourcemaps": {
      old: "2.0.0",
      new: "2.6.5",
      info: "https://github.com/gulp-sourcemaps/gulp-sourcemaps",
    },
    "prismjs": {
      old: "1.0.0",
      new: "1.17.1",
      info: "https://github.com/LeaVerou/prism",
    },
    "svgstore": {
      old: "^3.0.0",
      new: "^2.0.3",
      info: "https://github.com/svgstore/svgstore",
    },
    "html-webpack-plugin": {
      old: "4.0.0-alpha.2",
      new: "3.2.0",
      info: "https://github.com/jantimon/html-webpack-plugin",
    },
    "noty": {
      old: "3.1.0",
      new: "3.1.4",
      info: "https://github.com/needim/noty",
    },
    "jpeg-buffer-orientation": {
      old: "0.0.0",
      new: "2.0.3",
      info: "https://github.com/fisker/jpeg-buffer-orientation",
    },
    "styled-components": {
      old: "2.5.0-1",
      new: "4.4.1",
      info: "https://github.com/styled-components/styled-components",
    },
    "@babel/preset-env": {
      old: "7.0.0",
      new: "7.7.6",
      info: "https://github.com/babel/babel/tree/master/packages/babel-preset-env",
    },
    "updates": {
      old: "6941e05",
      new: "537ccb7",
      info: "https://github.com/silverwind/updates",
    },
  },
  peerDependencies: {
    "@babel/preset-env": {
      old: "~6.0.0",
      new: "~7.7.6",
      info: "https://github.com/babel/babel/tree/master/packages/babel-preset-env"
    },
  },
}));

test("patch", makeTest("-j -P", {
  dependencies: {
    "gulp-sourcemaps": {
      old: "2.0.0",
      new: "2.0.1",
      info: "https://github.com/floridoo/gulp-sourcemaps",
    },
    "svgstore": {
      old: "^3.0.0",
      new: "^3.0.0-2",
      info: "https://github.com/svgstore/svgstore",
    },
    "html-webpack-plugin": {
      old: "4.0.0-alpha.2",
      new: "4.0.0-beta.11",
      info: "https://github.com/jantimon/html-webpack-plugin",
    },
    "noty": {
      old: "3.1.0",
      new: "3.1.4",
      info: "https://github.com/needim/noty",
    },
    "updates": {
      old: "6941e05",
      new: "537ccb7",
      info: "https://github.com/silverwind/updates",
    },
  },
}));

test("include version deps", makeTest("-j -i noty", {
  dependencies: {
    "noty": {
      old: "3.1.0",
      new: "3.2.0-beta",
      info: "https://github.com/needim/noty",
    },
  },
}));

test("include version deps #2", makeTest("-j -i noty -i noty,noty", {
  dependencies: {
    "noty": {
      old: "3.1.0",
      new: "3.2.0-beta",
      info: "https://github.com/needim/noty",
    },
  },
}));

test("exclude version deps", makeTest("-j -e gulp-sourcemaps,prismjs,svgstore,html-webpack-plugin,noty,jpeg-buffer-orientation,styled-components,@babel/preset-env", {
  dependencies: {
    "updates": {
      old: "6941e05",
      new: "537ccb7",
      info: "https://github.com/silverwind/updates",
    },
  },
}));
