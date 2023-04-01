import * as vscode from 'vscode';

export interface Config {
    colors : string[];
    ignoreLinePatterns : string[];
    ignoreErrorLanguages : string[];
    includedLanguages : string[];
    excludedLanguages : string[];
    updateDelayMs : number;
}

export function getConfig() : Config {
    const userConfig = vscode.workspace.getConfiguration('indentRainbow');
    return {
        colors: userConfig['colors'] || [
          "rgba(255,0,0,0.15)",
          "rgba(0,255,0,0.15)",
          "rgba(0,0,255,0.15)",
          "rgba(127,127,127,0.15)"
        ],
        ignoreLinePatterns: userConfig['ignoreLinePatterns'] || [],
        ignoreErrorLanguages: userConfig['ignoreErrorLanguages'] || [],
        includedLanguages: userConfig['includedLanguages'] || [],
        excludedLanguages: userConfig['excludedLanguages'] || [],
        updateDelayMs: userConfig['updateDelay'] || 100,
    };
}