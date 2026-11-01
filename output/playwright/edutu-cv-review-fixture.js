async (page) => {
  const origin = 'http://127.0.0.1:4187';
  const source = await (await page.request.get(origin + '/src/features/cv/CvPage.tsx')).text();
  const version = source.match(/react\.js\?v=([^"']+)/)[1];
  await page.route('**/src/features/workspace/shared.tsx', route => route.fulfill({contentType:'text/javascript',body:`
    import React from '/node_modules/.vite/deps/react.js?v=${version}';
    import {useTranslation} from '/node_modules/.vite/deps/react-i18next.js?v=${version}';
    export const json = JSON.stringify;
    export const errorMessage = error => error.message;
    export function useProductSession(){return {request:window.cvRequest,userId:'cv-review-user'};}
    export function Loading(){return React.createElement('p',null,'Loading…');}
    export function WorkspaceText({value}){const {t}=useTranslation();return t('workspaceCopy.'+value);}
    export function FeaturePage({title,description,actions,children,className=''}){const {t}=useTranslation();return React.createElement('section',{className:'feature-workspace '+className},React.createElement('header',{className:'feature-heading'},React.createElement('div',null,React.createElement('h1',null,'My CVs'),React.createElement('p',{className:'feature-description'},t('workspace.'+description))),React.createElement('div',{className:'feature-actions'},actions)),children);}
  `}));
  await page.route('**/src/hooks/usePaywall.tsx', route => route.fulfill({contentType:'text/javascript',body:`export function usePaywall(){return {isPro:true,billingLoading:false,openPaywall:()=>{},handleUpgradeError:()=>false,refreshBilling:async()=>{}};}`}));
  await page.route('**/__edutu_cv_review', route => route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Edutu CV review fixture</title></head><body><div id="root" style="padding:32px 20px"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
    const data={header:{full_name:'Amara Okafor',email:'amara@example.test',location:'Lagos, Nigeria'},summary:'Economics graduate with experience in data analysis, programme coordination and community research. Interested in making evidence useful for education policy and widening access to opportunity.',experience:[{id:'e1',role:'Research assistant',company:'Centre for Education Research',start_date:'2024-09',current:true,description:'Coordinated interviews with 45 students and analysed survey responses to identify barriers to university access.',highlights:['Prepared 3 evidence briefs for the programme team.']}],education:[{id:'ed1',degree:'BSc Economics',institution:'University of Lagos',start_date:'2020',end_date:'2024'}],skills:['Research','Python','Data analysis','Communication','Programme coordination']};
    window.cvRows=[{id:'cv1',name:'Fellowship · Education policy',data,templateId:'academic-research',updatedAt:'2026-10-31T10:00:00Z',source:'mobile'},{id:'cv2',name:'Research assistant applications',data:{...data,summary:'A focused version for research roles.'},templateId:'minimal-ats',updatedAt:'2026-10-28T10:00:00Z',source:'mobile'}];
    window.cvRequest=async(path,options={})=>{if(path==='/monetization/access')return {planTier:'plus',costs:{cvAi:5},chatRemaining:20,actionCreditsRemaining:40,resetsAt:null};if(path==='/cv/editor'&&options.method==='POST'){const row={...JSON.parse(options.body),id:'cv'+(window.cvRows.length+1),updatedAt:new Date().toISOString(),source:'mobile'};window.cvRows.unshift(row);return structuredClone(row);}if(path==='/cv/editor')return structuredClone(window.cvRows);if(path.startsWith('/cv/editor/')&&options.method==='PATCH'){const id=path.split('/').pop();const row={...window.cvRows.find(r=>r.id===id),...JSON.parse(options.body),updatedAt:new Date().toISOString()};window.cvRows=window.cvRows.map(r=>r.id===id?row:r);return structuredClone(row);}if(path.startsWith('/opportunities/search'))return [{id:'opp1',title:'Education Policy Fellowship'}];throw new Error('Fixture does not implement '+path);};
    await import('/src/i18n/index.ts');await import('/src/index.css');await import('/src/features/workspace/workspace.css');await import('/src/features/workspace/tools.css');
    const React=(await import('/node_modules/.vite/deps/react.js?v=${version}')).default;const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js?v=${version}')).default;const {MemoryRouter}=await import('/node_modules/.vite/deps/react-router-dom.js?v=${version}');const CvPage=(await import('/src/features/cv/CvPage.tsx')).default;createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(CvPage)));
  </script></body></html>`}));
  await page.goto(origin + '/__edutu_cv_review');
  await page.getByRole('searchbox',{name:'Search your CVs'}).waitFor();
  return {fixture:true,title:await page.title()};
}
