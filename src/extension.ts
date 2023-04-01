import * as vscode from 'vscode';
import { getConfig, Config } from './config';

interface DecorationTypes {
  /** Outer frame decoration - applied to initial whitespace on the line.
   * One decoration per configured frame color. */
  frame: vscode.TextEditorDecorationType[];
  /** Innermost frame decoration - applied to code after initial whitespace and the area after the line ends.
   * One decoration per configured frame color. */
  innerFrame: vscode.TextEditorDecorationType[];
  /** This color is shown when the indent doesn't match the tab stop (e.g. 3 space indent with 2 space tab stop) */
  error: vscode.TextEditorDecorationType;
  /** This color is shown when both tabs and spaces are present at the beginning of the line */
  tabmix: vscode.TextEditorDecorationType;
}

function buildDecorationTypes(config: Config): DecorationTypes {
  const decorationTypes : DecorationTypes = {
    frame: [],
    innerFrame: [],
    error: vscode.window.createTextEditorDecorationType({
      textDecoration: "wavy underline var(--vscode-editorWarning-foreground)",
      
    }),
    tabmix: vscode.window.createTextEditorDecorationType({
      textDecoration: "wavy underline var(--vscode-editorWarning-foreground)",
    }),
  };

  config.colors.forEach((color, index) => {
    decorationTypes.frame[index] = vscode.window.createTextEditorDecorationType({
      backgroundColor: color,
    });
    decorationTypes.innerFrame[index] = vscode.window.createTextEditorDecorationType({
      backgroundColor: color,
      after: {
        // We need a single invisible character in the 'after' area to expand the div height.
        contentText: "‎",
        backgroundColor: color,
        height: "100%"
      }
    });
  });

  return decorationTypes;
}

function buildIgnoreErrorsOnLinesRegExps(config: Config) {
  return config.ignoreLinePatterns.map((ignorePattern) => {
    // parse the string for a regex
    const regParts = ignorePattern.match(/^\/(.*?)\/([gim]*)$/);
    if (regParts) {
      // the parsed pattern had delimiters and modifiers. handle them.
      return new RegExp(regParts[1], regParts[2]);
    } else {
      // we got pattern string without delimiters
      return new RegExp(ignorePattern);
    }
  });
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
  if (!tabSizeRaw || typeof tabSizeRaw === "string") {
    // Shouldn't happen according to vs code documentation, but let's fall back just in case
    return 4;
  }
  return tabSizeRaw;
}

function replaceTabsWithSpaces(input : string, tabSize : number) : string {
  // TODO: this is a naive implementation, it doesn't take into account that
  // effective tab size changes if it is placed after a number of spaces that is not
  // a multiple of tabSize.
  const tabInSpaces = " ".repeat(tabSize);
  return input.replaceAll("\t", tabInSpaces);
}

type LanguageProperties = {
  skipAllErrors: boolean;
  shouldDecorate: boolean;
};

class LanguagePropertiesCache {
  private config : Config;
  private cache = new Map<string, LanguageProperties>();

  constructor(config: Config) {
    this.config = config;
  }

  getForLanguage = (languageId: string): LanguageProperties => {
    const cachedProperties = this.cache.get(languageId);
    if (cachedProperties) {
      return cachedProperties;
    } else {
      const properties = this.getForNewLanguage(languageId);
      this.cache.set(languageId, properties);
      return properties;
    }
  };

  private getForNewLanguage = (languageId: string) => {
    const properties : LanguageProperties = {
      skipAllErrors: this.shouldSkipErrorsForLanguage(languageId),
      shouldDecorate: this.shouldDecorateLanguage(languageId)
    };
    return properties;
  };

  private shouldSkipErrorsForLanguage = (languageId : string) => {
    let skipAllErrors = false;
    if(this.config.ignoreErrorLanguages.length) {
      const allAndCurrentLang = languageId ? ['*', languageId] : ['*'];
      skipAllErrors = allAndCurrentLang.some(lang => this.config.ignoreErrorLanguages.includes(lang)); 
    }
    return skipAllErrors;
  };

  private shouldDecorateLanguage = (languageId : string) => {
    let shouldDecorate = true;
    if (this.config.includedLanguages.length !== 0) {
      if (!this.config.includedLanguages.includes(languageId)) {
        shouldDecorate = false;
      }
    }

    if (shouldDecorate && this.config.excludedLanguages.length !== 0) {
      if (this.config.excludedLanguages.includes(languageId)) {
        shouldDecorate = false;
      }
    }
    return shouldDecorate;
  };
}

