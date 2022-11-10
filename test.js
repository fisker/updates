import {execa} from "execa";
import restana from "restana";
import {join, dirname} from "path";
import {readFileSync, mkdtempSync} from "fs";
import {writeFile, readFile, rmdir} from "fs/promises";
import {fileURLToPath} from "url";
import {tmpdir} from "os";

const testFile = fileURLToPath(new URL("fixtures/test.json", import.meta.url));
const emptyFile = fileURLToPath(new URL("fixtures/empty.json", import.meta.url));
const testPkg = JSON.parse(readFileSync(testFile, "utf8"));
const testDir = mkdtempSync(join(tmpdir(), "updates-"));
const script = fileURLToPath(new URL("bin/updates.js", import.meta.url));

const dependencyTypes = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
  "resolutions",
];

const testPackages = new Set();
for (const dependencyType of dependencyTypes) {
  for (const name of Object.keys(testPkg[dependencyType] || [])) {
    testPackages.add(name);
  }
}

function makeUrl(server) {
  const {port} = server.address();
  return Object.assign(new URL("http://localhost"), {port}).toString();
}

function defaultRoute(req, res) {
  console.error(`default handler hit for ${req.url}`);
  res.send(404);
}

function resolutionsBasePackage(name) {
  const packages = name.match(/(@[^/]+\/)?([^/]+)/g) || [];
  return packages[packages.length - 1];
}

let npmServer, githubServer, githubUrl, npmUrl;
beforeAll(async () => {
  let commits, tags;

  [npmServer, githubServer, commits, tags] = await Promise.all([
    restana({defaultRoute}),
    restana({defaultRoute}),
    readFile(fileURLToPath(new URL("fixtures/github/updates-commits.json", import.meta.url))),
    readFile(fileURLToPath(new URL("fixtures/github/updates-tags.json", import.meta.url))),
  ]);

  for (const pkgName of testPackages) {
    const name = testPkg.resolutions[pkgName] ? resolutionsBasePackage(pkgName) : pkgName;
    const urlName = name.replace(/\//g, "%2f");
    // can not use file URLs because node stupidely throws on "%2f" in paths.
    const path = join(dirname(fileURLToPath(import.meta.url)), `fixtures/npm/${urlName}.json`);
    npmServer.get(`/${urlName}`, async (_, res) => res.send(await readFile(path)));
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
    rmdir(testDir, {recursive: true}),
    npmServer?.close(),
    githubServer?.close(),
  ]);
});

function makeTest(args, expected) {
  return async () => {
    const argsArr = [...args.split(/\s+/), "-c", "-G", githubUrl];
    const {stdout} = await execa(script, argsArr, {cwd: testDir});
    const {results} = JSON.parse(stdout);

    // Parse results, with custom validation for the dynamic "age" property
    for (const dependencyType of dependencyTypes) {
      for (const name of Object.keys(results[dependencyType] || {})) {
        delete results[dependencyType][name].age;
      }
    }

    expect(results).toEqual(expected);
  };
}

test("version", async () => {
  const {version: expected} = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8"));
  const {stdout, exitCode} = await execa("node", [script, "-v"]);
  expect(stdout).toEqual(expected);
  expect(exitCode).toEqual(0);
});

test("simple", async () => {
  const {stdout, stderr, exitCode} = await execa(script, ["-C", "-G", githubUrl, "-f", testFile]);
  expect(stderr).toEqual("");
  expect(stdout).toContain("prismjs");
  expect(stdout).toContain("https://github.com/silverwind/updates");
  expect(exitCode).toEqual(0);
});

test("empty", async () => {
  const {stdout, stderr, exitCode} = await execa(script, ["-C", "-G", githubUrl, "-f", emptyFile]);
  expect(stderr).toEqual("");
  expect(stdout).toContain("No dependencies");
  expect(exitCode).toEqual(0);
});

test("version", async () => {
  const {stdout, stderr, exitCode} = await execa(script, ["-v"]);
  expect(stderr).toEqual("");
  expect(stdout).toMatch(/^[0-9]+\.[0-9]+\.[0-9]+$/);
  expect(exitCode).toEqual(0);
});

