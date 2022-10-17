// event dispatcher

class Dispatcher {
    constructor(store, bee) {
        this.store = store;
        this.bee = bee;

        this.initKeyEvents();
        this.initClickEvents();
        this.initOtherEvents();
    }

    addClickEvent(jqObj, f, obj, eventName) {
        let name = eventName == null ? 'click' : eventName;
        jqObj.on(name, (e) => {
            e.preventDefault();
            f.call(obj, e);
        });
    }

    initKeyEvents() {
        Mousetrap.bindGlobal('esc', () => {
            $('input').blur(); // remove focus from input elements
            $('select').blur(); // remove focus from select elements
        });

        let scene3d = this.bee.scene3d;
        let camera = this.bee.scene3d.camera.active;

        Mousetrap.bind('x', () => { scene3d.yzView() });
        Mousetrap.bind('y', () => { scene3d.xzView() });
        Mousetrap.bind('z', () => { scene3d.xyView() });
        Mousetrap.bind('u', () => { scene3d.xuView() });
        Mousetrap.bind('v', () => { scene3d.xvView() });
        Mousetrap.bind('w', () => { scene3d.xwView() });
        Mousetrap.bind('r', () => { scene3d.resetCamera() });
        Mousetrap.bind('shift+f', () => { scene3d.play() });
        Mousetrap.bind('shift+up', () => { camera.zoom += 0.1; camera.updateProjectionMatrix() });
        Mousetrap.bind('shift+down', () => { camera.zoom -= 0.1; camera.updateProjectionMatrix() });

        Mousetrap.bind('=', () => { this.bee.current_sst.increaseOpacity(0.05) });
        Mousetrap.bind('-', () => { this.bee.current_sst.increaseOpacity(-0.05) });
        Mousetrap.bind('{', () => { this.bee.current_sst.increaseOpacity(-1) }); // fully transparent 
        Mousetrap.bind('}', () => { this.bee.current_sst.increaseOpacity(1) }); // fully opaque
        Mousetrap.bind('+', () => { this.bee.current_sst.increaseSize(0.5) });
        Mousetrap.bind('_', () => { this.bee.current_sst.increaseSize(-0.5) });
        Mousetrap.bind('o', () => { this.bee.redrawAllSST(true) });

        Mousetrap.bind('shift+n', () => { this.bee.gui.increaseEvent(1) });
        Mousetrap.bind('shift+p', () => { this.bee.gui.increaseEvent(-1) });
        Mousetrap.bind('q', () => { this.bee.gui.toggleCharge() });
        Mousetrap.bind('m', () => { this.bee.gui.toggleMC() });
        Mousetrap.bind('k', () => { this.bee.gui.nextSlice() });
        Mousetrap.bind('j', () => { this.bee.gui.nextSlice(-1) });
        Mousetrap.bind('b', () => { this.bee.gui.toggleBox() });
        Mousetrap.bind('shift+t', () => { this.bee.gui.nextTPC() });
        Mousetrap.bind('\\', () => { this.bee.gui.toggleScan() });


        if (null != this.bee.op) {
            Mousetrap.bind('<', () => { this.bee.op.prev() });
            Mousetrap.bind('>', () => { this.bee.op.next() });
            Mousetrap.bind(',', () => { this.bee.op.prevMatching() });
            Mousetrap.bind('.', () => { this.bee.op.nextMatching() });
            Mousetrap.bind('/', () => { this.bee.op.nextMatchingBeam() });
            Mousetrap.bind('\'', () => { this.bee.op.nextMatchingNUMI() });
        }

        for (let i = 1; i <= 9; i++) {
            Mousetrap.bind(i.toString(), (e, key) => {
                let index = Number(key) - 1;
                let sstList = this.store.event.sst;
                if (index > sstList.length - 1) { return }
                let sst = this.bee.sst.list[sstList[index]];
                if (sst) { sst.selected() }
            });
        }

        Mousetrap.bind('?', () => { $('#cmdModal').modal('show') });

    }

    initClickEvents() {
        let scene3d = this.bee.scene3d;

        this.addClickEvent($('#container'), scene3d.showIntersect, scene3d);
        this.addClickEvent($('#container'), scene3d.setTargetSphere, scene3d, 'dblclick');

        this.addClickEvent($('#toggleSidebar'), this.bee.gui.toggleSidebar, this.bee.gui);
        this.addClickEvent($('#toggleScan'), this.bee.gui.toggleScan, this.bee.gui);

        this.addClickEvent($('#preset-default'), this.bee.localstore.clearAndReload, this.bee.localstore);
    }

    initOtherEvents() {
        let scene3d = this.bee.scene3d;

        window.addEventListener('resize', () => {
            let scale = this.store.config.camera.scale;
            this.bee.scene3d.camera.active.aspect = window.innerWidth * scale / window.innerHeight;
            this.bee.scene3d.camera.active.updateProjectionMatrix();
            this.bee.scene3d.renderer.setSize(window.innerWidth * scale, window.innerHeight);
        }, false);

        if (screenfull.enabled) {
            window.addEventListener(screenfull.raw.fullscreenchange, () => {
                if (!screenfull.isFullscreen) { scene3d.stop() }
            });
        }

    }


}

export { Dispatcher }