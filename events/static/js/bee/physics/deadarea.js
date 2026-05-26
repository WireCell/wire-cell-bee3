// DeadArea due to dead wires

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
        // All files are rendered simultaneously; the opacity slider in gui.js
        // covers all meshes via this.meshes.
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
                this.initWorker(data);
            }).fail(() => {
                console.log(`no deadarea found: ${url}`);
            });
        });
    }

    initWorker(rawJson) {
        // Resolve worker URL (unchanged from original)
        let worker_url = this.store.url.root_url.replace('es6/', '');
        if (worker_url.indexOf('localhost') > 1 || worker_url.indexOf('127.0.0.1') > 1) {
            worker_url += "static/js/worker_deadarea.js";
        } else if (worker_url.indexOf('twister') > 1) {
            worker_url = worker_url.replace('bee/', 'static/js/worker_deadarea.js');
        } else {
            worker_url = worker_url.replace('bee', 'bee-static');
            worker_url += "js/worker_deadarea.js";
        }

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

        let worker = new Worker(worker_url);
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
        };
        worker.postMessage({ vertices, geo });
    }

}

export { DeadArea }
