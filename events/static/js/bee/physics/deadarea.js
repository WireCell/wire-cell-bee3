// DeadArea due to dead wires

class DeadArea {
    constructor(store, bee) {
        this.store = store;
        this.bee = bee;
        this.gui = bee.gui;
        let url = this.store.url.base_url + 'deadarea/';
        $.getJSON(url, (data) => {
            // console.log('DeadArea data loaded', data);
            this.deadarea_list = data.deadarea_list
            this.deadarea_list_short = data.deadarea_list.map((item) => {
                return item.replace('channel-deadarea', '');
            });
            this.init();
            this.initGui();

        })
    }

    initGui() {
        let folder = this.gui.folder.deadarea;
        let config = {
            'deadAreaList': [],
        }
        folder.add(config, 'deadAreaList', this.deadarea_list_short)
        .name("Dead Area")
        .setValue(this.deadarea_list_short[0])
        .onChange((value) => {
            console.log(value);
        });

        // folder.__controllers[this.index].name(`${this.index + 1}. ${name}`);
    }

    init() {
        // console.log(this.deadarea_list)
        if (this.deadarea_list.length === 0) {
            // this.store.dom.el_loadingbar.html(this.store.dom.el_loadingbar.html() + "<br /><strong class='success'>No</strong> DeadArea ... files. ");
            return;
        }
        else {
            this.url = this.store.url.base_url + this.deadarea_list[0];
        }
        let el = this.store.dom.el_loadingbar;
        // console.log(this.url);
        this.process = $.getJSON(this.url, (data) => {
            this.data = data;
            // console.log('DeadArea data loaded', this.data);
            el.html(el.html() + "<br /><strong class='success'>Loading</strong> DeadArea ... done. ");
            this.initWorker();
        })
            .fail(() => {
                console.log(`no deadarea found: ${this.url}`);
            });
    }

    initWorker() {
        this.worker_url = this.store.url.root_url;
        this.worker_url = this.worker_url.replace('es6/', ''); // please remove this line later
        if (this.worker_url.indexOf('localhost') > 1
            || this.worker_url.indexOf('127.0.0.1') > 1) {
            this.worker_url += "static/js/worker_deadarea.js";
        }
        else if (this.worker_url.indexOf('twister') > 1) {
            this.worker_url = this.worker_url.replace('bee/', 'static/js/worker_deadarea.js');
        }
        else {
            this.worker_url = this.worker_url.replace('bee', 'bee-static');
            this.worker_url += "js/worker_deadarea.js";
        }
        let worker = new Worker(this.worker_url);
        worker.onmessage = (e) => {
            // console.log('Message received from worker', e.data);
            let mergedGeometry = new THREE.BufferGeometry();
            mergedGeometry.setAttribute('position', new THREE.BufferAttribute(e.data.position, 3));
            mergedGeometry.setAttribute('normal', new THREE.BufferAttribute(e.data.normal, 3));
            let material = new THREE.MeshBasicMaterial({
                color: 0x888888,
                // color: 0xFF0000,
                transparent: true,
                depthWrite: true,
                opacity: this.store.config.helper.deadAreaOpacity,
                side: THREE.DoubleSide,
                wireframe: false
            });
            this.mesh = new THREE.Mesh(mergedGeometry, material);
            this.bee.scene3d.scene.main.add(this.mesh);

        };
        worker.postMessage({
            vertices: this.data,
            geo: {
                halfx: this.store.experiment.tpc.halfxyz[0],
                // halfx: this.store.experiment.halfXYZ(0)[0],
                // halfx: 0,
                center_y: this.store.experiment.tpc.center[1],
                center_z: this.store.experiment.tpc.center[2]
            }
        });
    }

}

export { DeadArea }