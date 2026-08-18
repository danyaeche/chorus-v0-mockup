// Side-effect CSS imports. A Vite app that already references `vite/client`
// types has this covered — it is declared here so the port typechecks on its
// own, and is harmless if duplicated.

declare module '*.css' {
  const content: string
  export default content
}
