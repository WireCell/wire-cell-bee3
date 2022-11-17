
class Wires {
    constructor() {
        // this.dataPromise = fetch('data/')
        this.dataPromise = fetch('',   {headers: {
            'x-requested-with': 'XMLHttpRequest'
          }})

        .then( res => res.json() )
        .then( data => {
            this.store = data.Store
            console.log(this.store)
            this.listOfLines = []

            this.initScene()
            this.initGUI()

            this.drawTPC()
        })
    }


    anode(i) { return this.store.anodes[i].Anode; }
    face(i) { return this.store.faces[i].Face; }
    plane(i) { return this.store.planes[i].Plane; }
    point(i) { return this.store.points[i].Point; }
    wire(i) { return this.store.wires[i].Wire; }
    xyz(p) { return [p.x/10, p.y/10, p.z/10] }

    initScene() {
        this.canvas = document.getElementById('canvas')
        this.scene = new THREE.Scene();

        let depth = 2000;
        // let width = 800;
        // let height = 800;
        let width = this.canvas.clientWidth;
        let height = this.canvas.clientHeight;
        let near = 1;
        let far = 8000;
        // orthographic camera: frustum aspect ratio mush match viewport's aspect ratio
        this.camera = new THREE.OrthographicCamera(width / -2 , width / 2 , height / 2, height / -2, near, far);
        let camera = this.camera;
        camera.position.set(-depth * Math.sin(Math.PI / 4), depth * Math.sin(Math.PI / 6), depth * Math.cos(Math.PI / 4));
        camera.zoom = 1500. / depth;
        camera.updateProjectionMatrix();

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        let renderer = this.renderer;
        renderer.setPixelRatio(window.devicePixelRatio);
        // renderer.setSize(window.innerWidth * 1, window.innerHeight);
        renderer.setSize(width, height);

        renderer.gammaInput = true;
        renderer.gammaOutput = true;
        // if (this.store.config.theme == 'light') {
            renderer.setClearColor(0xFFFFFF, 1);
        // }
        this.canvas.appendChild(renderer.domElement);

        this.controller = new THREE.OrbitControls(this.camera, this.renderer.domElement);

        let self = this;
        window.animate = () => {

            self.scene.rotation.y = 0;
            self.animationId = window.requestAnimationFrame(window.animate);
            self.renderer.autoClear = false;

            // let SCREEN_W = window.innerWidth * 1;
            // let SCREEN_H = window.innerHeight;
            let SCREEN_W = self.canvas.clientWidth;
            let SCREEN_H = self.canvas.clientHeight;
            // let left, bottom, width, height;
            let renderer = self.renderer;

            renderer.setViewport(0, 0, SCREEN_W, SCREEN_H);
            renderer.setScissor(0, 0, SCREEN_W, SCREEN_H);
            renderer.setScissorTest(true);
            renderer.clear();
            renderer.render(self.scene, self.camera);

        }
        window.animate();

    }

    initGUI() {
        this.gui = new dat.GUI({ autoPlace: false, width: 120 });
        this.gui.domElement.id = 'gui'
        document.getElementById('gui').append(this.gui.domElement);

        let self = this;
        this.gui.add(self, 'yzView').name('YZ view');
        this.gui.add(self, 'xyView').name('XY view');
        this.gui.add(self, 'xzView').name('XZ view');
        this.gui.add(self, 'resetCamera').name('Reset');

    }
    
    yzView() {
        this.scene.rotation.x = 0;
        this.camera.up.set(0, 1, 0);
        TweenLite.to(this.camera.position, 0.4, {
            x: -2000,
            y: this.controller.target.y,
            z: this.controller.target.z,
            onUpdate: () => { this.controller.update() }
        });
    }

    xyView() {
        this.scene.rotation.x = 0;
        this.camera.up.set(0, 1, 0);
        TweenLite.to(this.camera.position, 0.4, {
            x: this.controller.target.x,
            y: this.controller.target.y,
            z: 2000,
            onUpdate: () => { this.controller.update() }
        });
    }

    xzView() {
        this.scene.rotation.x = 0;
        this.camera.up.set(0, 1, 0);
        TweenLite.to(this.camera.position, 0.4, {
            x: this.controller.target.x,
            y: 2000,
            z: this.controller.target.z,
            onUpdate: () => {  this.controller.update() }
        });

    }

    resetCamera() {
        this.scene.rotation.x = 0;
        this.camera.up.set(0, 1, 0);
        this.controller.reset();
        this.controller.target.set(0, 0, 0);
    }

    drawTPC() {
        this.tpc = new THREE.Group();
        this.tpcLocation = [
            // [-426, 365, -428, 428, -278, 577],
            [-315, 313, -342, 342, -5, 304]
        ];
        let size = this.tpcLocation.length;
        let loc = this.tpcLocation;

        for (let i = 0; i < size; i++) {
            let box = new THREE.BoxHelper(new THREE.Mesh(
                new THREE.BoxGeometry(loc[i][1] - loc[i][0], loc[i][3] - loc[i][2], loc[i][5] - loc[i][4]),
                new THREE.MeshBasicMaterial()
            ));
            box.material.color.setHex(0x666666);
            box.material.transparent = true;
            box.material.opacity = 0.3;

            let one = new THREE.Object3D;
            one.add(box);
            one.position.set(
                (loc[i][1] + loc[i][0]) / 2, 
                (loc[i][3] + loc[i][2]) / 2, 
                (loc[i][5] + loc[i][4]) / 2
            );
            this.tpc.add(one);
        }
        this.scene.add(this.tpc);

    }

    drawWires({planeId, wireId, wireList}) {
        for (let i = 0; i < this.listOfLines.length; i++) {
            this.scene.remove(this.listOfLines[i]);
        }
        this.listOfLines = [];
        let material = new THREE.LineBasicMaterial({color: 'red'});

        let ws = []
        if (planeId != undefined) {
            ws = this.plane(planeId).wires
        }
        else if (wireId != undefined) {
            ws = [wireId]
        }
        else if (wireList != undefined) {
            ws = wireList
        }
        for (let i=0; i<ws.length; i++ ) {
            let w
            try {
                w = this.wire(ws[i])
            } catch (error) {
                continue
            }
            // console.log(w, this.point(w.head), this.point(w.tail))
    
            let points = [];
            points.push(
                new THREE.Vector3(...this.xyz(this.point(w.head))),
                new THREE.Vector3(...this.xyz(this.point(w.tail)))
            );
    
            let geometry = new THREE.BufferGeometry().setFromPoints( points );
            let line = new THREE.Line(geometry, material);
            this.listOfLines.push(line);
            this.scene.add(line);
        }

    }

}

export { Wires }


// window.wires = new Wires();

