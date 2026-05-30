// optical detector object

class OP {
    constructor(store, bee) {
        this.store = store;
        this.bee = bee;

        this.url = this.store.url.base_url + 'op/';
        this.currentFlash = 0;
        this.loadData();
    }

    loadData() {
        this.process = $.getJSON(this.url, (data) => {
            this.data = data;
        })
            .fail(() => {
                console.log("no op found: " + this.url);
            });
    }

    draw() {
        let currentFlash = this.currentFlash;
        let t = this.data.op_t[currentFlash];
        let peTotal = this.data.op_peTotal[currentFlash];
        let driftV = this.store.experiment.tpc.driftVelocity;
        // console.log(currentFlash, t, peTotal, driftV * t);

        if(this.group_op != null) { this.bee.scene3d.scene.main.remove(this.group_op) }
        this.group_op = new THREE.Group();

        // reco frame: boxes/PMTs shifted along drift by driftV*t*driftDir (current behavior)
        let last = this.buildGroup(this.group_op, false);
        this.bee.scene3d.scene.main.add(this.group_op);

        // Option B: detector frame -- boxes/PMTs fixed at their real location (no shift)
        if (this.store.config.op.sidePanel) {
            if (this.group_op_detector != null) { this.bee.scene3d.scene.detector.remove(this.group_op_detector) }
            this.group_op_detector = new THREE.Group();
            this.buildGroup(this.group_op_detector, true);
            this.bee.scene3d.scene.detector.add(this.group_op_detector);
        }
        else if (this.group_op_detector != null) {
            this.bee.scene3d.scene.detector.remove(this.group_op_detector);
            this.group_op_detector = null;
        }

        if (this.store.config.op.matchTiming) {
            this.bee.current_sst.drawInsideSlice(last.boxhelper.position.x-last.halfx, 2*last.halfx);
        }
        else {
            this.bee.current_sst.drawInsideThreeFrames();
        }

        // detector-frame charge: T0-corrected (the dual of the box shift) when panel is on
        if (this.store.config.op.sidePanel) { this.bee.current_sst.drawDetectorFrame(); }
        else { this.bee.current_sst.clearDetectorFrame(); }

        if(this.store.config.helper.showSCB) {
            this.bee.scene3d.drawSpaceChargeBoundary(driftV*t);
        }

        // add status bar text
        this.store.dom.el_statusbar.html(`#${this.currentFlash}: (${t} us, ${peTotal} pe)`);
        if (this.data.op_l1_t) {
            let l1size = this.data.op_l1_t[this.currentFlash].length;
            if (l1size>1) {
                let txt = this.store.dom.el_statusbar.html();
                for (let i=0; i<l1size; i++) {
                    txt += `<br/>L1: (${this.data.op_l1_t[this.currentFlash][i]} us, ${this.data.op_l1_pe[this.currentFlash][i]} pe)`;
                }
                this.store.dom.el_statusbar.html(txt);
            }
        }
        if (this.data.op_cluster_ids) {
            this.store.dom.el_statusbar.html(
                this.store.dom.el_statusbar.html() +
               '<br/>matching: ' + this.data.op_cluster_ids[this.currentFlash]
            )
        }

    }

