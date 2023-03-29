import * as vscode from 'vscode';

interface Config {
    colors : string[];
    errorColor : string;
    tabmixColor : string;
    ignoreLinePatterns : string[];
    ignoreErrorLanguages : string[];
    includedLanguages : string[];
    excludedLanguages : string[];
};

export function getConfig() : Config {
    const userConfig = vscode.workspace.getConfiguration('indentRainbow');
    return {
        colors: userConfig['colors'] || [
          "rgba(255,0,0,0.15)",
          "rgba(0,255,0,0.15)",
          "rgba(0,0,255,0.15)",
          "rgba(127,127,127,0.15)"
        ],
        errorColor : userConfig['errorColor'] || "rgba(128,32,32,0.3)",
        tabmixColor : userConfig['tabmixColor'],
        ignoreLinePatterns: userConfig['ignoreLinePatterns'] || [],
        ignoreErrorLanguages: userConfig['ignoreErrorLanguages'] || [],
        includedLanguages: userConfig['includedLanguages'] || [],
        excludedLanguages: userConfig['excludedLanguages'] || [],
    };
}