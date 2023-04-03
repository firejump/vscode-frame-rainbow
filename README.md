# Frame-Indent-Rainbow

## A simple extension to make indentation more readable

This extension colorizes the frames around indented text, alternating different
colors on each step. It is a reworked version of [oderwat](https://github.com/oderwat)'s
[indent-rainbow](https://marketplace.visualstudio.com/items?itemName=oderwat.indent-rainbow).

Works both with standalone Visual Studio Code as well as vscode-web
(github.dev). Get it here:
[Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=firejump.frame-indent-rainbow)

![Example](https://github.com/firejump/vscode-frame-rainbow/blob/master/assets/example.png?raw=true)

It uses the current editor window tab size. In addition, it visibly marks lines
where the indentation is not a multiple of the tab size, or tabs are mixed with
spaces. The visualization can help to find problems with the indentation in some
situations.

## Configuration

Although you can use it as it is, there is a possibility to configure some aspects of the extension.
You can add the following setting overrides to your local `settings.json` file.
The simplest way to do this is via extension settings:

![Settings](https://github.com/firejump/vscode-frame-rainbow/blob/master/assets/extension_settings_1.png?raw=true)
![Settings](https://github.com/firejump/vscode-frame-rainbow/blob/master/assets/extension_settings_2.png?raw=true)

```js
  // For which languages frame-indent-rainbow should be activated (if empty it means all).
  "frameIndentRainbow.includedLanguages": [] // for example ["nim", "nims", "python"]

  // For which languages frame-indent-rainbow should be deactivated (if empty it means none).
  "frameIndentRainbow.excludedLanguages": ["plaintext"]

  // The delay in ms until the editor gets updated.
  "frameIndentRainbow.updateDelay": 100 // 10 makes it super fast but will cost more CPU
```

_Note: Defining both `includedLanguages` and `excludedLanguages` does not make much sense. Please use just one!_

You can configure your own colors by adding and tampering with the following code:

```js
  "frameIndentRainbow.colors": [
    "hsla(312, 70%, 50%, 0.2)",
    "hsla(250, 70%, 50%, 0.2)",
    "hsla(191, 70%, 50%, 0.2)",
    "hsla( 20, 70%, 50%, 0.2)",
  ]
```

You can also use colors in RGBA format (`rgba(255,255,64,0.2)`), hex with
alpha (`#0080FF80`), or anything else that is supported by CSS. I recommend
using brighter colors, and then decreasing perceived brightness via alpha
(opacity) around 0.2. With larger opacity values you might find that the
text selection color is hard to distinguish.

### Hiding error highlighting

By default, this extension highlights the following types of indentation errors:

- tabs mixed with spaces
- indent width is not a multiply of tab size

In some cases indentation that breaks these rules is not an error. You can
define regular expressions that instruct the extension to hide error hightlights
for matching lines. By default, errors are hidden for lines with JavaDoc/JSdoc
and `//`-style comments.

```js
  // Example of regular expression in JSON (note double backslash to escape characters)
  "frameIndentRainbow.ignoreLinePatterns" : [
    "/[ \t]* [*]/g",  // lines begining with <whitespace><space>*
    "/[ \t]+[/]{2}/g" // lines begininning with <whitespace>//
  ]
```

Skip error highlighting for some or all languages. For example, you may want to
turn the indent errors off for `markdown` and `haskell` (which is the default):

```js
  "frameIndentRainbow.ignoreErrorLanguages" : [
    "markdown",
    "haskell"
  ]
```

## Development

Build the extension with:

```
npm install
npm run vscode:prepublish
```
