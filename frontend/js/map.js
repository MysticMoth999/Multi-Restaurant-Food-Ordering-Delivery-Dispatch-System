/*
 * Bản đồ dùng chung. Đường vẽ theo đường phố thật, không nối thẳng hai điểm.
 * - Có GOOGLE_MAPS_API_KEY trong .env (backend trả qua GET /api/config): Google Maps, đường đi lấy từ Google Routes API.
 * - Không có key hoặc key bị Google từ chối: Leaflet + ảnh nền OpenStreetMap, đường đi lấy từ OSRM (router.project-osrm.org).
 * - Cả hai dịch vụ chỉ đường đều lỗi: tạm nối thẳng và ghi rõ là ước tính.
 * pickerMap: khách chọn điểm giao, xem đường nhà hàng → điểm giao.
 * trackingMap: nhà hàng, điểm giao, tài xế và đoạn đường tài xế còn phải đi (cắt dần theo vị trí, lệch đường thì tìm lại).
 * Tiền và điều phối do backend tính; bản đồ chỉ để xem. Cần Internet; không có thì hiện dòng báo, trang vẫn chạy.
 */
(() => {
    const COLOR = { active: "#176db3", next: "#5b6475" };
    const OFF_ROUTE_KM = 0.08; // tài xế lệch khỏi đường hơn 80 m thì tìm đường lại
    const REROUTE_MS = 15000; // một chặng không tìm lại quá 15 giây/lần (giữ hạn mức dịch vụ chỉ đường)
    const TIMEOUT_MS = 8000;

    // ---------- Hình học trên đường đi (danh sách điểm {lat,lng}) ----------
    const km = (a, b) => App.distanceKm(a, b);
    const pathKm = path => path.reduce((sum, p, i) => (i ? sum + km(path[i - 1], p) : 0), 0);
    const round6 = p => ({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) });
    // Điểm gần p nhất trên đoạn ab (xấp xỉ phẳng, đủ chính xác trong vài km).
    const project = (p, a, b) => {
        const k = Math.cos(p.lat * Math.PI / 180);
        const dx = (b.lng - a.lng) * k, dy = b.lat - a.lat, len = dx * dx + dy * dy;
        const t = len ? Math.max(0, Math.min(1, ((p.lng - a.lng) * k * dx + (p.lat - a.lat) * dy) / len)) : 0;
        return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    };
    // Phần đường còn lại tính từ p; null nếu p đã lệch khỏi đường.
    const remainder = (path, p) => {
        let best = null;
        for (let i = 1; i < path.length; i++) {
            const q = project(p, path[i - 1], path[i]), d = km(p, q);
            if (!best || d < best.d) best = { d, i, q };
        }
        return best && best.d <= OFF_ROUTE_KM ? [p, best.q, ...path.slice(best.i)] : null;
    };
    // Điểm cách đầu đường một đoạn dist km, đi dọc theo đường.
    const along = (path, dist) => {
        for (let i = 1; i < path.length; i++) {
            const a = path[i - 1], b = path[i], seg = km(a, b);
            if (dist <= seg) return round6({ lat: a.lat + (b.lat - a.lat) * (seg ? dist / seg : 0), lng: a.lng + (b.lng - a.lng) * (seg ? dist / seg : 0) });
            dist -= seg;
        }
        return round6(path[path.length - 1]);
    };
    // Giải mã encoded polyline của Google.
    const decode = text => {
        const points = [];
        let i = 0, lat = 0, lng = 0;
        const next = () => {
            let result = 0, shift = 0, byte;
            do { byte = text.charCodeAt(i++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
            return result & 1 ? ~(result >> 1) : result >> 1;
        };
        while (i < text.length) { lat += next(); lng += next(); points.push({ lat: lat / 1e5, lng: lng / 1e5 }); }
        return points;
    };

    // ---------- Dịch vụ chỉ đường ----------
    const settings = api.config().then(c => c.maps || {}).catch(() => ({}));
    let googleBroken = false; // key sai/chưa bật API: Google gọi gm_authFailure
    const straight = (from, to) => ({ path: [from, to], distanceKm: km(from, to), durationMin: null, source: "line" });
    const viaGoogle = async (key, from, to) => {
        const point = p => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
        // Xe máy trước; nơi Google chưa hỗ trợ xe máy thì dùng ô tô.
        for (const travelMode of ["TWO_WHEELER", "DRIVE"]) {
            const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
                method: "POST",
                signal: AbortSignal.timeout(TIMEOUT_MS),
                headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline" },
                body: JSON.stringify({ origin: point(from), destination: point(to), travelMode, languageCode: "vi", regionCode: "VN" })
            });
            if (!response.ok) throw new Error("Google Routes API " + response.status);
            const route = ((await response.json()).routes || [])[0];
            if (route) return { path: decode(route.polyline.encodedPolyline), distanceKm: (route.distanceMeters || 0) / 1000, durationMin: parseInt(route.duration, 10) / 60, source: "google" };
        }
        throw new Error("Google không tìm được đường");
    };
    const viaOsrm = async (from, to) => {
        const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
        const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!response.ok) throw new Error("OSRM " + response.status);
        const route = ((await response.json()).routes || [])[0];
        if (!route) throw new Error("OSRM không tìm được đường");
        return { path: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })), distanceKm: route.distance / 1000, durationMin: route.duration / 60, source: "osrm" };
    };
    const cache = new Map();
    const keyOf = p => p.lat.toFixed(5) + "," + p.lng.toFixed(5);
    // → { path, distanceKm, durationMin, source: "google" | "osrm" | "line" }. Đường bắt đầu/kết thúc đúng tại hai điểm.
    App.route = (from, to) => {
        const key = keyOf(from) + ">" + keyOf(to);
        if (!cache.has(key)) {
            cache.set(key, (async () => {
                const { googleMapsApiKey } = await settings;
                const services = googleMapsApiKey && !googleBroken ? [() => viaGoogle(googleMapsApiKey, from, to), () => viaOsrm(from, to)] : [() => viaOsrm(from, to)];
                for (const service of services) {
                    try {
                        const route = await service();
                        return { ...route, path: [from, ...route.path, to] };
                    } catch (error) { console.warn("Chỉ đường:", error.message); }
                }
                setTimeout(() => cache.delete(key), 30000); // thử lại dịch vụ sau 30 giây
                return straight(from, to);
            })());
        }
        return cache.get(key);
    };
    // Mở chỉ đường trên ứng dụng Google Maps (không cần key).
    App.directionsUrl = (from, to) => `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=two-wheeler`;
    App.routeText = r => r && r.distanceKm < 0.05 ? "dưới 50 m (đã tới nơi)" : r && `${App.km(r.distanceKm)}${r.durationMin != null ? ` · khoảng ${Math.max(1, Math.round(r.durationMin))} phút` : ""}${r.source === "line" ? " (ước tính đường thẳng, chưa lấy được đường đi)" : ""}`;

    // ---------- Hai bộ vẽ bản đồ cùng một giao diện ----------
    const pinNode = (emoji, tone, extra = "") => Object.assign(document.createElement("div"), { className: `map-pin ${tone} ${extra}`, innerHTML: `<span>${emoji}</span>` });
    const googleMaps = {
        create(el, center, zoom = 15) {
            const g = window.google.maps;
            const map = new g.Map(el, { center, zoom, mapId: "DEMO_MAP_ID", gestureHandling: "cooperative", clickableIcons: false, streetViewControl: false, mapTypeControl: false, fullscreenControl: false });
            const latLng = p => ({ lat: typeof p.lat === "function" ? p.lat() : p.lat, lng: typeof p.lng === "function" ? p.lng() : p.lng });
            return {
                marker(p, [emoji, tone, title], { draggable = false, front = false } = {}) {
                    const m = new g.marker.AdvancedMarkerElement({ map, position: p, title, content: pinNode(emoji, tone, "gm"), gmpDraggable: draggable, zIndex: front ? 1000 : 0 });
                    return { set: q => { m.position = q; }, remove: () => { m.map = null; }, onDrag: fn => m.addListener("dragend", () => fn(latLng(m.position))) };
                },
                line(path, color, dashed) {
                    const style = dashed
                        ? { strokeOpacity: 0, icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 0.9, scale: 3 }, offset: "0", repeat: "14px" }] }
                        : { strokeOpacity: 0.85, strokeWeight: 6 };
                    const l = new g.Polyline({ map, path, strokeColor: color, ...style });
                    return { set: q => l.setPath(q), remove: () => l.setMap(null) };
                },
                onClick: fn => map.addListener("click", e => e.latLng && fn(latLng(e.latLng))),
                fit(points) {
                    if (points.length < 2) return map.setCenter(points[0]);
                    const bounds = new g.LatLngBounds();
                    points.forEach(p => bounds.extend(p));
                    map.fitBounds(bounds, 40);
                    g.event.addListenerOnce(map, "idle", () => { if (map.getZoom() > 16) map.setZoom(16); });
                },
                pan: p => map.panTo(p),
                refresh() { /* Google tự đo lại khi khung đổi kích thước */ }
            };
        }
    };
    const leafletMaps = {
        create(el, center, zoom = 15) {
            const L = window.L, ll = p => [p.lat, p.lng];
            const map = L.map(el, { scrollWheelZoom: false }).setView(ll(center), zoom);
            L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 19,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · đường đi <a href="https://project-osrm.org/">OSRM</a>'
            }).addTo(map);
            const icon = (emoji, tone) => L.divIcon({ className: "map-pin " + tone, html: `<span>${emoji}</span>`, iconSize: [36, 36], iconAnchor: [18, 18] });
            return {
                marker(p, [emoji, tone, title], { draggable = false, front = false } = {}) {
                    const m = L.marker(ll(p), { icon: icon(emoji, tone), draggable, zIndexOffset: front ? 1000 : 0 }).addTo(map).bindTooltip(title);
                    return { set: q => m.setLatLng(ll(q)), remove: () => m.remove(), onDrag: fn => m.on("dragend", () => fn(m.getLatLng())) };
                },
                line(path, color, dashed) {
                    const l = L.polyline(path.map(ll), { color, weight: dashed ? 4 : 6, opacity: 0.85, dashArray: dashed ? "6 8" : null }).addTo(map);
                    return { set: q => l.setLatLngs(q.map(ll)), remove: () => l.remove() };
                },
                onClick: fn => map.on("click", e => fn(e.latlng)),
                // Không dùng hiệu ứng zoom: trang gắn lại khung bản đồ mỗi lần tải lại chi tiết đơn, hiệu ứng dở dang sẽ giữ khung cũ.
                fit: points => (points.length < 2 ? map.setView(ll(points[0]), map.getZoom(), { animate: false }) : map.fitBounds(points.map(ll), { padding: [40, 40], maxZoom: 16, animate: false })),
                pan: p => map.panTo(ll(p)),
                refresh: () => map.invalidateSize()
            };
        }
    };

    let googleLoad = null;
    const loadGoogle = key => (googleLoad ??= new Promise((resolve, reject) => {
        window.__gomealMapsReady = resolve;
        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&libraries=marker&language=vi&region=VN&loading=async&callback=__gomealMapsReady`;
        script.async = true;
        script.onerror = reject;
        document.head.append(script);
    }));
    // Bản đồ đang hiện; khi Google từ chối key thì vẽ lại tất cả bằng Leaflet.
    const mounted = new Set();
    window.gm_authFailure = () => {
        googleBroken = true;
        cache.clear();
        console.warn("Google Maps từ chối GOOGLE_MAPS_API_KEY; chuyển sang OpenStreetMap.");
        mounted.forEach(remount => remount());
    };
    const engine = async () => {
        const { googleMapsApiKey } = await settings;
        if (googleMapsApiKey && !googleBroken) {
            try { await loadGoogle(googleMapsApiKey); return googleMaps; } catch { googleBroken = true; }
        }
        return window.L ? leafletMaps : null;
    };
    const offline = el => { el.innerHTML = '<p class="map-offline">Không tải được bản đồ (cần kết nối Internet).</p>'; };
    const STYLE = { restaurant: ["🍣", "red", "Nhà hàng"], delivery: ["🏠", "blue", "Điểm giao"], driver: ["🛵", "green", "Tài xế"] };

    // onRoute(route) nhận đường nhà hàng → điểm giao mỗi khi điểm giao đổi.
    App.pickerMap = (el, start, restaurant, onPick, { onRoute } = {}) => {
        let view = null, marker = null, line = null, point = round6(start), seq = 0;
        const drawRoute = async () => {
            if (!restaurant || !view) return;
            const mine = ++seq, route = await App.route(restaurant, point);
            if (mine !== seq || !view) return; // đã chọn điểm khác trong lúc chờ
            if (line) line.set(route.path); else line = view.line(route.path, COLOR.active, false);
            if (onRoute) onRoute(route);
        };
        const mount = async () => {
            const kind = await engine();
            if (!kind) return offline(el);
            el.innerHTML = "";
            view = kind.create(el, point);
            line = null;
            if (restaurant) {
                view.marker(restaurant, ["🍣", "red", restaurant.name]);
                view.fit([restaurant, point]);
            }
            marker = view.marker(point, ["🏠", "blue", "Điểm giao (kéo hoặc bấm lên bản đồ để đổi)"], { draggable: true });
            const pick = p => { point = round6(p); marker.set(point); onPick(point); drawRoute(); };
            marker.onDrag(pick);
            view.onClick(pick);
            drawRoute();
        };
        mounted.add(() => { view = null; mount(); });
        mount();
        return {
            set(p) { point = round6(p); if (view) { marker.set(point); view.pan(point); drawRoute(); } },
            refresh() { if (view) view.refresh(); }
        };
    };

    // points: { restaurant, delivery, driver } — mỗi điểm {lat,lng} hoặc null; target: "restaurant" | "delivery".
    // Có tài xế: vẽ đậm đoạn tài xế → nơi đến (và mờ đoạn nhà hàng → điểm giao nếu chưa lấy món). Chưa có: nhà hàng → điểm giao.
    // onRoute(route | null) nhận đoạn đang đi; route.distanceKm/durationMin là phần còn lại.
    App.trackingMap = (el, { onRoute } = {}) => {
        const state = { points: {}, target: null, fitted: false };
        let view = null, markers = {}, lines = {}, plan = null, current = null, running = null, again = false;
        const setLine = (key, path, color, dashed) => {
            if (!path) { if (lines[key]) { lines[key].remove(); delete lines[key]; } return; }
            if (lines[key]) lines[key].set(path); else lines[key] = view.line(path, color, dashed);
        };
        // Đoạn tài xế đang đi: giữ đường đã tìm, cắt bớt theo vị trí mới; chỉ tìm lại khi đổi nơi đến hoặc lệch đường.
        const driverLeg = async (from, to) => {
            const sameTarget = plan && plan.to === keyOf(to), fresh = plan && Date.now() - plan.at < REROUTE_MS;
            if (sameTarget && plan.route.source !== "line") {
                const rest = remainder(plan.route.path, from);
                const total = pathKm(plan.route.path) || 1;
                if (rest) {
                    const left = pathKm(rest) / total;
                    return { ...plan.route, path: rest, distanceKm: plan.route.distanceKm * left, durationMin: plan.route.durationMin == null ? null : plan.route.durationMin * left };
                }
            }
            if (sameTarget && fresh) return plan.route.source === "line" ? straight(from, to) : { ...plan.route, path: [from, ...plan.route.path.slice(1)] };
            const route = await App.route(from, to);
            plan = { to: keyOf(to), route, at: Date.now() };
            return route;
        };
        const draw = async () => {
            const { restaurant, delivery, driver } = state.points;
            const first = driver || restaurant || delivery;
            if (!first) return;
            if (!view) {
                const kind = await engine();
                if (!kind) return offline(el);
                if (!view) { el.innerHTML = ""; view = kind.create(el, first); }
            }
            for (const key of Object.keys(STYLE)) {
                const p = state.points[key];
                if (!p) { if (markers[key]) { markers[key].remove(); delete markers[key]; } continue; }
                if (markers[key]) markers[key].set(p);
                else markers[key] = view.marker(p, STYLE[key], { front: key === "driver" });
            }
            const to = state.target && state.points[state.target];
            const main = driver && to ? await driverLeg(driver, to)
                : restaurant && delivery ? await App.route(restaurant, delivery) : null;
            const after = driver && state.target === "restaurant" && restaurant && delivery ? await App.route(restaurant, delivery) : null;
            if (!view) return; // đã vẽ lại bằng bộ khác trong lúc chờ
            setLine("after", after && after.path, COLOR.next, true);
            setLine("main", main && main.path, COLOR.active, false);
            current = driver && to ? main : null;
            if (onRoute) onRoute(current);
            if (!state.fitted) {
                const all = Object.values(state.points).filter(Boolean);
                if (all.length) view.fit(all);
                state.fitted = true;
            }
        };
        // Gộp các lần cập nhật dồn dập (trang tải lại 4 giây/lần) thành một lần vẽ.
        const schedule = () => {
            if (running) { again = true; return; }
            running = draw().catch(error => console.warn("Bản đồ:", error)).finally(() => {
                running = null;
                if (again) { again = false; schedule(); }
            });
        };
        mounted.add(() => { view = null; markers = {}; lines = {}; state.fitted = false; schedule(); });
        return {
            update(points, target) { state.points = { ...points }; state.target = target; schedule(); },
            refresh() { if (view) view.refresh(); },
            // Đổi sang đơn khác: canh lại khung nhìn và bỏ đường của đơn cũ.
            refit() { state.fitted = false; plan = null; current = null; },
            // Đoạn còn lại tài xế phải đi (hoặc null), và điểm cách tài xế dist km dọc theo đường (để mô phỏng xe chạy).
            route: () => current,
            along: dist => (current && current.source !== "line" ? along(current.path, dist) : null)
        };
    };
})();
