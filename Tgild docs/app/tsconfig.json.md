# `app/tsconfig.json` — TypeScript Config

- **Purpose**: Frontend TypeScript compiler options
- **Key settings**:
  - `target: "ES2020"`
  - `module: "ESNext"`
  - `moduleResolution: "bundler"`
  - `jsx: "react-jsx"` — React 17+ JSX transform
  - `strict: true`
  - `noUnusedLocals: true`
  - `paths: {"@/*": ["./src/*"]}` — Path alias for clean imports
  - `include: ["src"]`
  - `references: [{ path: "./tsconfig.node.json" }]`
