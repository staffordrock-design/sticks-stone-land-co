import{c as r}from"./index-Dh1rMPb3.js";/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const o=[["path",{d:"M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z",key:"1tc9qg"}],["circle",{cx:"12",cy:"13",r:"3",key:"1vg3eu"}]],x=r("Camera",o),c={TN:{minLat:34.8,maxLat:36.8,minLng:-90.5,maxLng:-81.5},GA:{minLat:30.2,maxLat:35.2,minLng:-85.8,maxLng:-80.6},AL:{minLat:30.1,maxLat:35.2,minLng:-88.7,maxLng:-84.7},KY:{minLat:36.3,maxLat:39.3,minLng:-89.8,maxLng:-81.8},NC:{minLat:33.7,maxLat:36.8,minLng:-84.5,maxLng:-75.2},SC:{minLat:31.9,maxLat:35.3,minLng:-83.5,maxLng:-78.3},FL:{minLat:24.2,maxLat:31.2,minLng:-87.8,maxLng:-79.7},MS:{minLat:30,maxLat:35.2,minLng:-91.8,maxLng:-87.9}};function g(m,L){const a=Number(m),n=Number(L);return Number.isFinite(a)&&Number.isFinite(n)&&a>=-90&&a<=90&&n>=-180&&n<=180}function u(m,L,a){if(!g(m,L))return!1;const n=Number(m),i=Number(L),e=String(a||"").trim().toUpperCase(),t=c[e];return t?n>=t.minLat&&n<=t.maxLat&&i>=t.minLng&&i<=t.maxLng:n>=24&&n<=39.5&&i>=-92&&i<=-75}export{x as C,u as i};
