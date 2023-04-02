# Frame-Indent-Rainbow

## A simple extension to make indentation more readable

This extension colorizes the frames around indented text, alternating different
colors on each step. It is a reworked version of [oderwat](https://github.com/oderwat)'s
[indent-rainbow](https://marketplace.visualstudio.com/items?itemName=oderwat.indent-rainbow).

Works both with standalone Visual Studio Code as well as vscode-web
(github.dev).

![Example](https://raw.githubusercontent.com/firejump/vscode-frame-rainbow/master/assets/example.png)

Get it here: [Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=firejump.frame-indent-rainbow)

It uses the current editor window tab size. In addition, it visibly marks lines
where the indentation is not a multiple of the tab size, or tabs are mixed with
spaces. The visualization can help to find problems with the indentation in some
situations.

### Configuration

Although you can use it as it is, there is the possibility to configure some aspects of the extension:

```js
  // For which languages indent-rainbow should be activated (if empty it means all).
  "frameIndentRainbow.includedLanguages": [] // for example ["nim", "nims", "python"]

  // For which languages indent-rainbow should be deactivated (if empty it means none).
  "frameIndentRainbow.excludedLanguages": ["plaintext"]

  // The delay in ms until the editor gets updated.
  "frameIndentRainbow.updateDelay": 100 // 10 makes it super fast but may cost more resources
```

_Note: Defining both `includedLanguages` and `excludedLanguages` does not make much sense. Please use just one!_

You can configure your own colors by adding and tampering with the following code:

```js
  "frameIndentRainbow.colors": [
    "rgba(255,255,64,0.07)",
    "rgba(127,255,127,0.07)",
    "rgba(255,127,255,0.07)",
    "rgba(79,236,236,0.07)"
  ]
```

### Hiding error highlighting

Skip error highlighting for RegEx patterns. For example, you may want to turnoff the indent errors for JSDoc's valid additional space (disabled by default), or comment lines beginning with `//`

```js
  // Example of regular expression in JSON (note double backslash to escape characters)
  "frameIndentRainbow.ignoreLinePatterns" : [
    "/[ \t]* [*]/g", // lines begining with <whitespace><space>*
    "/[ \t]+[/]{2}/g" // lines begininning with <whitespace>//
  ]
```

Skip error highlighting for some or all languages. For example, you may want to turn off the indent errors for `markdown` and `haskell` (which is the default)

```js
  "frameIndentRainbow.ignoreErrorLanguages" : [
    "markdown",
    "haskell"
  ]
```

Build with:

```
npm install
npm run vscode:prepublish
```
