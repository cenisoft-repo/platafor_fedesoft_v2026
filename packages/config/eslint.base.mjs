import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Configuración base del monorepo. Cada paquete la extiende y añade lo suyo.
 * Las reglas que están aquí son las que sostienen una regla no negociable del
 * proyecto, no preferencias de estilo.
 */
export default tseslint.config(
  { ignores: ["dist/**", ".next/**", "node_modules/**", "coverage/**", "**/*.generated.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      /* Los secretos no se registran: console deja rastro en logs de producción. */
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSNonNullExpression",
          message:
            "El '!' esconde un caso real. Verifica el valor o usa un tipo que no pueda faltar.",
        },
      ],
    },
  },
);
