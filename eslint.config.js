import js from "@eslint/js";
import globals from "globals";
import sonarjs from "eslint-plugin-sonarjs";

export default [
    { ignores: ["node_modules/**", "reports/**"] },
    js.configs.recommended,
    {
        files: ["**/*.js"],
        languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: globals.node },
        plugins: { sonarjs },
        rules: {
            "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
            "no-eval": "error",
            "no-implied-eval": "error",
            "no-new-func": "error",
            "no-empty": "error",
            eqeqeq: ["error", "always"],
            "sonarjs/no-identical-functions": "error",
            "sonarjs/no-all-duplicated-branches": "error",
            "sonarjs/no-element-overwrite": "error",
            "sonarjs/no-gratuitous-expressions": "error",
            "sonarjs/no-use-of-empty-return-value": "error",
        },
    },
];
