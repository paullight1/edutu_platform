async (page) => {
  const origin = 'http://127.0.0.1:4187';
  const compiled = await (await page.request.get(origin + '/src/features/ai-coach/CoachPage.tsx')).text();
  const version = compiled.match(/react\.js\?v=([^"']+)/)[1];
  await page.route('**/src/features/feature-access/PaidToolGate.tsx', route => route.fulfill({contentType:'text/javascript',body:'export function PaidToolGate({children}) { return children; }'}));
  await page.route('**/node_modules/.vite/deps/@clerk_clerk-react.js*', route => route.fulfill({contentType:'text/javascript',body:'export function useAuth() { return {userId:"fixture-user"}; }'}));
  await page.route('**/src/features/workspace/shared.tsx', route => route.fulfill({contentType:'text/javascript',body:`
    export const errorMessage = e => e.message;
    export function useProductSession() {return {userId:'fixture-user', token:async()=> 'fixture-token', request:window.fixtureRequest};}
  `}));
  await page.route('**/src/hooks/usePaywall.tsx', route => route.fulfill({contentType:'text/javascript',body:`
    export function usePaywall() {return {refreshBilling:async()=>{},handleUpgradeError:()=>false};}
  `}));
  await page.route('**/__edutu_core_review', route => route.fulfill({contentType:'text/html',body:`
    <!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Edutu core review fixture</title></head><body><div id="review-root"></div>
    <script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => type => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      window.fixtureRequest = async path => path === '/chat/threads' ? {threads:[{id:'review-thread',title:'Prepare an application',updated_at:'2026-10-31'}]} : {messages:[{id:'review-message',role:'assistant',content:'**Your next step**\\nConfirm the eligibility requirements before you apply.\\n\\n- Check your nationality and degree level.\\n- Prepare your transcript and a current CV.\\n- Verify the deadline on the official opportunity page.',metadata:{opportunities:[{id:'review-opportunity',title:'Research Fellowship',organization:'Example University',location:'Lagos'}]}}]};
      await import('/src/i18n/index.ts');
      await import('/src/index.css');
      await import('/src/features/workspace/workspace.css');
      const React = (await import('/node_modules/.vite/deps/react.js?v=${version}')).default;
      const {createRoot} = (await import('/node_modules/.vite/deps/react-dom_client.js?v=${version}')).default;
      const {MemoryRouter} = await import('/node_modules/.vite/deps/react-router-dom.js?v=${version}');
      const CoachSheet = (await import('/src/features/ai-coach/CoachSheet.tsx')).default;
      createRoot(document.getElementById('review-root')).render(React.createElement(MemoryRouter,null,React.createElement(CoachSheet,{returnTo:'/app/opportunities'})));
    </script></body></html>
  `}));
  await page.goto(origin + '/__edutu_core_review');
  await page.getByRole('button',{name:'Copy response'}).waitFor();
  return {fixture:true,title:await page.title(),width:await page.evaluate(()=>document.documentElement.scrollWidth)};
}