    // Build the red TPC boxes + PMT/X-Arapuca circles for the current flash into
    // `group`. detectorFrame=false reproduces the reco frame (drift shift applied);
    // detectorFrame=true draws everything at its real fixed location (shift = 0).
    // Returns {boxhelper, halfx} of the last TPC (used by the matchTiming slice).
    buildGroup(group, detectorFrame) {
        let currentFlash = this.currentFlash;
        let t = this.data.op_t[currentFlash];
        let pes = this.data.op_pes[currentFlash];
        let pes_pred = this.data.op_pes_pred[currentFlash];
        let driftV = this.store.experiment.tpc.driftVelocity;
        let lastBoxhelper = null, lastHalfx = 0;

        for (let iTPC=0; iTPC<this.store.experiment.nTPC(); iTPC++) {
            // console.log(this.store.experiment.halfXYZ(iTPC), this.store.experiment.center(iTPC), this.store.experiment.driftDir(iTPC));
            let boxhelper = new THREE.Object3D;

            let exp = this.store.experiment;
            let [halfx, halfy, halfz] = this.store.experiment.halfXYZ(iTPC);
            let shiftX = detectorFrame ? 0 : driftV*t*exp.driftDir(iTPC); // drift shift (0 in detector frame)
            let opBox = new THREE.Mesh(
                new THREE.BoxGeometry(halfx*2, halfy*2, halfz*2 ),
                new THREE.MeshBasicMaterial( {
                    color: 0x96f97b,
                    transparent: true,
                    depthWrite: true,
                    opacity: 0.5,
            }));
            let box = new THREE.BoxHelper(opBox);
            box.material.color.setHex(0xff0000);
            boxhelper.add(box);
            let sx = exp.center(iTPC)[0]+shiftX; // shifted x location
            boxhelper.position.set(...exp.toLocalXYZ(sx, exp.center(iTPC)[1], exp.center(iTPC)[2]));
            group.add(boxhelper);
            lastBoxhelper = boxhelper; lastHalfx = halfx;

            let location = this.store.experiment.op.location;
            let nDet = this.store.experiment.op.nDet;
            if (this.store.experiment.name == "sbnd") {
                for (let i=0; i<nDet; i++) {
                    if (this.store.experiment.opTPC(i) != iTPC) continue;
                    let detType = location[i][3] == undefined ? 1 : location[i][3];
                    let sox = location[i][0]+shiftX; // shifted op x location
                    if (detType == 1) {
                        let radius = 10.16;
                        let segments = 32; //<-- Increase or decrease for more resolution

                        let circleGeometry = new THREE.CircleGeometry( radius, segments );
                        let circle = new THREE.LineSegments(
                            new THREE.EdgesGeometry(circleGeometry),
                            new THREE.LineBasicMaterial({color: 0xbbbbbb})
                        );
                        circle.rotation.y = Math.PI / 2;
                        circle.position.set(...exp.toLocalXYZ(sox, location[i][1], location[i][2]));
                        group.add(circle);
                    }
                    else if (detType == 2) {
                        let xara = new THREE.LineSegments(
                            new THREE.EdgesGeometry(new THREE.PlaneGeometry(10, 7.5)),
                            new THREE.LineBasicMaterial({color: 0xbbbbbb})
                        );
                        xara.rotation.y = Math.PI / 2;
                        xara.position.set(...exp.toLocalXYZ(sox, location[i][1], location[i][2]));
                        group.add(xara);
                    }

                    if (this.store.config.op.showPMTClone) {
                        let circle2 =circle.clone();
                        circle2.rotation.x = Math.PI / 2;
                        circle2.rotation.y = 0;
                        circle2.position.x = boxhelper.position.x + exp.toLocalXYZ(...location[i])[1];
                        circle2.position.y = boxhelper.position.y + halfy;
                        group.add(circle2);
                    }
                }
            }
            else { // draw uboone pmts
                for (let i=0; i<nDet; i++) {
                    if (this.store.experiment.opTPC(i) != iTPC) continue;
                    let radius = 10;
                    let segments = 32; //<-- Increase or decrease for more resolution I guess

                    let circleGeometry = new THREE.CircleGeometry( radius, segments );
                    let circle = new THREE.Mesh(circleGeometry, new THREE.MeshBasicMaterial({
                        color: 0xbbbbbb,
                        opacity: 0.01,
                        side: THREE.DoubleSide
                    }));
                    circle.rotation.y = Math.PI / 2;
                    let sox = location[i][0]+shiftX; // shifted op x location
                    circle.position.set(...exp.toLocalXYZ(sox, location[i][1], location[i][2]));
                    group.add(circle);

                    if (this.store.config.op.showPMTClone) {
                        let circle2 =circle.clone();
                        circle2.rotation.x = Math.PI / 2;
                        circle2.rotation.y = 0;
                        circle2.position.x = boxhelper.position.x + exp.toLocalXYZ(...location[i])[1];
                        circle2.position.y = boxhelper.position.y + halfy;
                        group.add(circle2);
                    }
                }
            }


            for (let i=0; i<nDet; i++) {
                if (this.store.experiment.opTPC(i) != iTPC) continue;
                if (pes[i] > 0.01 ) {
                    let radius = Math.sqrt(pes[i]) * this.store.experiment.op.peScaling;
                    let segments = 32; //<-- Increase or decrease for more resolution I guess

                    let circleGeometry = new THREE.CircleGeometry( radius, segments );
                    let circle = new THREE.Mesh(circleGeometry, new THREE.MeshBasicMaterial({
                        color: 0xff0000,
                        opacity: 0.2,
                        side: THREE.DoubleSide
                    }));
                    circle.rotation.y = Math.PI / 2;
                    let sox = location[i][0]+shiftX; // shifted op x location
                    circle.position.set(...exp.toLocalXYZ(sox, location[i][1], location[i][2]));
                    group.add(circle);

                    if (this.store.config.op.showPMTClone) {
                        let circle2 =circle.clone();
                        circle2.rotation.x = Math.PI / 2;
                        circle2.rotation.y = 0;
                        circle2.position.x = boxhelper.position.x + exp.toLocalXYZ(...location[i])[1];
                        circle2.position.y = boxhelper.position.y + halfy;
                        group.add(circle2);
                    }
                }

                if (this.store.config.op.showPred) {
                    try {
                        if (pes_pred[i] > 0.01 ) {
                            let radius_pred = Math.sqrt(pes_pred[i]) * this.store.experiment.op.peScaling;
                            let segments_pred = 32;
                            let circleGeometry_pred = new THREE.CircleGeometry( radius_pred, segments_pred );
                            let circle_pred = new THREE.Mesh(circleGeometry_pred, new THREE.MeshBasicMaterial({
                                color: 0x15b01a,
                                opacity: 0.2,
                                side: THREE.DoubleSide
                            }));
                            circle_pred.rotation.y = Math.PI / 2;
                            let sox = location[i][0]+shiftX; // shifted op x location
                            circle_pred.position.set(...exp.toLocalXYZ(sox, location[i][1]-halfy*2, location[i][2]));
                            group.add(circle_pred);
                        }
                    }
                    catch(err) {
                        // console.log(err);
                    }
                }

            }
        }

        return { boxhelper: lastBoxhelper, halfx: lastHalfx };
    }

