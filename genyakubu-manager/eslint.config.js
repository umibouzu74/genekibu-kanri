import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

// js/jsx と ts/tsx で共有する React 系の設定 (E5e: TS 移行後も
// react-hooks / react-refresh のルールを両方の拡張子で維持する)。
const reactSettings = { react: { version: "18.3" } };
const reactPlugins = {
  react,
  "react-hooks": reactHooks,
  "react-refresh": reactRefresh,
};
const reactRules = {
  ...react.configs.recommended.rules,
  ...react.configs["jsx-runtime"].rules,
  ...reactHooks.configs.recommended.rules,
  "react-refresh/only-export-components": [
    "warn",
    { allowConstantExport: true },
  ],
  "react/prop-types": "off",
  "no-empty": ["error", { allowEmptyCatch: true }],
  "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
};

export default [
  { ignores: ["dist", "node_modules"] },
  js.configs.recommended,
  {
    // ルート直下の設定ファイルは Node で実行される (process 等を使う)
    files: ["*.config.js"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: reactSettings,
    plugins: reactPlugins,
    rules: reactRules,
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: reactSettings,
    plugins: { ...reactPlugins, "@typescript-eslint": tsPlugin },
    rules: {
      ...reactRules,
      // 未定義識別子の検出は tsc の仕事 (TS の型構文に no-undef が誤反応する)
      "no-undef": "off",
      // 素の no-unused-vars は関数型シグネチャの引数名 ((key: string) => ...)
      // に誤反応するため TS 対応版に置き換える
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  prettier,
];
