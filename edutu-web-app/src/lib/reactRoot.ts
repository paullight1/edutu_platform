import {
  createRoot as createDomRoot,
  type Root,
} from "react-dom/client";

export interface ReactRootRegistry {
  __EDUTU_REACT_ROOT__?: Root;
}

declare global {
  interface Window {
    __EDUTU_REACT_ROOT__?: Root;
  }
}

export function getOrCreateReactRoot(
  registry: ReactRootRegistry,
  container: Element | DocumentFragment,
  createRoot: (container: Element | DocumentFragment) => Root = createDomRoot,
): Root {
  if (!registry.__EDUTU_REACT_ROOT__) {
    registry.__EDUTU_REACT_ROOT__ = createRoot(container);
  }

  return registry.__EDUTU_REACT_ROOT__;
}
