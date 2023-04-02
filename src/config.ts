import * as vscode from "vscode";

export interface Config {
  colors: string[];
  ignoreLinePatterns: string[];
  ignoreErrorLanguages: string[];
  includedLanguages: string[];
  excludedLanguages: string[];
  updateDelayMs: number;
}

export function getConfig(): Config {
  const userConfig = vscode.workspace.getConfiguration("frameIndentRainbow");
  return {
    colors: userConfig["colors"] || [
      "hsla(312, 70%, 50%, 0.2)",
      "hsla(250, 70%, 50%, 0.2)",
      "hsla(191, 70%, 50%, 0.2)",
      "hsla(20, 70%, 50%, 0.2)",
    ],
    ignoreLinePatterns: userConfig["ignoreLinePatterns"] || [],
    ignoreErrorLanguages: userConfig["ignoreErrorLanguages"] || [],
    includedLanguages: userConfig["includedLanguages"] || [],
    excludedLanguages: userConfig["excludedLanguages"] || [],
    updateDelayMs: userConfig["updateDelay"] || 100,
  };
}
