/** @type {import('eslint').Rule.RuleModule} */
const noAsCasts = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow the `as` type assertion syntax.",
    },
    schema: [],
  },
  create(context) {
    return {
      TSAsExpression(node) {
        context.report({
          node,
          message: "Avoid `as` type assertions; use a type guard or narrow explicitly.",
        });
      },
    };
  },
};

/** @type {import('eslint').ESLint.Plugin} */
const plugin = {
  meta: {
    name: "bakarr",
  },
  rules: {
    "no-as-casts": noAsCasts,
  },
};

export default plugin;