    enableDrawFlash() {
        this.bee.gui.folder.op.__controllers[1].setValue(true);
    }

    drawMachingCluster() {
        this.bee.gui.folder.op.__controllers[3].setValue(true);
    }

    next() {
        if (this.currentFlash < this.data.op_t.length - 1) { this.currentFlash += 1 }
        else { this.currentFlash = 0 }
        this.draw();
    }

    prev() {
        // this.enableDrawFlash();
        if (this.currentFlash > 0) { this.currentFlash -= 1 }
        else { this.currentFlash = this.data.op_t.length - 1 }
        this.draw();
    }

    nextMatching() {
        do {
            if (this.currentFlash < this.data.op_t.length - 1) { this.currentFlash += 1 }
            else { this.currentFlash = 0 }
        } while (this.data.op_cluster_ids[this.currentFlash].length == 0)
        this.drawMachingCluster();
    }

    prevMatching() {
        // this.enableMachingCluster();
        do {
            if (this.currentFlash > 0) { this.currentFlash -= 1 }
            else { this.currentFlash = this.data.op_t.length - 1 }
        } while (this.data.op_cluster_ids[this.currentFlash].length == 0)
        this.drawMachingCluster();
    }

    nextMatchingBeam() {
        let n = 0;
        do {
            if (this.currentFlash < this.data.op_t.length - 1) {
                this.currentFlash += 1;
                n += 1;
            }
            else {
                this.currentFlash = 0;
                n += 1
            }
            if (n > this.data.op_t.length) break;
        } while (
            this.data.op_cluster_ids[this.currentFlash].length == 0
            || this.data.op_t[this.currentFlash] < this.store.experiment.op.beamTimeMin
            || this.data.op_t[this.currentFlash] > this.store.experiment.op.beamTimeMax
        )
        if (n <= this.data.op_t.length) { this.drawMachingCluster() }
        else { this.store.dom.el_statusbar.html('No matching flash found inside beam window') }

    }

    nextMatchingNUMI() {
        let n = 0;
        do {
            if (this.currentFlash < this.data.op_t.length - 1) {
                this.currentFlash += 1;
                n += 1;
            }
            else {
                this.currentFlash = 0;
                n += 1
            }
            if (n > this.data.op_t.length) break;
        } while (
            this.data.op_cluster_ids[this.currentFlash].length == 0
            || this.data.op_t[this.currentFlash] < this.store.experiment.op.numiTimeMin
            || this.data.op_t[this.currentFlash] > this.store.experiment.op.numiTimeMax
        )
        if (n <= this.data.op_t.length) { this.drawMachingCluster() }
        else { this.store.dom.el_statusbar.html('No matching flash found inside beam window') }

    }

    toggle() {
        if (this.group_op == null) { this.draw() }
        else {
            this.bee.scene3d.scene.main.remove(this.group_op);
            this.group_op = null;
            if (this.group_op_detector != null) {
                this.bee.scene3d.scene.detector.remove(this.group_op_detector);
                this.group_op_detector = null;
            }
            this.bee.current_sst.clearDetectorFrame();
        }
    }

}

export { OP }