class FrameRainbow {
  private config: Config;
  private languagePropertiesCache: LanguagePropertiesCache;
  private decorationTypes: DecorationTypes;
  private activeEditor: vscode.TextEditor | null | undefined;
  private dirtyDecorations = false;
  private ignoreErrorsOnLinesRegExps: RegExp[];
  private updateTimeout : NodeJS.Timeout | null = null;

  constructor(config: Config) {
    this.config = config;
    this.decorationTypes = buildDecorationTypes(config);
    this.ignoreErrorsOnLinesRegExps = buildIgnoreErrorsOnLinesRegExps(config);
    this.languagePropertiesCache = new LanguagePropertiesCache(config);
  }

  setActiveEditor = (editor: vscode.TextEditor | undefined) => {
    this.activeEditor = editor;
    this.maybeUpdateDecorations();
  };

  maybeUpdateDecorations = () => {
    if (this.activeEditor) {
      const languageProperties =
        this.languagePropertiesCache.getForLanguage(this.activeEditor.document.languageId);

      if (this.dirtyDecorations && !languageProperties.shouldDecorate) {
        this.clearDecorations(this.activeEditor);
      }

      if (languageProperties.shouldDecorate) {
        if (this.updateTimeout) {
          clearTimeout(this.updateTimeout);
        }
        this.updateTimeout = setTimeout(
          this.updateDecorations(this.activeEditor, languageProperties.skipAllErrors),
          this.config.updateDelayMs);
      }
    }
  };

  private clearDecorations(editor: vscode.TextEditor) {
    const emptyDecorationOptions: vscode.DecorationOptions[] = [];
    const allDecorationTypes: vscode.TextEditorDecorationType[] = [
      ...this.decorationTypes.frame,
      ...this.decorationTypes.innerFrame,
      this.decorationTypes.error
    ];
    if (this.decorationTypes.tabmix) {
      allDecorationTypes.push(this.decorationTypes.tabmix);
    }
    for (const decorationType of allDecorationTypes) {
      editor.setDecorations(decorationType, emptyDecorationOptions);
    }
    this.dirtyDecorations = false;
  }

  /** Returns true iff any tabmix decoration was added. */
  private decorateTabmix = (
    editor: vscode.TextEditor,
    whitespaceMatch: string,
    matchStartPos: vscode.Position): boolean => {
    const space = {
      name: "space",
      char: " "
    };
    const tab = {
      name: "tab",
      char: "	"
    };
    const decorationOptions: vscode.DecorationOptions[] = [];
    const indentInSpaces : boolean = editor.options.insertSpaces as boolean;

    const expectedIndent = indentInSpaces ? space : tab;
    const unexpectedIndent = indentInSpaces ? tab : space;
    let errorsFound = false;
    if (whitespaceMatch.includes(unexpectedIndent.char)) {
      const hoverMessage = `Unexpected ${unexpectedIndent.name} in ${expectedIndent.name}-indented file`;
      let pos = 0;
      for (;;) {
        const indexOfUnexpected = whitespaceMatch.indexOf(unexpectedIndent.char, pos);
        if (indexOfUnexpected === -1) {
          break;
        }
        decorationOptions.push({
          range: new vscode.Range(
            matchStartPos.translate(0, indexOfUnexpected),
            matchStartPos.translate(0, indexOfUnexpected + 1)),
          hoverMessage: hoverMessage});
        pos = indexOfUnexpected + 1;
      }
      errorsFound = true;
    }

    editor.setDecorations(this.decorationTypes.tabmix, decorationOptions);
    return errorsFound;
  };

  private decorateError = (
    editor: vscode.TextEditor,
    whitespaceMatch: string,
    matchStartPos: vscode.Position,
    matchEndPos: vscode.Position): boolean => {
    const tabSize = getTabSize(editor);
    const whitespaceLengthInSpaces = replaceTabsWithSpaces(whitespaceMatch, tabSize).length;
    const decorationOptions: vscode.DecorationOptions[] = [];

    let errorsFound = false;
    if (whitespaceLengthInSpaces % tabSize !== 0) {
      decorationOptions.push({
        range: new vscode.Range(matchStartPos, matchEndPos),
        hoverMessage: `Unexpected indent length: ${whitespaceLengthInSpaces} is not divisible by tab size (${tabSize})`});
      errorsFound = true;
    }
    editor.setDecorations(this.decorationTypes.error, decorationOptions);
    return errorsFound;
  };

