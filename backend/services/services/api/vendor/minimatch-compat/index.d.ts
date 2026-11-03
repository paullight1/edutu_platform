import * as modern from 'minimatch-engine';
export * from 'minimatch-engine';
type Compatible = typeof modern.minimatch & Omit<typeof modern, 'defaults' | 'minimatch'> & {
  defaults(options: modern.MinimatchOptions): Compatible;
  minimatch: Compatible;
};
declare const match: Compatible;
export default match;
export declare const minimatch: Compatible;
export declare const defaults: Compatible['defaults'];
