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

    // Indices of all flashes in the same ±80 ns group as `idx`.  When the op
    // JSON has no op_flash_group (older files / single-flash case), the group
    // is just the flash itself, so all behavior below stays backward compatible.
    groupMembers(idx) {
        let g = this.data.op_flash_group;
        if (!g) return [idx];
        let members = [];
        for (let i = 0; i < g.length; i++) { if (g[i] === g[idx]) members.push(i); }
        return members;
    }

    // Group id of a flash; the flash's own index when op_flash_group is absent,
    // so matched-flash stepping behaves exactly as before in that case.
    flashGroup(idx) {
        return this.data.op_flash_group ? this.data.op_flash_group[idx] : idx;
    }

    // Union of matched cluster ids over the current flash's group.
    currentMatchingIds() {
        let ids = [];
        for (let i of this.groupMembers(this.currentFlash)) {
            let cids = this.data.op_cluster_ids[i];
            if (cids) { for (let c of cids) { if (!ids.includes(c)) ids.push(c); } }
        }
        return ids;
    }

    // Element-wise sum of a per-channel array (op_pes / op_pes_pred) over the
    // group's flashes.  Channels are disjoint per TPC and every flash carries a
    // full per-channel vector, so the sum is the union across both TPC sides.
    combinedPes(members, key) {
        if (members.length === 1) return this.data[key][members[0]];
        let out = [];
        for (let i of members) {
            let arr = this.data[key][i];
            if (!arr) continue;
            for (let ch = 0; ch < arr.length; ch++) { out[ch] = (out[ch] || 0) + arr[ch]; }
        }
        return out;
    }

    draw() {
        let currentFlash = this.currentFlash;
        let members = this.groupMembers(currentFlash);
        let t = this.data.op_t[currentFlash];
        let peTotal = this.data.op_peTotal[currentFlash];
        let pes = this.combinedPes(members, 'op_pes');
        let pes_pred = this.combinedPes(members, 'op_pes_pred');
        let driftV = this.store.experiment.tpc.driftVelocity;
        // console.log(currentFlash, t, peTotal, driftV * t);

        if(this.group_op != null) { this.bee.scene3d.scene.main.remove(this.group_op) }
        this.group_op = new THREE.Group();

        for (let iTPC=0; iTPC<this.store.experiment.nTPC(); iTPC++) {
            // console.log(this.store.experiment.halfXYZ(iTPC), this.store.experiment.center(iTPC), this.store.experiment.driftDir(iTPC));
            let boxhelper = new THREE.Object3D;

            let exp = this.store.experiment;
            let [halfx, halfy, halfz] = this.store.experiment.halfXYZ(iTPC);
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
            let sx = exp.center(iTPC)[0]+driftV*t*this.store.experiment.driftDir(iTPC); // shifted x location
            boxhelper.position.set(...exp.toLocalXYZ(sx, exp.center(iTPC)[1], exp.center(iTPC)[2]));
            this.group_op.add(boxhelper);
    
            let location = this.store.experiment.op.location;
            let nDet = this.store.experiment.op.nDet;
            if (this.store.experiment.name == "sbnd") {
                for (let i=0; i<nDet; i++) {
                    if (this.store.experiment.opTPC(i) != iTPC) continue;
                    let detType = location[i][3] == undefined ? 1 : location[i][3];
                    let sox = location[i][0]+driftV*t*this.store.experiment.driftDir(iTPC); // shifted op x location
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
                        this.group_op.add(circle);
                    }
                    else if (detType == 2) {
                        let xara = new THREE.LineSegments(
                            new THREE.EdgesGeometry(new THREE.PlaneGeometry(10, 7.5)), 
                            new THREE.LineBasicMaterial({color: 0xbbbbbb})
                        );
                        xara.rotation.y = Math.PI / 2;
                        xara.position.set(...exp.toLocalXYZ(sox, location[i][1], location[i][2]));
                        this.group_op.add(xara);
                    }
        
                    if (this.store.config.op.showPMTClone) {
                        let circle2 =circle.clone();
                        circle2.rotation.x = Math.PI / 2;
                        circle2.rotation.y = 0;
                        circle2.position.x = boxhelper.position.x + exp.toLocalXYZ(...location[i])[1];
                        circle2.position.y = boxhelper.position.y + halfy;
                        this.group_op.add(circle2);
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
                    let sox = location[i][0]+driftV*t*this.store.experiment.driftDir(iTPC); // shifted op x location
                    circle.position.set(...exp.toLocalXYZ(sox, location[i][1], location[i][2]));
                    this.group_op.add(circle);
        
                    if (this.store.config.op.showPMTClone) {
                        let circle2 =circle.clone();
                        circle2.rotation.x = Math.PI / 2;
                        circle2.rotation.y = 0;
                        circle2.position.x = boxhelper.position.x + exp.toLocalXYZ(...location[i])[1];
                        circle2.position.y = boxhelper.position.y + halfy;
                        this.group_op.add(circle2);
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
                    let sox = location[i][0]+driftV*t*this.store.experiment.driftDir(iTPC); // shifted op x location
                    circle.position.set(...exp.toLocalXYZ(sox, location[i][1], location[i][2]));
                    this.group_op.add(circle);
    
                    if (this.store.config.op.showPMTClone) {
                        let circle2 =circle.clone();
                        circle2.rotation.x = Math.PI / 2;
                        circle2.rotation.y = 0;
                        circle2.position.x = boxhelper.position.x + exp.toLocalXYZ(...location[i])[1];
                        circle2.position.y = boxhelper.position.y + halfy;
                        this.group_op.add(circle2);
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
                            let sox = location[i][0]+driftV*t*this.store.experiment.driftDir(iTPC); // shifted op x location
                            circle_pred.position.set(...exp.toLocalXYZ(sox, location[i][1]-halfy*2, location[i][2]));
                            this.group_op.add(circle_pred);
                        }
                    }
                    catch(err) {
                        // console.log(err);
                    }
                }
    
            }
        }


        if (this.store.config.op.matchTiming) {
            this.bee.current_sst.drawInsideSlice(boxhelper.position.x-halfx, 2*halfx);
        }
        else {
            this.bee.current_sst.drawInsideThreeFrames();
        }

        this.bee.scene3d.scene.main.add(this.group_op);

        if(this.store.config.helper.showSCB) {
            this.bee.scene3d.drawSpaceChargeBoundary(driftV*t);
        }

        // add status bar text: one line per flash in the group, TPC-labeled
        // when the op JSON carries an `apa` array.
        let apa = this.data.apa;
        let lines = members.map(i =>
            `#${i}: (${this.data.op_t[i]} us, ${this.data.op_peTotal[i]} pe)` +
            (apa ? ` TPC${apa[i]}` : ''));
        this.store.dom.el_statusbar.html(lines.join('<br/>'));
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
               '<br/>matching: ' + this.currentMatchingIds()
            )
        }

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
        let startGroup = this.flashGroup(this.currentFlash);
        let n = 0;
        do {
            if (this.currentFlash < this.data.op_t.length - 1) { this.currentFlash += 1 }
            else { this.currentFlash = 0 }
            if (++n > this.data.op_t.length) break;
        } while (this.data.op_cluster_ids[this.currentFlash].length == 0
                 || this.flashGroup(this.currentFlash) === startGroup)
        this.drawMachingCluster();
    }

    prevMatching() {
        // this.enableMachingCluster();
        let startGroup = this.flashGroup(this.currentFlash);
        let n = 0;
        do {
            if (this.currentFlash > 0) { this.currentFlash -= 1 }
            else { this.currentFlash = this.data.op_t.length - 1 }
            if (++n > this.data.op_t.length) break;
        } while (this.data.op_cluster_ids[this.currentFlash].length == 0
                 || this.flashGroup(this.currentFlash) === startGroup)
        this.drawMachingCluster();
    }

    nextMatchingBeam() {
        let startGroup = this.flashGroup(this.currentFlash);
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
            || this.flashGroup(this.currentFlash) === startGroup
            || this.data.op_t[this.currentFlash] < this.store.experiment.op.beamTimeMin
            || this.data.op_t[this.currentFlash] > this.store.experiment.op.beamTimeMax
        )
        if (n <= this.data.op_t.length) { this.drawMachingCluster() }
        else { this.store.dom.el_statusbar.html('No matching flash found inside beam window') }
        
    }

    nextMatchingNUMI() {
        let startGroup = this.flashGroup(this.currentFlash);
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
            || this.flashGroup(this.currentFlash) === startGroup
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
        }
    }

}

export { OP }