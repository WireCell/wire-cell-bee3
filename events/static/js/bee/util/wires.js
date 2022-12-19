
import { createExperiment } from '../physics/experiment.js'

class Wires {
    constructor() {
        // this.dataPromise = fetch('data/')
        this.dataPromise = fetch('',   {headers: {
            'x-requested-with': 'XMLHttpRequest'
          }})

        .then( res => res.json() )
        .then( data => {
            this.initStore(data)
            
            this.initScene()
            this.initGUI()

            this.drawTPC()
        })
    }

    initStore(data) {
        this.store = data.Store
        this.store.channels = {}
        this.store.wipMap = {}
        this.store.summary = {}
        let len = this.store.wires.length
        this.store.summary.nWire = len
        this.store.summary.facesPerAnode = this.anode(0).faces.length
        this.store.summary.planesPerFace = this.face(0).planes.length
        this.store.summary.nChannel = 0
        for (let i=0; i<len; i++) {
            let w = this.wire(i)
            let ch = w.channel
            if (this.store.channels[ch] == undefined) {
                this.store.channels[ch] = [i]
                this.store.summary.nChannel++
            }
            else {
                this.store.channels[ch].push(i)
            }
        }
        for (let i=0; i<this.store.planes.length; i++) {
            let plane = this.plane(i)
            for (let j=0; j<plane.wires.length; j++) {
                let wireGlobal = plane.wires[j]
                this.store.wipMap[wireGlobal] = [i, j]
            }
        }
        // console.log(this.store)

    }

    anode(i) { return this.store.anodes[i].Anode; }
    face(i) { return this.store.faces[i].Face; }
    plane(i) { return this.store.planes[i].Plane; }
    point(i) { return this.store.points[i].Point; }
    wire(i) { return this.store.wires[i].Wire; }
    xyz(p) { return [p.x/10, p.y/10, p.z/10] }

    initScene() {
        this.listOfLines = []
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
        this.target0 = Object.assign({}, this.controller.target)
        this.position0 = Object.assign({}, this.controller.object.position)
        this.zoom0 = this.controller.object.zoom;

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
        this.gui = new dat.GUI({ autoPlace: false, width: 200 });
        this.gui.domElement.id = 'gui'
        document.getElementById('gui').append(this.gui.domElement);

        let self = this;
        this.gui.add(self, 'yzView').name('YZ view');
        this.gui.add(self, 'xyView').name('XY view');
        this.gui.add(self, 'xzView').name('XZ view');

        this.gui.add(self.controller, 'saveState').name('Save state');
        this.gui.add(self.controller, 'reset').name('Load state');
        this.gui.add(self, 'resetCamera').name('Reset');


        let para = { zoomFactor: self.zoom0 }
        this.gui.add(para, 'zoomFactor', 0.5, 15)
            .name("Zoom").step(0.5)
            .onChange((value) => {
                self.zoom(value)
            });

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
        // console.log(this.controller.target0, this.controller.position0, this.controller.zoom0)

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
        this.camera.up.set(1, 0, 0);
        TweenLite.to(this.camera.position, 0.4, {
            x: this.controller.target.x,
            y: 2000,
            z: this.controller.target.z,
            onUpdate: () => {          
                // this.controller.rotateLeftUser(-Math.PI/2);
                this.controller.update() 
            }
        });

    }

    resetCamera() {
        this.scene.rotation.x = 0;
        this.camera.up.set(0, 1, 0);

        // this.controller.target.set(0, 0, 0);

        // this.controller.target0.copy( this.target0 );
        // this.controller.position0.copy( this.position0 );
        // this.controller.zoom0 = this.zoom0;
        // this.controller.reset();

        // console.log(this.target0, this.position0, this.zoom0)
        // from the original reset() method in obitcontrols.js
        this.controller.target.copy( this.target0 );
        this.controller.object.position.copy( this.position0 );
        this.controller.object.zoom = this.zoom0;
        this.controller.object.updateProjectionMatrix();
        // this.controller.dispatchEvent( this.controller._changeEvent );
        this.controller.update();
        // this.controller.state = STATE.NONE;
    }

    zoom(zoomFactor) {
        this.controller.object.zoom = zoomFactor;
        this.controller.object.updateProjectionMatrix();
        this.controller.update();
    }

