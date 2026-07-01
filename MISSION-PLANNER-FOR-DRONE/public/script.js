// Initialisation de la carte avec un fond OpenStreetMap (style Humanitarian, très détaillé)
const map = L.map('map').setView([14.5, -14.5], 7);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// ---------- Barre de recherche (géocodage) avec l'API actuelle de leaflet-geosearch ----------
// Note: la bibliothèque leaflet-geosearch a changé d'API.
// Nous allons utiliser l'approche simple avec un contrôle personnalisé.
// Ou bien on peut utiliser la version "OpenStreetMapProvider" correctement.

// Pour éviter l'erreur, on va intégrer une recherche via un contrôle simple.
// Créons une barre de recherche personnalisée (solution plus fiable)
const searchControl = L.control({ position: 'topleft' });
searchControl.onAdd = function(map) {
    const div = L.DomUtil.create('div', 'geosearch');
    div.innerHTML = '<input type="text" placeholder="Rechercher un lieu..." id="search-input" style="width:200px;padding:5px;border-radius:4px;border:1px solid #ccc;">';
    const input = div.querySelector('#search-input');
    const resultsDiv = document.createElement('div');
    resultsDiv.className = 'results';
    div.appendChild(resultsDiv);
    
    let timeout = null;
    input.addEventListener('input', function(e) {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            const query = e.target.value;
            if (query.length < 3) return;
            fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`)
                .then(res => res.json())
                .then(data => {
                    resultsDiv.innerHTML = '';
                    data.forEach(item => {
                        const resultEl = document.createElement('div');
                        resultEl.className = 'result';
                        resultEl.textContent = item.display_name;
                        resultEl.addEventListener('click', () => {
                            map.setView([item.lat, item.lon], 15);
                            input.value = '';
                            resultsDiv.innerHTML = '';
                        });
                        resultsDiv.appendChild(resultEl);
                    });
                });
        }, 500);
    });
    return div;
};
map.addControl(searchControl);

// ---------- Gestion des waypoints ----------
let waypoints = [];
let markers = [];

function updateWaypointsList() {
    const list = document.getElementById('waypoints-list');
    list.innerHTML = '';
    waypoints.forEach((wp, idx) => {
        const li = document.createElement('li');
        li.textContent = `${idx+1}: ${wp.lat.toFixed(5)}, ${wp.lng.toFixed(5)}`;
        li.onclick = () => map.setView([wp.lat, wp.lng], 15);
        list.appendChild(li);
    });
}

function updateMarkers() {
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    waypoints.forEach(wp => {
        const marker = L.marker([wp.lat, wp.lng]).addTo(map);
        markers.push(marker);
    });
}

map.on('click', (e) => {
    waypoints.push({ lat: e.latlng.lat, lng: e.latlng.lng });
    updateWaypointsList();
    updateMarkers();
});

document.getElementById('send-mission').onclick = () => {
    if (waypoints.length === 0) return alert('Aucun waypoint');
    window.parent.postMessage({ type: 'mission', waypoints }, '*');
};

// ---------- WebSocket pour télémétrie (optionnel) ----------
const ws = new WebSocket(`ws://${window.location.host}`);
ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === 'telemetry') {
        document.getElementById('lat').textContent = data.data.lat.toFixed(6);
        document.getElementById('lon').textContent = data.data.lon.toFixed(6);
        document.getElementById('alt').textContent = data.data.alt.toFixed(1);
    }
};

// ---------- Affichage des points d'intérêt (POI) avec clustering ----------
let poiCluster = null;

async function fetchPOI(lat, lng, radius = 2000) {
    const overpassUrl = 'https://overpass-api.de/api/interpreter';
    const query = `
        [out:json];
        (
            node["amenity"="pharmacy"](around:${radius},${lat},${lng});
            node["shop"="supermarket"](around:${radius},${lat},${lng});
        );
        out body;
    `;
    try {
        const response = await fetch(overpassUrl, {
            method: 'POST',
            body: query,
            headers: { 'Content-Type': 'text/plain' }
        });
        const data = await response.json();
        return data.elements.map(el => ({
            id: el.id,
            lat: el.lat,
            lng: el.lon,
            name: el.tags.name || (el.tags.amenity === 'pharmacy' ? 'Pharmacie' : 'Supermarché'),
            type: el.tags.amenity === 'pharmacy' ? 'pharmacy' : 'supermarket'
        }));
    } catch (err) {
        console.error('Erreur chargement POI:', err);
        return [];
    }
}

function addPOIMarkers(poiList) {
    if (poiCluster) map.removeLayer(poiCluster);
    poiCluster = L.markerClusterGroup();
    poiList.forEach(poi => {
        const marker = L.marker([poi.lat, poi.lng])
            .bindPopup(`<b>${poi.name}</b><br>${poi.type === 'pharmacy' ? 'Pharmacie' : 'Supermarché'}`);
        poiCluster.addLayer(marker);
    });
    map.addLayer(poiCluster);
}

async function refreshPOI() {
    const center = map.getCenter();
    const poiList = await fetchPOI(center.lat, center.lng);
    addPOIMarkers(poiList);
}

map.on('moveend', refreshPOI);
refreshPOI(); // chargement initial