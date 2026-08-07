/**
 * Public entrypoint for the shared UX-state package.
 *
 * Consumers that need a narrower surface can continue using the `state` and
 * `scenes` subpath exports, while tooling and package metadata have a stable
 * root module to resolve.
 */
export * from './state';
export * from './scenes';