  private decorateOuterFrames = (
    editor: vscode.TextEditor,
    whitespaceMatch: string,
    matchStartPos: vscode.Position): number => {
    const tabSize = getTabSize(editor);

    const decorationOptions: vscode.DecorationOptions[][] =
      this.decorationTypes.frame.map((_) => []);
    let tabDepth = 0;
    let nextCharIndex = 0;
    while (nextCharIndex < whitespaceMatch.length) {
      const frameStartPos = matchStartPos.translate(0, nextCharIndex);
      if (whitespaceMatch[nextCharIndex] === "\t") {
        nextCharIndex++;
      } else {
        nextCharIndex = Math.min(nextCharIndex + tabSize, whitespaceMatch.length);
      }
      if (tabDepth == 0) {
        // Skip decorating outermost frame, this leaves the background editor color intact.
        tabDepth++;
        continue;
      }
      const endPos = matchStartPos.translate(0, nextCharIndex);
      
      const decoratorIndex = (tabDepth - 1) % decorationOptions.length;
      decorationOptions[decoratorIndex].push({range: new vscode.Range(frameStartPos, endPos)});

      tabDepth++;
    }

    this.decorationTypes.frame.forEach((decorationType, index) => {
      editor.setDecorations(decorationType, decorationOptions[index]);
    });

    return tabDepth;
  };

  private decorateInnerFrame = (
    editor: vscode.TextEditor,
    text: string,
    firstCharPastTabsIndex: number,
    tabDepth: number,
    line: vscode.TextLine,
    longestLineLength: number) => {
    const decorationOptions : vscode.DecorationOptions[][] =
      this.decorationTypes.innerFrame.map((_) => []);
    let endlineIndex = text.indexOf("\n", firstCharPastTabsIndex);
    if (endlineIndex === -1) {
      endlineIndex = text.length;
    }
    if (firstCharPastTabsIndex < endlineIndex) {
      const startPos = editor.document.positionAt(firstCharPastTabsIndex);
      const endPos = editor.document.positionAt(endlineIndex);
      const endOfLineDecorationLength = longestLineLength - line.text.length;
      const decoratorIndex = (tabDepth - 1) % decorationOptions.length;
      const decoration : vscode.DecorationOptions = {
        range: new vscode.Range(startPos, endPos),
        renderOptions: {
          after: {
            width: endOfLineDecorationLength + "ch"
          }
        }
      };
      decorationOptions[decoratorIndex].push(decoration);
    }

    this.decorationTypes.innerFrame.forEach((decorationType, index) => {
      editor.setDecorations(decorationType, decorationOptions[index]);
    });
  };

  private updateDecorations = (editor: vscode.TextEditor, skipAllErrors: boolean) => () => {
    // TODO only visible ranges
    const initialWhitespaceRegExp = /^[\t ]+/gm;
    const text = editor.document.getText();  
    const ignoreErrorsOnLines : number[] = [];
    const longestLineLength = getLongestLineLength(editor.document);

    if (!skipAllErrors) {
      // Determine which lines to ignore the errors on
      this.ignoreErrorsOnLinesRegExps.forEach(ignorePattern => {
        let ignore;
        while ((ignore = ignorePattern.exec(text))) {
          const pos = editor.document.positionAt(ignore.index);
          const line = editor.document.lineAt(pos).lineNumber;
          ignoreErrorsOnLines.push(line);
        }
      });
    }

    let matchArray;
    while ((matchArray = initialWhitespaceRegExp.exec(text))) {
      const matchStartPos = editor.document.positionAt(matchArray.index);
      const matchEndIndex = matchArray.index + matchArray[0].length;
      const matchEndPos = editor.document.positionAt(matchEndIndex);

      const line = editor.document.lineAt(matchStartPos);
      const skipErrors = skipAllErrors || ignoreErrorsOnLines.includes(line.lineNumber);
      const whitespaceMatch: string = matchArray[0];

      let errorsFound = false;
      if (!skipErrors) {
        // TODO BUG: return pairs of info on how to decorate, decorate outside of the loop.
        errorsFound =
          this.decorateTabmix(editor, whitespaceMatch, matchStartPos) ||
          this.decorateError(editor, whitespaceMatch, matchStartPos, matchEndPos);
      }
      if (!errorsFound) {
        const tabDepth = this.decorateOuterFrames(editor, whitespaceMatch, matchStartPos);
        this.decorateInnerFrame(editor, text, matchEndIndex, tabDepth, line, longestLineLength);
      }
    }
    this.dirtyDecorations = true;
  };
}

export function activate(context: vscode.ExtensionContext) : void {
  const config = getConfig();
  const frameRainbow = new FrameRainbow(config);

  frameRainbow.setActiveEditor(vscode.window.activeTextEditor);

  vscode.window.onDidChangeActiveTextEditor(editor => {
    frameRainbow.setActiveEditor(editor);
  }, null, context.subscriptions);

  vscode.workspace.onDidChangeTextDocument(event => {
    if (event.document === vscode.window.activeTextEditor?.document) {
      frameRainbow.maybeUpdateDecorations();
    }
  }, null, context.subscriptions);
  
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