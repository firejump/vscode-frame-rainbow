import * as vscode from 'vscode';
import { getConfig, Config } from './config';

interface DecorationTypes {
  /** Outer frame decoration - applied to initial whitespace on the line.
   * One decoration per configured frame color. */
  outerFrame: vscode.TextEditorDecorationType[];
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
    outerFrame: [],
    innerFrame: [],
    error: vscode.window.createTextEditorDecorationType({
      textDecoration: "wavy underline var(--vscode-editorWarning-foreground)",
      
    }),
    tabmix: vscode.window.createTextEditorDecorationType({
      textDecoration: "wavy underline var(--vscode-editorWarning-foreground)",
    }),
  };

  config.colors.forEach((color, index) => {
    decorationTypes.outerFrame[index] = vscode.window.createTextEditorDecorationType({
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

function getWhitespaceLengthInSpaces(input: string, tabSize: number): number {
  // TODO: this is a naive implementation, it doesn't take into account that
  // effective tab size changes if it is placed after a number of spaces that is not
  // a multiple of tabSize.
  let length = 0;
  for (const char of input) {
    length += char === '\t' ? tabSize : 1;
  }
  return length;
}

/**
 * Returns a Set of line numbers corresponding to lines that match at least one of the specified RegExps.
 */
function getLinesMatchingRegExps(document: vscode.TextDocument, regExps: RegExp[]): Set<number> {
  const set = new Set<number>();
  regExps.forEach(pattern => {
    let match;
    while ((match = pattern.exec(document.getText()))) {
      const pos = document.positionAt(match.index);
      const line = document.lineAt(pos).lineNumber;
      set.add(line);
    }
  });
  return set;
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

class DecorationsBuilder {
  outerFrame: vscode.DecorationOptions[][];
  innerFrame: vscode.DecorationOptions[][];
  error: vscode.DecorationOptions[] = [];
  tabmix: vscode.DecorationOptions[] = [];
  private decorationTypes: DecorationTypes;

  constructor(decorationTypes: DecorationTypes) {
    this.decorationTypes = decorationTypes;
    this.outerFrame = decorationTypes.outerFrame.map((_) => []);
    this.innerFrame = decorationTypes.innerFrame.map((_) => []);
  }

  apply = (editor: vscode.TextEditor): void => {
    this.decorationTypes.outerFrame.forEach((decorationType, index) => {
      editor.setDecorations(decorationType, this.outerFrame[index]);
    });
    this.decorationTypes.innerFrame.forEach((decorationType, index) => {
      editor.setDecorations(decorationType, this.innerFrame[index]);
    });
    editor.setDecorations(this.decorationTypes.error, this.error);
    editor.setDecorations(this.decorationTypes.tabmix, this.tabmix);
  };
}

class LineDecorationContext {
  private builder: DecorationsBuilder;
  private text: string;
  private longestLineLength: number;
  private editor: vscode.TextEditor;
  private matchStartPos: vscode.Position;
  private matchEndIndex: number;
  private matchEndPos: vscode.Position;
  private line: vscode.TextLine;
  private whitespaceMatch: string;
  private skipErrors: boolean;
  private tabSize: number;

  constructor(
    builder: DecorationsBuilder,
    text: string,
    longestLineLength: number,
    editor: vscode.TextEditor,
    matchArray: RegExpExecArray,
    skipAllErrors: boolean,
    ignoreErrorsOnLines: Set<number>) {
    this.builder = builder;
    this.text = text;
    this.longestLineLength = longestLineLength;
    this.editor = editor;
    this.whitespaceMatch = matchArray[0];
    this.matchStartPos = editor.document.positionAt(matchArray.index);
    this.matchEndIndex = matchArray.index + this.whitespaceMatch.length;
    this.matchEndPos = editor.document.positionAt(this.matchEndIndex);
    this.line = editor.document.lineAt(this.matchStartPos);
    this.skipErrors = skipAllErrors || ignoreErrorsOnLines.has(this.line.lineNumber);
    this.tabSize = getTabSize(editor);
  }

  decorate = (): void => {
    let errorsFound = false;
    if (!this.skipErrors) {
      errorsFound =
        this.decorateTabmix() ||
        this.decorateError();
    }
    if (!errorsFound) {
      this.decorateOuterFrames();
      this.decorateInnerFrame();
    }
  };

  /** Returns true iff any tabmix decoration was added. */
  private decorateTabmix = (): boolean => {
    const space = {
      name: "space",
      char: " "
    };
    const tab = {
      name: "tab",
      char: "	"
    };
    const indentInSpaces : boolean = this.editor.options.insertSpaces as boolean;

    const expectedIndent = indentInSpaces ? space : tab;
    const unexpectedIndent = indentInSpaces ? tab : space;
    let errorsFound = false;
    if (this.whitespaceMatch.includes(unexpectedIndent.char)) {
      const hoverMessage = `Unexpected ${unexpectedIndent.name} in ${expectedIndent.name}-indented file`;
      let pos = 0;
      for (;;) {
        const indexOfUnexpected = this.whitespaceMatch.indexOf(unexpectedIndent.char, pos);
        if (indexOfUnexpected === -1) {
          break;
        }
        this.builder.tabmix.push({
          range: new vscode.Range(
            this.matchStartPos.translate(0, indexOfUnexpected),
            this.matchStartPos.translate(0, indexOfUnexpected + 1)),
          hoverMessage: hoverMessage});
        pos = indexOfUnexpected + 1;
      }
      errorsFound = true;
    }
    return errorsFound;
  };

  private decorateError = (): boolean => {
    const whitespaceLengthInSpaces = getWhitespaceLengthInSpaces(this.whitespaceMatch, this.tabSize);

    let errorsFound = false;
    if (whitespaceLengthInSpaces % this.tabSize !== 0) {
      this.builder.error.push({
        range: new vscode.Range(this.matchStartPos, this.matchEndPos),
        hoverMessage: `Unexpected indent length: ${whitespaceLengthInSpaces} is not divisible by tab size (${this.tabSize})`});
      errorsFound = true;
    }
    return errorsFound;
  };

  private decorateOuterFrames = () => {
    let tabDepth = 0;
    let nextCharIndex = 0;
    while (nextCharIndex < this.whitespaceMatch.length) {
      const frameStartPos = this.matchStartPos.translate(0, nextCharIndex);
      if (this.whitespaceMatch[nextCharIndex] === "\t") {
        nextCharIndex++;
      } else {
        nextCharIndex = Math.min(nextCharIndex + this.tabSize, this.whitespaceMatch.length);
      }
      if (tabDepth == 0) {
        // Skip decorating outermost frame, this leaves the background editor color intact.
        tabDepth++;
        continue;
      }
      const endPos = this.matchStartPos.translate(0, nextCharIndex);
      
      const decoratorIndex = (tabDepth - 1) % this.builder.outerFrame.length;
      this.builder.outerFrame[decoratorIndex].push({range: new vscode.Range(frameStartPos, endPos)});

      tabDepth++;
    }
  };

  private decorateInnerFrame = () => {
    const tabDepth = Math.floor(getWhitespaceLengthInSpaces(this.whitespaceMatch, this.tabSize) / this.tabSize);
    if (tabDepth == 0) {
      // Zero tab depth frame gets no decoration, only default editor background.
      return;
    }

    let endlineIndex = this.text.indexOf("\n", this.matchEndIndex);
    if (endlineIndex === -1) {
      endlineIndex = this.text.length;
    }
    const startPos = this.editor.document.positionAt(this.matchEndIndex);
    const endPos = this.editor.document.positionAt(endlineIndex);
    const endOfLineDecorationLength = this.longestLineLength - this.line.text.length;
    const decoratorIndex = (tabDepth - 1) % this.builder.innerFrame.length;
    const decoration : vscode.DecorationOptions = {
      range: new vscode.Range(startPos, endPos),
      renderOptions: {
        after: {
          width: endOfLineDecorationLength + "ch"
        }
      }
    };
    this.builder.innerFrame[decoratorIndex].push(decoration);
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
    const allDecorationTypes: vscode.TextEditorDecorationType[] = [
      ...this.decorationTypes.outerFrame,
      ...this.decorationTypes.innerFrame,
      this.decorationTypes.error,
      this.decorationTypes.tabmix
    ];
    for (const decorationType of allDecorationTypes) {
      editor.setDecorations(decorationType, []);
    }
    this.dirtyDecorations = false;
  }

  private updateDecorations = (editor: vscode.TextEditor, skipAllErrors: boolean) => () => {
    // TODO: decorate only visible ranges
    const initialWhitespaceRegExp = /^[\t ]+/gm;
    const text = editor.document.getText();  
    const longestLineLength = getLongestLineLength(editor.document);
    const builder = new DecorationsBuilder(this.decorationTypes);

    const ignoreErrorsOnLines = skipAllErrors ?
        new Set<number>() :
        getLinesMatchingRegExps(editor.document, this.ignoreErrorsOnLinesRegExps);

    let matchArray;
    while ((matchArray = initialWhitespaceRegExp.exec(text))) {
      const context = new LineDecorationContext(builder, text, longestLineLength, editor, matchArray, skipAllErrors, ignoreErrorsOnLines);
      context.decorate();
    }

    builder.apply(editor);
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
