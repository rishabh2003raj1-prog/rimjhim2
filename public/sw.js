// Lets the app open without internet. Always tries the network first so a new
// version shows up straight away; the saved copy is only a fallback. Data calls
// (/api/...) are never cached here - the app keeps its own offline copy.
var CACHE = "rimjhim-shell-v1";
var SHELL = ["./", "index.html", "vendor/chart.umd.js", "manifest.webmanifest", "icon.svg"];

self.addEventListener("install", function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(SHELL); }).then(function(){ return self.skipWaiting(); }));
});
self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k!==CACHE; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});
self.addEventListener("fetch", function(e){
  var url = new URL(e.request.url);
  if(e.request.method!=="GET" || url.origin!==location.origin || url.pathname.indexOf("/api/")===0) return;
  e.respondWith(fetch(e.request).then(function(res){
    if(res.ok){ var copy = res.clone(); caches.open(CACHE).then(function(c){ c.put(e.request, copy); }); }
    return res;
  }).catch(function(){
    return caches.match(e.request).then(function(hit){ return hit || caches.match("index.html"); });
  }));
});
