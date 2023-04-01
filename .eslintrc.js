module.exports = {
    root: true,
    extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
    parser: "@typescript-eslint/parser",
    parserOptions: {
        project: './tsconfig.json',
        ecmaVersion: 2021,
        sourceType: "module",
        
    },
    plugins: [
        "@typescript-eslint"
    ],
    rules: {
        "@typescript-eslint/naming-convention": "warn",
        "@typescript-eslint/semi": "warn",
        "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
        "@typescript-eslint/no-non-null-assertion": ["off"],
        strict: ["error"]
    },
    ignorePatterns: [".eslintrc.js"]
}
