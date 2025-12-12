/// <reference types="vite/client" />

// Allow importing CSS as string with ?inline suffix
declare module '*.css?inline' {
  const css: string;
  export default css;
}

// Allow importing CSS normally
declare module '*.css' {
  const css: string;
  export default css;
}

