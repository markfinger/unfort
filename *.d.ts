declare module "lodash"
declare module "bluebird"
declare module "css-selector-tokenizer"
declare module "babel-types" {
  function isLiteral(node: any): boolean
}
declare module "babel-traverse"
declare module "babel-generator"
declare module "babylon" {
  function parse(text: string, options?: any): any
}
declare module "chalk" {
  function red(text: string): string
}
declare module "babel-code-frame"
declare module "parse5" {
  function parse(text: string): any
  function serialize(ast: any): string
}
declare module "browserify/lib/builtins"
declare module "browser-resolve"