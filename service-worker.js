const CACHE = 'aurea-v27';
const APP_SHELL=[
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './icons/192x192.png',
    './icons/512x512.png'
];

self.addEventListener(
    'install',
    event=>{
        event.waitUntil(
            caches
                .open(CACHE)
                .then(cache=>
                    cache.addAll(APP_SHELL)
                )
                .then(()=>
                    self.skipWaiting()
                )
        );
    }
);

self.addEventListener(
    'activate',
    event=>{
        event.waitUntil(
            caches
                .keys()
                .then(keys=>
                    Promise.all(
                        keys
                            .filter(key=>
                                key.startsWith('aurea-v')&&
                                key!==CACHE
                            )
                            .map(key=>
                                caches.delete(key)
                            )
                    )
                )
                .then(()=>
                    self.clients.claim()
                )
        );
    }
);

self.addEventListener(
    'fetch',
    event=>{
        if(event.request.method!=='GET'){
            return;
        }

        const url=new URL(
            event.request.url
        );

        if(
            url.origin!==
            self.location.origin
        ){
            return;
        }

        const appFile=
            event.request.mode==='navigate'||
            [
                '/index.html',
                '/style.css',
                '/app.js',
                '/manifest.json'
            ].some(path=>
                url.pathname.endsWith(path)
            );

        event.respondWith(
            (async()=>{
                const cache=await caches.open(
                    CACHE
                );

                if(!appFile){
                    const cached=await cache.match(
                        event.request
                    );

                    if(cached){
                        return cached;
                    }
                }

                try{
                    const response=await fetch(
                        event.request
                    );

                    if(response.ok){
                        event.waitUntil(
                            cache.put(
                                event.request,
                                response.clone()
                            )
                        );

                        return response;
                    }

                    if(appFile){
                        const cached=await cache.match(
                            event.request
                        );

                        if(cached){
                            return cached;
                        }
                    }

                    return response;
                }catch{
                    const cached=await cache.match(
                        event.request
                    );

                    if(cached){
                        return cached;
                    }

                    if(
                        event.request.mode===
                        'navigate'
                    ){
                        const page=await cache.match(
                            './index.html'
                        );

                        if(page){
                            return page;
                        }
                    }

                    return new Response(
                        'Sem ligação e sem cópia offline.',
                        {
                            status:503,
                            headers:{
                                'Content-Type':
                                    'text/plain; charset=utf-8'
                            }
                        }
                    );
                }
            })()
        );
    }
);