var photos=(function(){function e(e){return e}var t=`photos-sponge-root`,n=80,r=new Intl.DateTimeFormat(void 0,{month:`long`,year:`numeric`}),i={active:!1,month:``,queue:[],index:0,trashed:[],kept:[],pendingConfirm:!1,message:``},a,o,s,c,l,u=e({matches:[`https://photos.google.com/*`],runAt:`document_idle`,main(){d(),y(),window.addEventListener(`keydown`,f,!0),window.addEventListener(`scroll`,I(()=>y(),300),!0),new MutationObserver(I(()=>y(),500)).observe(document.body,{childList:!0,subtree:!0})}});function d(){document.getElementById(t)?.remove(),a=document.createElement(`div`),a.id=t,a.attachShadow({mode:`open`});let e=document.createElement(`style`);e.textContent=`
    :host, * {
      box-sizing: border-box;
    }

    .panel {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 2147483647;
      width: min(380px, calc(100vw - 24px));
      overflow: hidden;
      border: 1px solid rgba(22, 32, 38, 0.16);
      border-radius: 8px;
      background: #fbfcfd;
      box-shadow: 0 18px 50px rgba(15, 23, 42, 0.28);
      color: #172026;
      font: 13px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 14px;
      border-bottom: 1px solid #dbe4ea;
      background: #ffffff;
    }

    .title {
      min-width: 0;
      font-size: 14px;
      font-weight: 720;
    }

    .actions,
    .keys {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    button,
    select {
      height: 32px;
      border: 1px solid #c5d0d8;
      border-radius: 6px;
      background: #ffffff;
      color: #172026;
      font: inherit;
    }

    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 10px;
      cursor: pointer;
      font-weight: 650;
    }

    button.primary {
      border-color: #0f766e;
      background: #0f766e;
      color: white;
    }

    button.danger {
      border-color: #b42318;
      background: #b42318;
      color: white;
    }

    button:disabled {
      cursor: default;
      opacity: 0.5;
    }

    select {
      min-width: 0;
      flex: 1;
      padding: 0 28px 0 8px;
    }

    .body {
      display: grid;
      gap: 12px;
      padding: 12px 14px 14px;
    }

    .picker {
      display: flex;
      gap: 8px;
    }

    .stage {
      display: grid;
      place-items: center;
      min-height: 180px;
      overflow: hidden;
      border: 1px solid #d9e2e8;
      border-radius: 8px;
      background: #eef3f6;
    }

    .stage img {
      display: block;
      max-width: 100%;
      max-height: 320px;
      object-fit: contain;
    }

    .empty {
      max-width: 28ch;
      padding: 24px 18px;
      color: #465a65;
      text-align: center;
    }

    .meta {
      display: grid;
      gap: 4px;
      min-width: 0;
    }

    .photo-label {
      overflow: hidden;
      color: #172026;
      font-weight: 650;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .status {
      color: #526672;
    }

    .keys {
      justify-content: space-between;
    }

    .key {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }

    kbd {
      min-width: 22px;
      padding: 2px 6px;
      border: 1px solid #b9c5ce;
      border-bottom-width: 2px;
      border-radius: 4px;
      background: #ffffff;
      color: #172026;
      font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
      text-align: center;
    }

    .confirm {
      display: grid;
      gap: 10px;
      padding: 12px;
      border: 1px solid #f2b8b5;
      border-radius: 8px;
      background: #fff7f6;
    }

    .confirm strong {
      color: #8c1d18;
    }
  `,o=document.createElement(`div`),o.className=`panel`,o.innerHTML=`
    <div class="topbar">
      <div class="title">Photos Sponge</div>
      <div class="actions">
        <button type="button" data-action="refresh" title="Refresh visible photos">Refresh</button>
        <button type="button" data-action="hide" title="Hide panel">Hide</button>
      </div>
    </div>
    <div class="body">
      <div class="picker">
        <select aria-label="Month to review"></select>
        <button type="button" class="primary" data-action="start">Start</button>
      </div>
      <div class="stage"><div class="empty">Scroll Google Photos to a month, choose it here, then start.</div></div>
      <div class="meta">
        <div class="photo-label">No review running</div>
        <div class="status">Visible photos are grouped by their Google Photos labels.</div>
      </div>
      <div class="keys">
        <span class="key"><kbd>Y</kbd> keep</span>
        <span class="key"><kbd>N</kbd> trash</span>
        <span class="key"><kbd>U</kbd> undo</span>
        <span class="key"><kbd>Esc</kbd> stop</span>
      </div>
    </div>
  `,a.shadowRoot?.append(e,o),document.documentElement.append(a),s=V(`.stage`),c=V(`select`),l=V(`.status`),a.shadowRoot?.addEventListener(`click`,e=>{let t=e.target.closest(`button[data-action]`);if(!t)return;let n=t.dataset.action;n===`refresh`&&y(!0),n===`hide`&&(a.hidden=!0),n===`start`&&p(),n===`confirm-delete`&&g(),n===`cancel-delete`&&S(`Deletion cancelled. Your marked photos were not changed.`)})}function f(e){if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement)return;if(a.hidden&&e.key.toLowerCase()===`s`){a.hidden=!1,e.preventDefault();return}if(!i.active)return;let t=e.key.toLowerCase();t===`y`&&(e.preventDefault(),m(`keep`)),t===`n`&&(e.preventDefault(),m(`trash`)),t===`u`&&(e.preventDefault(),h()),t===`escape`&&(e.preventDefault(),S(`Stopped. No Google Photos changes were made.`))}function p(){let e=c.value,t=_().filter(t=>t.month===e);if(i.active=!0,i.month=e,i.queue=t,i.index=0,i.trashed=[],i.kept=[],i.pendingConfirm=!1,i.message=``,t.length===0){S(`No visible photos found for that month. Scroll the grid and refresh.`);return}b()}function m(e){if(i.pendingConfirm)return;let t=i.queue[i.index];if(t){if(e===`trash`?i.trashed.push(t):i.kept.push(t),i.index+=1,i.index>=i.queue.length){i.pendingConfirm=!0,x();return}b()}}function h(){i.pendingConfirm?(i.pendingConfirm=!1,i.index=Math.max(0,i.queue.length-1)):i.index>0&&--i.index;let e=i.queue[i.index];i.trashed=i.trashed.filter(t=>t.id!==e?.id),i.kept=i.kept.filter(t=>t.id!==e?.id),b()}async function g(){if(i.pendingConfirm=!1,i.trashed.length===0){S(`Finished. Nothing was marked for trash.`);return}P(`Selecting ${i.trashed.length} marked photo${R(i.trashed.length)}...`);let e=[];for(let t of i.trashed)await C(t)&&e.push(t),await L(90);if(e.length===0){S(`I could not find Google Photos selection controls for the marked photos. Nothing was deleted.`);return}P(`Selected ${e.length}. Opening Google Photos trash action...`),await L(250);let t=E();if(!t){S(`Selected the marked photos, but could not find the Google Photos trash button. Use the toolbar trash icon to finish.`);return}t.click(),await L(300);let n=D();n?(n.click(),S(`Sent ${e.length} photo${R(e.length)} to Google Photos trash.`)):S(`Opened the Google Photos trash action for ${e.length} selected photo${R(e.length)}. Confirm the Google Photos dialog to finish.`)}function _(){let e=new Set;for(let t of[`[role="gridcell"]`,`a[href*="/photo/"]`,`div[aria-label][tabindex]`,`div[jsaction][aria-label]`])document.querySelectorAll(t).forEach(t=>{t.querySelector(`img`)&&e.add(t)});let t=Array.from(e).filter(O).map(v).filter(e=>e!==null),n=new Set;return t.filter(e=>n.has(e.id)?!1:(n.add(e.id),!0))}function v(e){let t=e.querySelector(`img`)??void 0,n=F(e.getAttribute(`aria-label`)??t?.getAttribute(`aria-label`)??t?.alt??j(e)??`Visible photo`),r=k(n)??A(e)??`Visible photos`,i=t?.currentSrc||t?.src||void 0;return{id:[e.getAttribute(`data-id`),e.getAttribute(`href`),n,i,Math.round(e.getBoundingClientRect().top+window.scrollY)].filter(Boolean).join(`|`),tile:e,image:t,label:n,month:r,thumbUrl:i}}function y(e=!1){if(!c)return;let t=c.value,n=new Map;for(let e of _())n.set(e.month,(n.get(e.month)??0)+1);if(c.replaceChildren(...Array.from(n.entries()).map(([e,t])=>{let n=document.createElement(`option`);return n.value=e,n.textContent=`${e} (${t})`,n})),t&&n.has(t)&&(c.value=t),n.size===0){let e=document.createElement(`option`);e.value=``,e.textContent=`No visible months found`,c.append(e)}e&&P(`Refreshed. Found ${z(n)} visible photo${R(z(n))}.`)}function b(){let e=i.queue[i.index];if(!e){x();return}if(s.replaceChildren(),e.thumbUrl){let t=document.createElement(`img`);t.src=e.thumbUrl,t.alt=e.label,s.append(t)}else{let e=document.createElement(`div`);e.className=`empty`,e.textContent=`Preview unavailable. Use the highlighted tile in Google Photos.`,s.append(e)}let t=V(`.photo-label`);t.textContent=e.label,e.tile.scrollIntoView({block:`center`,inline:`center`,behavior:`smooth`}),M(e.tile),P(`${i.month}: ${i.index+1}/${i.queue.length}. ${i.trashed.length} marked for trash, ${i.kept.length} kept.`)}function x(){s.innerHTML=`
    <div class="confirm">
      <strong>Confirm before deleting</strong>
      <span>${i.trashed.length} photo${R(i.trashed.length)} marked for trash from ${B(i.month)}.</span>
      <div class="actions">
        <button type="button" class="danger" data-action="confirm-delete">Move to trash</button>
        <button type="button" data-action="cancel-delete">Cancel</button>
      </div>
    </div>
  `;let e=V(`.photo-label`);e.textContent=`Month complete`,P(`${i.kept.length} kept. Press U to review the last photo again.`)}function S(e){i.active=!1,i.month=``,i.queue=[],i.index=0,i.trashed=[],i.kept=[],i.pendingConfirm=!1,i.message=e;let t=V(`.photo-label`);t.textContent=`No review running`,s.innerHTML=`<div class="empty">${B(e)}</div>`,P(e),y()}async function C(e){let t=w(e)??e.tile;t.scrollIntoView({block:`center`,inline:`center`,behavior:`smooth`}),await L(180);let n=T(t);if(n)return n.click(),!0;let r=t.querySelector(`[role="checkbox"]`);return r?(r.click(),!0):!1}function w(e){return _().find(t=>t.id===e.id||t.label===e.label)?.tile??null}function T(e){let t=Array.from(e.querySelectorAll(`button, [role="button"], [aria-label]`));return t.find(e=>/select|check|tick/i.test(e.getAttribute(`aria-label`)??``))??t.find(t=>{let n=t.getBoundingClientRect(),r=e.getBoundingClientRect();return n.width>12&&n.height>12&&n.left<r.left+r.width*.45})??null}function E(){return Array.from(document.querySelectorAll(`button, [role="button"]`)).find(e=>/trash|delete|bin|remove/i.test(N(e)))??null}function D(){let e=Array.from(document.querySelectorAll(`[role="dialog"], [aria-modal="true"]`)).at(-1)??document.body;return Array.from(e.querySelectorAll(`button, [role="button"]`)).find(e=>/move to trash|trash|delete|remove/i.test(N(e)))??null}function O(e){let t=e.getBoundingClientRect();return t.width<n||t.height<n||t.bottom<0||t.top>window.innerHeight||t.right<0||t.left>window.innerWidth?!1:getComputedStyle(e).visibility!==`hidden`}function k(e){let t=Date.parse(e);if(!Number.isNaN(t))return r.format(new Date(t));let n=e.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/i);if(!n)return null;let i=Date.parse(n[0]);return Number.isNaN(i)?null:r.format(new Date(i))}function A(e){let t=e;for(let e=0;t&&e<6;e+=1){let e=t.querySelector(`[role="heading"], h1, h2, h3, [aria-label]`),n=k(F(e?.textContent??e?.getAttribute(`aria-label`)??``));if(n)return n;t=t.parentElement}return null}function j(e){let t=[],n=e;for(let e=0;n&&e<4;e+=1){let e=F(n.innerText);e&&e.length<120&&t.push(e),n=n.parentElement}return t[0]??null}function M(e){let t=e.style.outline,n=e.style.outlineOffset;e.style.outline=`4px solid #0f766e`,e.style.outlineOffset=`2px`,window.setTimeout(()=>{e.style.outline=t,e.style.outlineOffset=n},600)}function N(e){return F([e.getAttribute(`aria-label`),e.getAttribute(`title`),e.textContent,e.querySelector(`svg title`)?.textContent].filter(Boolean).join(` `))}function P(e){l.textContent=e}function F(e){return(e??``).replace(/\s+/g,` `).trim()}function I(e,t){let n;return(...r)=>{window.clearTimeout(n),n=window.setTimeout(()=>e(...r),t)}}function L(e){return new Promise(t=>window.setTimeout(t,e))}function R(e){return e===1?``:`s`}function z(e){return Array.from(e.values()).reduce((e,t)=>e+t,0)}function B(e){let t=document.createElement(`div`);return t.textContent=e,t.innerHTML}function V(e){let t=a.shadowRoot?.querySelector(e);if(!t)throw Error(`Missing Photos Sponge UI element: ${e}`);return t}var H={debug:(...e)=>([...e],void 0),log:(...e)=>([...e],void 0),warn:(...e)=>([...e],void 0),error:(...e)=>([...e],void 0)},U=globalThis.browser?.runtime?.id?globalThis.browser:globalThis.chrome,W=class e extends Event{static EVENT_NAME=G(`wxt:locationchange`);constructor(t,n){super(e.EVENT_NAME,{}),this.newUrl=t,this.oldUrl=n}};function G(e){return`${U?.runtime?.id}:photos:${e}`}var K=typeof globalThis.navigation?.addEventListener==`function`;function q(e){let t,n=!1;return{run(){n||(n=!0,t=new URL(location.href),K?globalThis.navigation.addEventListener(`navigate`,e=>{let n=new URL(e.destination.url);n.href!==t.href&&(window.dispatchEvent(new W(n,t)),t=n)},{signal:e.signal}):e.setInterval(()=>{let e=new URL(location.href);e.href!==t.href&&(window.dispatchEvent(new W(e,t)),t=e)},1e3))}}}var J=class e{static SCRIPT_STARTED_MESSAGE_TYPE=G(`wxt:content-script-started`);id;abortController;locationWatcher=q(this);constructor(e,t){this.contentScriptName=e,this.options=t,this.id=Math.random().toString(36).slice(2),this.abortController=new AbortController,this.stopOldScripts(),this.listenForNewerScripts()}get signal(){return this.abortController.signal}abort(e){return this.abortController.abort(e)}get isInvalid(){return U.runtime?.id??this.notifyInvalidated(),this.signal.aborted}get isValid(){return!this.isInvalid}onInvalidated(e){return this.signal.addEventListener(`abort`,e),()=>this.signal.removeEventListener(`abort`,e)}block(){return new Promise(()=>{})}setInterval(e,t){let n=setInterval(()=>{this.isValid&&e()},t);return this.onInvalidated(()=>clearInterval(n)),n}setTimeout(e,t){let n=setTimeout(()=>{this.isValid&&e()},t);return this.onInvalidated(()=>clearTimeout(n)),n}requestAnimationFrame(e){let t=requestAnimationFrame((...t)=>{this.isValid&&e(...t)});return this.onInvalidated(()=>cancelAnimationFrame(t)),t}requestIdleCallback(e,t){let n=requestIdleCallback((...t)=>{this.signal.aborted||e(...t)},t);return this.onInvalidated(()=>cancelIdleCallback(n)),n}addEventListener(e,t,n,r){t===`wxt:locationchange`&&this.isValid&&this.locationWatcher.run(),e.addEventListener?.(t.startsWith(`wxt:`)?G(t):t,n,{...r,signal:this.signal})}notifyInvalidated(){this.abort(`Content script context invalidated`),H.debug(`Content script "${this.contentScriptName}" context invalidated`)}stopOldScripts(){document.dispatchEvent(new CustomEvent(e.SCRIPT_STARTED_MESSAGE_TYPE,{detail:{contentScriptName:this.contentScriptName,messageId:this.id}})),this.options?.noScriptStartedPostMessage||window.postMessage({type:e.SCRIPT_STARTED_MESSAGE_TYPE,contentScriptName:this.contentScriptName,messageId:this.id},`*`)}verifyScriptStartedEvent(e){let t=e.detail?.contentScriptName===this.contentScriptName,n=e.detail?.messageId===this.id;return t&&!n}listenForNewerScripts(){let t=e=>{!(e instanceof CustomEvent)||!this.verifyScriptStartedEvent(e)||this.notifyInvalidated()};document.addEventListener(e.SCRIPT_STARTED_MESSAGE_TYPE,t),this.onInvalidated(()=>document.removeEventListener(e.SCRIPT_STARTED_MESSAGE_TYPE,t))}},Y={debug:(...e)=>([...e],void 0),log:(...e)=>([...e],void 0),warn:(...e)=>([...e],void 0),error:(...e)=>([...e],void 0)};return(async()=>{try{let{main:e,...t}=u;return await e(new J(`photos`,t))}catch(e){throw Y.error(`The content script "photos" crashed on startup!`,e),e}})()})();
photos;