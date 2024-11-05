// eslint.config.js
module.exports = [
    {
        rules: {
            //"array-bracket-spacing": ["never"], // old: warn + never (now invalid)
            "brace-style": "warn",
            camelcase: ["warn", { properties: "never" }],
            "comma-dangle": ["warn", "always-multiline"],
            "comma-spacing": ["warn", { before: false, after: true }],
            curly: ["warn"],
            "eol-last": ["error"],
            eqeqeq: ["warn", "smart"],
            indent: ["off", 4, { SwitchCase: 1 }],
            "key-spacing": ["warn"],
            "keyword-spacing": ["warn"],
            "linebreak-style": ["error", "unix"],
            "no-console": ["warn", { allow: ["warn", "error"] }],
            "no-empty": ["warn"],
            "no-multi-spaces": ["warn"],
            "no-redeclare": ["warn"],
            "no-unused-vars": ["warn", { args: "none" }],
            "no-use-before-define": ["warn", "nofunc"],
            // "object-curly-spacing": ["warn", "never"],
            quotes: ["off", "double"],
            semi: ["error", "always"],
            "semi-spacing": ["warn", { before: false, after: true }],
            "space-before-blocks": ["warn"],
            "space-before-function-paren": [
                "warn",
                { anonymous: "always", named: "never" },
            ],
            "space-infix-ops": ["warn"],
            "space-in-parens": ["warn", "never"],
        },
    },
];
