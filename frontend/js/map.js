/*
 * Bản đồ dùng chung (Leaflet + ảnh nền OpenStreetMap, cần Internet).
 * pickerMap: khách chọn điểm giao. trackingMap: hiện nhà hàng, điểm giao và vị trí tài xế, cập nhật theo dữ liệu backend.
 * Không có Internet thì hiện dòng báo, các chức năng khác của trang vẫn chạy.
 */
(() => {
    const ok = () => typeof window.L !== "undefined";
    const offline = el => { el.innerHTML = '<p class="map-offline">Không tải được bản đồ (cần kết nối Internet).</p>'; return null; };
    const pin = (emoji, tone) => L.divIcon({ className: "map-pin " + tone, html: `<span>${emoji}</span>`, iconSize: [36, 36], iconAnchor: [18, 18] });
    const base = (el, center, zoom = 15) => {
        const map = L.map(el, { scrollWheelZoom: false }).setView([center.lat, center.lng], zoom);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);
        return map;
    };

    App.pickerMap = (el, start, restaurant, onPick) => {
        if (!ok()) return offline(el);
        const map = base(el, start);
        if (restaurant) {
            L.marker([restaurant.lat, restaurant.lng], { icon: pin("🍣", "red"), title: restaurant.name }).addTo(map).bindTooltip(restaurant.name);
            map.fitBounds([[restaurant.lat, restaurant.lng], [start.lat, start.lng]], { padding: [40, 40], maxZoom: 16 });
        }
        const marker = L.marker([start.lat, start.lng], { icon: pin("🏠", "blue"), draggable: true }).addTo(map).bindTooltip("Điểm giao (kéo hoặc bấm lên bản đồ để đổi)");
        const pick = latlng => { marker.setLatLng(latlng); onPick({ lat: +latlng.lat.toFixed(6), lng: +latlng.lng.toFixed(6) }); };
        marker.on("dragend", () => pick(marker.getLatLng()));
        map.on("click", e => pick(e.latlng));
        return {
            set(point) { marker.setLatLng([point.lat, point.lng]); map.panTo([point.lat, point.lng]); },
            refresh() { map.invalidateSize(); }
        };
    };

    // points: { restaurant, delivery, driver } — mỗi điểm {lat,lng} hoặc null.
    App.trackingMap = el => {
        let map = null, fitted = false, route = null;
        const markers = {};
        const STYLE = { restaurant: ["🍣", "red", "Nhà hàng"], delivery: ["🏠", "blue", "Điểm giao"], driver: ["🛵", "green", "Tài xế"] };
        return {
            update(points, target) {
                const first = points.driver || points.restaurant || points.delivery;
                if (!first) return;
                if (!map) {
                    if (!ok()) return offline(el);
                    map = base(el, first);
                }
                for (const key of Object.keys(STYLE)) {
                    const p = points[key];
                    if (!p) { if (markers[key]) { markers[key].remove(); delete markers[key]; } continue; }
                    if (markers[key]) markers[key].setLatLng([p.lat, p.lng]);
                    else markers[key] = L.marker([p.lat, p.lng], { icon: pin(STYLE[key][0], STYLE[key][1]), zIndexOffset: key === "driver" ? 1000 : 0 }).addTo(map).bindTooltip(STYLE[key][2]);
                }
                // Đường thẳng từ tài xế tới nơi đang đến (nhà hàng hoặc điểm giao).
                const to = target && points[target];
                if (route) { route.remove(); route = null; }
                if (points.driver && to) route = L.polyline([[points.driver.lat, points.driver.lng], [to.lat, to.lng]], { color: "#176db3", weight: 4, dashArray: "6 8" }).addTo(map);
                if (!fitted) {
                    const all = Object.values(points).filter(Boolean).map(p => [p.lat, p.lng]);
                    if (all.length > 1) map.fitBounds(all, { padding: [40, 40], maxZoom: 16 });
                    fitted = true;
                }
            },
            refresh() { if (map) map.invalidateSize(); },
            refit() { fitted = false; }
        };
    };
})();