    drawTPC() {
        let url = window.location.href
        let expName = url.substring(url.indexOf('wires')).split('/')[1]
        let exp = createExperiment(expName)
        // console.log(exp)
        this.tpc = new THREE.Group();
        this.tpcLocation = exp.tpc.location;
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

    drawWires({planeId, wireId, wireList, chList, colorList, planeIdx, wipIdx, drawCenter, drawBoundary}) {
        for (let i = 0; i < this.listOfLines.length; i++) {
            this.scene.remove(this.listOfLines[i]);
        }
        this.listOfLines = [];
        let ws = []
        // let colors = colorList == undefined? [] : colorList
        if (planeId != undefined) {
            ws = this.plane(planeId).wires
        }
        else if (wireId != undefined) {
            ws = [wireId]
        }
        else if (planeIdx!=undefined && wipIdx!=undefined) {
            try {
                ws = [this.plane(planeIdx).wires[wipIdx]]
            } catch (error) {
                return
            }
        }
        else if (wireList != undefined) {
            ws = wireList
        }
        else if (chList != undefined) {
            let size = chList.length
            let colors = []
            for (let i=0; i<size; i++) {
                let ch = chList[i]
                let color = colorList[i] ? colorList[i] : 'red'
                let segs = this.store.channels[ch]
                if (segs) {
                    let nSeg = segs.length
                    for (let j=0; j<nSeg; j++) {
                        ws.push(segs[j])
                        colors.push(color)
                    }
                }
            }
            colorList = colors
        }

        let self = this;
        function createWire(i) {
            let w
            try {
                w = self.wire(ws[i])
            } catch (error) {
                return
            }
            // console.log(w, self.point(w.head), self.point(w.tail))
    
            let points = [];
            points.push(
                new THREE.Vector3(...self.xyz(self.point(w.head))),
                new THREE.Vector3(...self.xyz(self.point(w.tail)))
            );
    
            let geometry = new THREE.BufferGeometry().setFromPoints( points );
            let color
            try {
                color = colorList[i]
            }
            catch (error) {
                color = 'red'
            }
            let material = new THREE.LineBasicMaterial({color: color});
            let line = new THREE.Line(geometry, material);
            self.listOfLines.push(line);
            self.scene.add(line);
        }

        function createWireBoundary(i) {
            let w1, w2
            try {
                let [planeIdx, wipIdx] = self.store.wipMap[ws[i]]
                w1 = self.wire(self.plane(planeIdx).wires[wipIdx])
                w2 = self.wire(self.plane(planeIdx).wires[wipIdx-1])
            } catch (error) {
                return
            }
            // console.log(w, self.point(w.head), self.point(w.tail))
    
            let points = []
            function avgXYZ(arr1, arr2) {
                let arr = []
                // console.log(arr1, arr2)
                for (let i in [0, 1, 2]) {
                    arr.push((arr1[i]+arr2[i])/2)
                }
                return arr
            }
            
            points.push(
                new THREE.Vector3(...avgXYZ(self.xyz(self.point(w1.head)), self.xyz(self.point(w2.head)) )),
                new THREE.Vector3(...avgXYZ(self.xyz(self.point(w1.tail)), self.xyz(self.point(w2.tail)) ))
            );
    
            let geometry = new THREE.BufferGeometry().setFromPoints( points );
            let color
            try {
                color = colorList[i]
            }
            catch (error) {
                color = 'red'
            }
            let material = new THREE.LineBasicMaterial({color: 'grey'});
            // let material = new THREE.LineDashedMaterial( {
            //     color: color,
            //     linewidth: 1,
            //     scale: 1,
            //     dashSize: 3,
            //     gapSize: 1,
            // } );
            let line = new THREE.Line(geometry, material);
            line.computeLineDistances();
            self.listOfLines.push(line);
            self.scene.add(line);
        }

        drawCenter = (drawCenter==undefined ? true : drawCenter)
        drawBoundary = (drawBoundary==undefined ? false: drawBoundary)
        if (drawCenter) {
            for (let i=0; i<ws.length; i++ ) {
                createWire(i)
            }
        }
        if (drawBoundary) {
            for (let i=0; i<ws.length; i++ ) {
                createWireBoundary(i)
            }
        }


    }

    drawImage3D(url) {
        let baseurl = '/'
        if(window.location.href.includes('/twister/')) {
            baseurl = '/twister/bee/'
        }

        url = baseurl + url.substring(url.indexOf('set'))
        if (!url.endsWith('/')) { url += '/' }
        let eventSeg = url.substring(url.indexOf('event'))
        let segments = eventSeg.split('/')
        if (segments.length == 3) { // no algorithm input
            url = url + 'WireCell-charge/'
        }
        // console.log(url)
        this.image3dPromise = fetch(url,   {
            headers: {
            'x-requested-with': 'XMLHttpRequest',
            },
        })
        .then( res => res.json() )
        .then( data => {
            this.data = {};
            let size = data.x.length; // all data must have x
            this.data.x = new Float32Array(size);
            this.data.y = new Float32Array(size);
            this.data.z = new Float32Array(size);
            this.data.q = new Float32Array(size);
            this.data.cluster_id = new Float32Array(size);
            this.data.real_cluster_id = new Float32Array(size);
            this.data.runNo = data.runNo;
            this.data.subRunNo = data.subRunNo;
            this.data.eventNo = data.eventNo;
            this.data.eventTime = data.eventTime == null ? '' : data.eventTime;
            this.data.trigger = data.trigger == null ? '0' : data.trigger;
            this.data.bounding_box = data.bounding_box == null ? [] : data.bounding_box;
    
            for (let i = 0; i < size; i++) {
                this.data.x[i] = data.x[i];
                this.data.y[i] = data.y[i];
                this.data.z[i] = data.z[i];
                this.data.q[i] = data.q == null ? 0 : data.q[i];
                this.data.cluster_id[i] = data.cluster_id == null ? 0 : data.cluster_id[i];
                this.data.real_cluster_id[i] = data.real_cluster_id == null ? 0 : data.real_cluster_id[i];
            }
            // console.log(this.data)

            let positions = new Float32Array(size * 3);
            // let colors = new Float32Array(size * 3);
            for (let i = 0; i < size; i++) {
                positions[i*3] = this.data.x[i]
                positions[i*3+1] = this.data.y[i]
                positions[i*3+2] = this.data.z[i]
            }
            let geometry = new THREE.BufferGeometry();
            geometry.dynamic = true;
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            // geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            geometry.attributes.position.needsUpdate = true;
            // geometry.attributes.color.needsUpdate = true;
    
            let material = new THREE.PointsMaterial({
                vertexColors: true,
                size: 1,
                opacity: 0.8,
                transparent: true,
                depthWrite: false,
                sizeAttenuation: false
            });
    
            if (this.pointCloud != null) { this.scene.remove(this.pointCloud) }
            this.pointCloud = new THREE.Points(geometry, material);
            this.scene.add(this.pointCloud);

        })
    }
}

export { Wires }

