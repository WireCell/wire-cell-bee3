import { Wires } from './util/wires.js'

let wires = new Wires();
// console.log(wires)

Vue.createApp({
    delimiters: ["[[", "]]"],
    data() {
      return { 
        drawCenter: true,
        drawBoundary: false,
        anode: undefined,
        face: 0,
        plane: 0,
        wireId: 0,
        nWire: 0,
        chId: 0,
        nChannel: 0,
        chWires: [],
        wireFirst: 0,
        wireLast: 0,
        wireChannel: 0,
        headLoc: [0, 0, 0],
        tailLoc: [0, 0, 0],
        wireList: '',
        chList:'',
        url_image3d: '',
        planeIdx: 0,
        wipIdx: 0,
        wipGlobal: 0
      }
    },
    computed: {
      planeId() {
        let anode = parseInt(this.anode, 10);
        let face = parseInt(this.face, 10);
        let plane = parseInt(this.plane, 10);
        if (wires.store) {
            face = anode * wires.store.summary.facesPerAnode + face
            plane = face * wires.store.summary.planesPerFace + plane
            return plane
        }
        else {
            return -1
        }

      },

    },
    watch: {

      planeId(newVal) {
        // console.log(newVal)
        wires.drawWires({planeId: newVal})
        this.wireFirst = wires.plane(this.planeId).wires[0]
        this.wireLast = wires.plane(this.planeId).wires.slice(-1)[0]
        // console.log('planeId triggered')
      },
      
      wireId(newVal) {
        let wire = wires.wire(newVal)
        this.wireChannel = wire.channel
        let head = wires.point(wire.head)
        this.headLoc = [Number(head.x.toFixed(2)), Number(head.y.toFixed(2)), Number(head.z.toFixed(2))]
        let tail = wires.point(wire.tail)
        this.tailLoc = [Number(tail.x.toFixed(2)), Number(tail.y.toFixed(2)), Number(tail.z.toFixed(2))]
        this.drawWire()
      },

      wipIdx(newVal) {
        this.wipGlobal = wires.plane(this.planeIdx).wires[newVal]
        let wire = wires.wire(this.wipGlobal)
        this.wireChannel = wire.channel
        let head = wires.point(wire.head)
        this.headLoc = [Number(head.x.toFixed(2)), Number(head.y.toFixed(2)), Number(head.z.toFixed(2))]
        let tail = wires.point(wire.tail)
        this.tailLoc = [Number(tail.x.toFixed(2)), Number(tail.y.toFixed(2)), Number(tail.z.toFixed(2))]
        this.drawWIP()
      },

      chId(newVal) {
        this.chWires = wires.store.channels[newVal]
        this.drawChannel()
      },

      wireList() {
        this.drawWireList()
      },

      chList() {
        this.drawChList();
      }

    },

    methods: {
        drawWIP() {
          wires.drawWires({planeIdx: this.planeIdx, wipIdx: this.wipIdx})
        },
        drawWire() {
            wires.drawWires({wireId: this.wireId})
        },
        drawChannel() {
            wires.drawWires({wireList: this.chWires})
        },
        drawWireList() {
          let parsed = this.parseList(this.wireList)
          wires.drawWires({
            wireList: parsed.numberList, 
            colorList: parsed.colorList, 
            drawBoundary: this.drawBoundary,
            drawCenter: this.drawCenter
          })
        },
        drawChList() {
          let parsed = this.parseList(this.chList)
          wires.drawWires({chList: parsed.numberList, colorList: parsed.colorList})
        },
        drawImage3D() {
            wires.drawImage3D(this.url_image3d)
        },

        parseList(txt) {
            let finalList = []
            let colorList = []
            let commaList = txt.split(',')
            for (let x of commaList) {
              if (x.includes(':')) {
                let colonList = x.split(':')
                if (colonList.length==2) { colonList.push(1) }
                if (colonList.length>=3) {
                  let start = parseInt(colonList[0], 10)
                  let end = parseInt(colonList[1], 10)
                  let step = parseInt(colonList[2], 10)
                  if (colonList.length==3) {
                    for (let i=start; i<end; i+=step) {
                      finalList.push(i)
                      colorList.push('red')
                    }
                  }
                  else {
                    for (let i=start; i<end; i+=step) {
                      finalList.push(i)
                      colorList.push(colonList[3])
                    }
                  }

                }
              }
              else {
                finalList.push(parseInt(x, 10))
                colorList.push('red')
              }
            }
            // console.log(finalList, colorList)
            return {
              'numberList': finalList,
              'colorList': colorList
            }
        }
    },

    mounted() {
      wires.dataPromise.then(() => {
        this.anode = 0
        this.nWire = wires.store.summary.nWire
        this.nChannel = wires.store.summary.nChannel

        // anode => planeId => draw wires (trigger)
        // wires.drawWires({planeId: 0})
      })
    },
}).mount('#vue')