import js from "@eslint/js";
import globals from "globals";

export default [
    {
        ignores: ["package.json", "package-lock.json"],
    },
    js.configs.recommended,
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                ...globals.node,
            },
        },
    },
    {
        files: ["tests/**/*.js"],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.jest,
            },
        },
    },
];
