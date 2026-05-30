// DeadArea due to dead wires

// Returns the base URL ending in 'js/' for the given deployment.
// Prefers the Django-injected window.BEE_STATIC_JS_URL set in event.html;
// falls back to URL-manipulation heuristics for older deployments.
function _staticJsUrl(rootUrl) {
    if (window.BEE_STATIC_JS_URL) return window.BEE_STATIC_JS_URL;
    if (rootUrl.indexOf('localhost') > 1 || rootUrl.indexOf('127.0.0.1') > 1) {
        return rootUrl + 'static/js/';
    } else if (rootUrl.indexOf('twister') > 1) {
        return rootUrl.replace('bee/', 'static/js/');
    } else {
        return rootUrl.replace('bee', 'bee-static') + 'js/';
    }
}

// Module-level cache: fetched from the main thread (same-origin, no CORS issues)
// on first use, then shared across all concurrent initWorker calls.
let _threeCodePromise = null;
function _getThreeCode(rootUrl) {
    if (!_threeCodePromise) {
        const url = _staticJsUrl(rootUrl) + 'lib/three.min.js';
        _threeCodePromise = fetch(url).then(r => r.text());
    }
    return _threeCodePromise;
}

const _workerLogic = `
onmessage = function(e) {
  var data = e.data.vertices;
  var geo = e.data.geo;
  var center_y = geo.center_y;
  var center_z = geo.center_z;
  var x0, x1;
  if (geo.anode_x !== undefined) {
    x0 = geo.anode_x; x1 = geo.anode_x + geo.anode_dx;
  } else {
    x0 = -geo.halfx; x1 = -geo.halfx + 2;
  }
  var extrudeSettings = { steps: 100, bevelEnabled: false, extrudePath: null };
  var mergedGeometry = new THREE.Geometry();
  for (var i = 0; i < data.length; i++) {
    var pts = [], raw_pts = data[i], cy = 0, cz = 0;
    for (var j = 0; j < raw_pts.length; j++) { cy += raw_pts[j][0]; cz += raw_pts[j][1]; }
    cy /= raw_pts.length; cz /= raw_pts.length;
    for (var j = 0; j < raw_pts.length; j++) {
      pts.push(new THREE.Vector2(-raw_pts[j][1] + cz, raw_pts[j][0] - cy));
    }
    extrudeSettings.extrudePath = new THREE.SplineCurve3([
      new THREE.Vector3(x0, cy - center_y, cz - center_z),
      new THREE.Vector3(x1, cy - center_y, cz - center_z),
    ]);
    mergedGeometry.merge(new THREE.ExtrudeGeometry(new THREE.Shape(pts), extrudeSettings));
  }
  var buf = new THREE.BufferGeometry().fromGeometry(mergedGeometry);
  postMessage({ position: buf.attributes.position.array, normal: buf.attributes.normal.array });
  close();
};`;

class DeadArea {
    constructor(store, bee) {
        this.store = store;
        this.bee = bee;
        this.gui = bee.gui;
        this.meshes = [];
        this.group = new THREE.Group();
        bee.scene3d.scene.main.add(this.group);

        let url = this.store.url.base_url + 'deadarea/';
        $.getJSON(url, (data) => {
            this.deadarea_list = data.deadarea_list;
            this.init();
            this.initGui();
        });
    }

    initGui() {
        let folder = this.gui.folder.deadarea;

        // Opacity slider — applies to all meshes
        folder.add(this.store.config.helper, 'deadAreaOpacity', 0., 0.9)
            .name('Opacity').step(0.1)
            .onChange((value) => {
                this.meshes.forEach(m => { m.material.opacity = value; });
            });

        // Per-anode visibility checkboxes are added dynamically in initWorker()
        // as each worker resolves, so they appear in arrival order.
    }

    init() {
        if (this.deadarea_list.length === 0) {
            return;
        }
        let el = this.store.dom.el_loadingbar;
        this.deadarea_list.forEach((name) => {
            let url = this.store.url.base_url + name;
            $.getJSON(url, (data) => {
                el.html(el.html() + `<br /><strong class='success'>Loading</strong> ${name} ... done. `);
                this.initWorker(data, name);
            }).fail(() => {
                console.log(`no deadarea found: ${url}`);
            });
        });
    }

    initWorker(rawJson, name) {
        const exp = this.store.experiment;
        let geo;
        let vertices;

        if (Array.isArray(rawJson)) {
            // Legacy format: bare array of polygons — place at union outer-anode (unchanged behaviour)
            vertices = rawJson;
            geo = {
                halfx: exp.tpc.halfxyz[0],
                center_y: exp.tpc.center[1],
                center_z: exp.tpc.center[2],
            };
        } else {
            // New format: {version, tpc, polygons}
            const iTPC = rawJson.tpc !== undefined ? rawJson.tpc : 0;
            const [halfx_i] = exp.halfXYZ(iTPC);
            const cx_i = exp.center(iTPC)[0];
            const drift_i = exp.driftDir(iTPC);
            // anode face in Bee-local X; slab extends 2 cm inward along the drift direction
            const anode_x = cx_i - drift_i * halfx_i - exp.tpc.center[0];
            const anode_dx = drift_i * 2;
            vertices = rawJson.polygons;
            geo = {
                anode_x,
                anode_dx,
                center_y: exp.tpc.center[1],
                center_z: exp.tpc.center[2],
            };
        }

        // Short label: strip the "channel-deadarea" prefix and leading dash
        const suffix = name.replace('channel-deadarea', '').replace(/^-/, '');
        const label = suffix || 'all';

        // Fetch raw (non-Parcel-processed) three.min.js from the main thread so it
        // defines THREE as a global inside the blob worker. blob: URLs are not
        // interceptable by Chrome extensions, fixing the server-side Chrome error.
        const rootUrl = this.store.url.root_url;
        _getThreeCode(rootUrl).then(threeCode => {
            const blob = new Blob([threeCode, _workerLogic], { type: 'application/javascript' });
            const blobUrl = URL.createObjectURL(blob);
            let worker = new Worker(blobUrl);
            URL.revokeObjectURL(blobUrl);
            worker.onmessage = (e) => {
                let mergedGeometry = new THREE.BufferGeometry();
                mergedGeometry.setAttribute('position', new THREE.BufferAttribute(e.data.position, 3));
                mergedGeometry.setAttribute('normal', new THREE.BufferAttribute(e.data.normal, 3));
                let material = new THREE.MeshBasicMaterial({
                    color: 0x888888,
                    transparent: true,
                    depthWrite: true,
                    opacity: this.store.config.helper.deadAreaOpacity,
                    side: THREE.DoubleSide,
                    wireframe: false,
                });
                let mesh = new THREE.Mesh(mergedGeometry, material);
                this.meshes.push(mesh);
                this.group.add(mesh);

                // Add a visibility toggle for this anode to the GUI
                let config = { visible: true };
                this.gui.folder.deadarea
                    .add(config, 'visible')
                    .name(`Show ${label}`)
                    .onChange((v) => { mesh.visible = v; });
            };
            worker.postMessage({ vertices, geo });
        });
    }

}

export { DeadArea }