if (process.env.CI) {
  test("global", async () => {
    await execa("npm", ["i", "-g", "."]);
    const {stdout, stderr, exitCode} = await execa("updates", ["-C", "-G", githubUrl, "-f", testFile]);
    expect(stderr).toEqual("");
    expect(stdout).toContain("prismjs");
    expect(stdout).toContain("https://github.com/silverwind/updates");
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
      new: "7.11.5",
      info: "https://github.com/babel/babel/tree/HEAD/packages/babel-preset-env",
    },
    "updates": {
      old: "6941e05",
      new: "537ccb7",
      info: "https://github.com/silverwind/updates",
    },
    "react": {
      old: "18.0.0",
      new: "18.2.0",
      info: "https://github.com/facebook/react/tree/HEAD/packages/react",
    },
  },
  peerDependencies: {
    "@babel/preset-env": {
      old: "~6.0.0",
      new: "~7.11.5",
      info: "https://github.com/babel/babel/tree/HEAD/packages/babel-preset-env",
    },
  },
  resolutions: {
    "versions/updates": {
      old: "^1.0.0",
      new: "^10.0.0",
      info: "https://github.com/silverwind/updates",
    },
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
      new: "7.11.5",
      info: "https://github.com/babel/babel/tree/HEAD/packages/babel-preset-env",
    },
    "updates": {
      old: "6941e05",
      new: "537ccb7",
      info: "https://github.com/silverwind/updates",
    },
    "react": {
      old: "18.0.0",
      new: "18.2.0",
      info: "https://github.com/facebook/react/tree/HEAD/packages/react",
    }
  },
  peerDependencies: {
    "@babel/preset-env": {
      old: "~6.0.0",
      new: "~7.11.5",
      info: "https://github.com/babel/babel/tree/HEAD/packages/babel-preset-env",
    },
  },
  resolutions: {
    "versions/updates": {
      old: "^1.0.0",
      new: "^10.0.0",
      info: "https://github.com/silverwind/updates",
    },
  },
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
      new: "7.11.5",
      info: "https://github.com/babel/babel/tree/HEAD/packages/babel-preset-env",
    },
    "updates": {
      old: "6941e05",
      new: "537ccb7",
      info: "https://github.com/silverwind/updates",
    },
    "react": {
      old: "18.0.0",
      new: "18.3.0-next-d1e35c703-20221110",
      info: "https://github.com/facebook/react/tree/HEAD/packages/react",
    }
  },
  peerDependencies: {
    "@babel/preset-env": {
      old: "~6.0.0",
      new: "~7.11.5",
      info: "https://github.com/babel/babel/tree/HEAD/packages/babel-preset-env",
    },
  },
  resolutions: {
    "versions/updates": {
      old: "^1.0.0",
      new: "^10.0.0",
      info: "https://github.com/silverwind/updates",
    },
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
      new: "7.11.5",
      info: "https://github.com/babel/babel/tree/HEAD/packages/babel-preset-env",
    },
    "updates": {
      old: "6941e05",
      new: "537ccb7",
      info: "https://github.com/silverwind/updates",
    },
    "react": {
      old: "18.0.0",
      new: "18.2.0",
      info: "https://github.com/facebook/react/tree/HEAD/packages/react",
    }
  },
  peerDependencies: {
    "@babel/preset-env": {
      old: "~6.0.0",
      new: "~7.11.5",
      info: "https://github.com/babel/babel/tree/HEAD/packages/babel-preset-env",
    },
  },
  resolutions: {
    "versions/updates": {
      old: "^1.0.0",
      new: "^10.0.0",
      info: "https://github.com/silverwind/updates",
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
  resolutions: {
    "versions/updates": {
      old: "^1.0.0",
      new: "^1.0.6",
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

test("exclude version deps", makeTest("-j -e gulp-sourcemaps,prismjs,svgstore,html-webpack-plugin,noty,jpeg-buffer-orientation,styled-components,@babel/preset-env,versions/updates,react", {
  dependencies: {
    "updates": {
      old: "6941e05",
      new: "537ccb7",
      info: "https://github.com/silverwind/updates",
    },
  },
}));
