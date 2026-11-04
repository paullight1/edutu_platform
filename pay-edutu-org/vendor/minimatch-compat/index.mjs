import * as modern from 'minimatch-engine';
function compatible(api) {
  const run = typeof api === 'function' ? api : api.minimatch;
  const match = Object.assign((input, pattern, options) => run(input, pattern, options), api);
  match.minimatch = match;
  match.defaults = options => compatible(api.defaults(options));
  return match;
}
const match = compatible(modern);
export default match;
export const minimatch = match;
export const defaults = match.defaults;
export * from 'minimatch-engine';
