import stylistic from "@stylistic/eslint-plugin";

export default [
    {
        "plugins": {
            "@stylistic": stylistic,
        },
        "ignores": [
            "package.json",
            "package-lock.json",
        ],
        "rules": {
            "@stylistic/indent": ["error", 4],
            "@stylistic/semi": "error",
            "@stylistic/quotes": ["error", "double"],
            "@stylistic/comma-dangle": ["error", "always-multiline"],
            "@stylistic/object-curly-spacing": ["error", "always"],
            "@stylistic/arrow-parens": ["error", "always"],
            "@stylistic/max-len": ["error", { "code": 140 }],
            "@stylistic/linebreak-style": ["error", "unix"],
            "@stylistic/newline-per-chained-call": ["error", { "ignoreChainWithDepth": 1 }],
            "@stylistic/space-before-function-paren": ["error", "always"],
            "@stylistic/no-tabs": "error",
            "@stylistic/no-trailing-spaces": "error",
        },
    },
];
