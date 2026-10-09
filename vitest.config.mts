import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Só o necessário: o alias "@/" do tsconfig (os componentes importam por ele) e
// onde procurar testes. Todo o resto é o padrão do vitest (ambiente node).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "party/**/*.test.ts"],
  },
});
