# updates
[![](https://img.shields.io/npm/v/updates.svg?style=flat)](https://www.npmjs.org/package/updates) [![](https://img.shields.io/npm/dm/updates.svg)](https://www.npmjs.org/package/updates) [![](https://api.travis-ci.org/silverwind/updates.svg?style=flat)](https://travis-ci.org/silverwind/updates)
> flexible npm dependency update tool

`updates` is a CLI tool which checks for npm dependency updates of the current project and optionally updates `package.json`. It is highly configurable and is typically able to complete in less than a second.

<p align="center">
  <img src="https://i.imgur.com/tI7rp0g.png"/>
</p>

## Usage

```console
$ npm i -g updates
```

Then, check for new updates:
```console
$ updates
```

When changes are satisfactory, update `package.json` and re-install modules:
```console
$ updates -u && rm -rf node_modules && yarn
```

## Options

See `--help` or below for the available options. Option that take multiple arguments can take them either via comma-separated value or by specifying the option multiple times. If an option has a optional `pkg` argument but none is given, the option will be applied to all packages instead.

```
usage: updates [options]

  Options:
    -u, --update                  Update versions and write package.json
    -p, --prerelease [<pkg,...>]  Consider prerelease versions
    -R, --release [<pkg,...>]     Only use release versions, may downgrade
    -g, --greatest [<pkg,...>]    Prefer greatest over latest version
    -i, --include <pkg,...>       Include only given packages
    -e, --exclude <pkg,...>       Exclude given packages
    -t, --types <type,...>        Check only given dependency types
    -P, --patch [<pkg,...>]       Consider only up to semver-patch
    -m, --minor [<pkg,...>]       Consider only up to semver-minor
    -E, --error-on-outdated       Exit with error code 2 on outdated packages
    -r, --registry <url>          Use given registry URL
    -f, --file <path>             Use given package.json file or module directory
    -j, --json                    Output a JSON object
    -c, --color                   Force-enable color output
    -n, --no-color                Disable color output
    -v, --version                 Print the version
    -h, --help                    Print this help

  Examples:
    $ updates
    $ updates -u
    $ updates -u -m
    $ updates -u -e chalk
    $ updates -u -t devDependencies
```

## JSON Output

The JSON output is an object with possible properties `results`, `message` and `error`:

```console
$ updates -j | jq
{
  "results": {
    "string-width": {
      "old": "2.1.1",
      "new": "3.0.0",
      "info": "https://github.com/sindresorhus/string-width"
    },
    "eslint": {
      "old": "5.9.0",
      "new": "5.10.0",
      "info": "https://github.com/eslint/eslint"
    },
    "eslint-config-silverwind": {
      "old": "2.0.11",
      "new": "2.0.12",
      "info": "https://github.com/silverwind/eslint-config-silverwind"
    }
  }
}
```

© [silverwind](https://github.com/silverwind), distributed under BSD licence
