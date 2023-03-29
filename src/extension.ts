"use strict";

import * as vscode from 'vscode';
import { getConfig } from './config';

export function activate(context: vscode.ExtensionContext) {
  // Create a decorator types that we use to decorate indent levels
  let decorationTypes : vscode.TextEditorDecorationType[] = [];
  let lastFrameDecorationTypes : vscode.TextEditorDecorationType[] = [];

  let doIt = false;
  let clearMe = false;
  let currentLanguageId : string | null = null;
  let skipAllErrors = false;

  let activeEditor = vscode.window.activeTextEditor;

  const config = getConfig();

  // Error color gets shown when tabs aren't right,
  // e.g. when you have your tabs set to 2 spaces but the indent is 3 spaces.
  const errorDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: config.errorColor
  });

  const tabmixDecorationType = config.tabmixColor ? vscode.window.createTextEditorDecorationType({
     backgroundColor: config.tabmixColor
  }) : null;

  // Loops through colors and creates decoration types for each one
  config.colors.forEach((color, index) => {
    decorationTypes[index] = vscode.window.createTextEditorDecorationType({
      backgroundColor: color,
    });
    lastFrameDecorationTypes[index] = vscode.window.createTextEditorDecorationType({
      backgroundColor: color,
      after: {
        contentText: "‎",
        backgroundColor: color,
        height: "100%"
      }
    });
  });

  // loop through ignore regex strings and convert to valid RegEx's.
  const ignoreLineRegexps : RegExp[] =
    config.ignoreLinePatterns.map((ignorePattern, index) => {
      //parse the string for a regex
      var regParts = ignorePattern.match(/^\/(.*?)\/([gim]*)$/);
      if (regParts) {
        // the parsed pattern had delimiters and modifiers. handle them.
        return new RegExp(regParts[1], regParts[2]);
      } else {
        // we got pattern string without delimiters
        return new RegExp(ignorePattern);
      }
    });

  if(activeEditor) {
    indentConfig();
  }

  if (activeEditor && checkLanguage()) {
    triggerUpdateDecorations();
  }

  vscode.window.onDidChangeActiveTextEditor(editor => {
    activeEditor = editor;
    if (editor) {
      indentConfig();
    }

    if (editor && checkLanguage()) {
      triggerUpdateDecorations();
    }
  }, null, context.subscriptions);

  vscode.workspace.onDidChangeTextDocument(event => {
    if(activeEditor) {
      indentConfig();
    }

    if (activeEditor && event.document === activeEditor.document && checkLanguage()) {
      triggerUpdateDecorations();
    }
  }, null, context.subscriptions);

  function indentConfig() {
    skipAllErrors = false;
    if(config.ignoreErrorLanguages.length) {
      const allAndCurrentLang = currentLanguageId ? ['*', currentLanguageId] : ['*'];
      skipAllErrors = allAndCurrentLang.some(lang => config.ignoreErrorLanguages.includes(lang)); 
    }
  }

  function checkLanguage() {
    if (activeEditor) {
      if(currentLanguageId !== activeEditor.document.languageId) {

        currentLanguageId = activeEditor.document.languageId;
        doIt = true;
        if(config.includedLanguages.length !== 0) {
          if(!config.includedLanguages.includes(currentLanguageId)) {
            doIt = false;
          }
        }

        if(doIt && config.excludedLanguages.length !== 0) {
          if(config.excludedLanguages.includes(currentLanguageId)) {
            doIt = false;
          }
        }
      }


      if(clearMe && ! doIt) {
        // Clear decorations when language switches away
        var decor: vscode.DecorationOptions[] = [];
        for (let decorationType of decorationTypes) {
          activeEditor.setDecorations(decorationType, decor);
        }
        for (let decorationType of lastFrameDecorationTypes) {
          activeEditor.setDecorations(decorationType, decor);
        }
        clearMe = false;
      }
    }

    indentConfig();

    return doIt;
  }

  var timeout : NodeJS.Timeout | null = null;
  function triggerUpdateDecorations() {
    if (timeout) {
      clearTimeout(timeout);
    }
    var updateDelay = vscode.workspace.getConfiguration('indentRainbow')['updateDelay'] || 100;
    timeout = setTimeout(updateDecorations, updateDelay);
  }

  function getLongestLineLength(document : vscode.TextDocument) {
    let maxLineLength = 0;
    for (let i = 0; i < document.lineCount ; i++) {
      maxLineLength = Math.max(maxLineLength, document.lineAt(i).text.length);
    }
    return maxLineLength;
  }

  function getTabSize(editor : vscode.TextEditor) : number {
    const tabSizeRaw = editor.options.tabSize;
    if (typeof tabSizeRaw === "string") {
      // Shouldn't happen according to vs code documentation, but let's fall back just in case
      return 4;
    }
    return tabSizeRaw!;
  }

  function updateDecorations() {
    if (!activeEditor) {
      return;
    }
    const regEx = /^[\t ]+/gm;
    const text = activeEditor.document.getText();

    const tabSize = getTabSize(activeEditor);
    const ignoreLines : number[] = [];

    var tabs = " ".repeat(tabSize);
    let errorDecorator: vscode.DecorationOptions[] = [];
    let tabmixDecorator: vscode.DecorationOptions[] | null = tabmixDecorationType ? []: null;
    
    const decorators : vscode.DecorationOptions[][] = decorationTypes.map((_) => []);
    const lastFrameDecorators : vscode.DecorationOptions[][] = lastFrameDecorationTypes.map((_) => []);
    
    var match;
    var ignore;

    if(!skipAllErrors) {
      /**
       * Checks text against ignore regex patterns from config(or default).
       * stores the line positions of those lines in the ignoreLines array.
       */
      ignoreLineRegexps.forEach(ignorePattern => {
        while (ignore = ignorePattern.exec(text)) {
          const pos = activeEditor!.document.positionAt(ignore.index);
          const line = activeEditor!.document.lineAt(pos).lineNumber;
          ignoreLines.push(line);
        }
      });
    }

    const longestLineLength = getLongestLineLength(activeEditor.document);

    var re = new RegExp("\t","g");
    let defaultIndentCharRegExp = null;

    while (match = regEx.exec(text)) {
      const pos = activeEditor.document.positionAt(match.index);
      const line = activeEditor.document.lineAt(pos);
      const lineNumber = line.lineNumber;
      const endOfLineDecorationLength = longestLineLength - line.text.length;

      let skip = skipAllErrors || ignoreLines.includes(lineNumber); // true if the lineNumber is in ignoreLines.
      var thematch = match[0];
      var ma = (match[0].replace(re, tabs)).length;
      /**
       * Error handling.
       * When the indent spacing (as spaces) is not divisible by the tabsize,
       * consider the indent incorrect and mark it with the error decorator.
       * Checks for lines being ignored in ignoreLines array ( `skip` Boolran)
       * before considering the line an error.
       */
      if(!skip && ma % tabSize !== 0) {
        var startPos = activeEditor.document.positionAt(match.index);
        var endPos = activeEditor.document.positionAt(match.index + match[0].length);
        var decoration : vscode.DecorationOptions = { range: new vscode.Range(startPos, endPos)};
        errorDecorator.push(decoration);
      } else {
        var m = match[0];
        var l = m.length;
        var o = 0;
        var n : number;
        if(m[0] === "\t") {
          n = 1;
        } else {
          n = Math.min(tabSize, l);
        }
        while(n < l) {
          const s = n;
          var startIndex = match.index + n;
          var startPos = activeEditor.document.positionAt(startIndex);
          if(m[n] === "\t") {
            n++;
          } else {
            n+=tabSize;
          }
          if (n > l) {
            n = l;
          }
          var endPos = activeEditor.document.positionAt(match.index + n);
          var decoration : vscode.DecorationOptions = { range: new vscode.Range(startPos, endPos)};
          var sc = 0;
          var tc = 0;
          if (!skip && tabmixDecorator) {
            // counting (split is said to be faster than match()
            // only do it if we don't already skip all errors
            tc=(thematch.split("\t").length - 1);
            if(tc) {
              // only do this if we already have some tabs
              sc=(thematch.split(" ").length - 1);
            }
            // if we have (only) "spaces" in a "tab" indent file we
            // just ignore that, because we don't know if there
            // should really be tabs or spaces for indentation
            // If you (yes you!) know how to find this out without
            // infering this from the file, speak up :)
          }
          if(tabmixDecorator && sc > 0 && tc > 0) {
            tabmixDecorator.push(decoration);
          } else {
            let decoratorIndex = o % decorators.length;
            decorators[decoratorIndex].push(decoration);
          }
          o++;
        }
        const firstCharPastTabsIndex = match.index + n;
        const endlineIndex = text.indexOf("\n", firstCharPastTabsIndex);
        var startPos = activeEditor.document.positionAt(firstCharPastTabsIndex);
        var endPos = activeEditor.document.positionAt(endlineIndex);
        let decoratorIndex = o % lastFrameDecorators.length;
        var decoration : vscode.DecorationOptions = {
          range: new vscode.Range(startPos, endPos),
          renderOptions: {
            after: {
              width: endOfLineDecorationLength + "ch"
            }
          }
        };
        lastFrameDecorators[decoratorIndex].push(decoration);
      }
    }
    decorationTypes.forEach((decorationType, index) => {
      activeEditor!.setDecorations(decorationType, decorators[index]);
    });
    lastFrameDecorationTypes.forEach((decorationType, index) => {
      activeEditor!.setDecorations(decorationType, lastFrameDecorators[index]);
    });
    activeEditor.setDecorations(errorDecorationType, errorDecorator);
    tabmixDecorationType && activeEditor.setDecorations(tabmixDecorationType, tabmixDecorator!);
    clearMe = true;
  }
  /**
   * Listen for configuration change in indentRainbow section
   * When anything changes in the section, show a prompt to reload
   * VSCode window 
  */
  vscode.workspace.onDidChangeConfiguration(configChangeEvent => {

    if (configChangeEvent.affectsConfiguration('indentRainbow')) {
      const actions = ['Reload now', 'Later'];

      vscode.window
        .showInformationMessage('The VSCode window needs to reload for the changes to take effect. Would you like to reload the window now?', ...actions)
        .then(action => {
          if (action === actions[0]) {
            vscode.commands.executeCommand('workbench.action.reloadWindow');
          }
        });
    }
	});
}
