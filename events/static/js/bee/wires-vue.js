import { Wires } from './util/wires.js'

let wires = new Wires();

Vue.createApp({
    delimiters: ["[[", "]]"],
    data() {
      return { 
        anode: undefined,
        face: 0,
        plane: 0,
        wireId: 0,
        wireFirst: 0,
        wireLast: 0,
        channel: 0,
        headLoc: [0, 0, 0],
        tailLoc: [0, 0, 0],
        wireList: '',
      }
    },
    computed: {
      planeId() {
        let anode = parseInt(this.anode, 10);
        let face = parseInt(this.face, 10);
        let plane = parseInt(this.plane, 10);
        return anode * 3 * (face+1) + plane
      },

    },
    watch: {
      planeId(newVal) {
        // console.log(newVal)
        wires.drawWires({planeId: newVal})
        this.wireFirst = wires.plane(this.planeId).wires[0]
        this.wireLast = wires.plane(this.planeId).wires.slice(-1)[0]
      },
      
      wireId(newVal) {
        let wire = wires.wire(newVal)
        this.channel = wire.channel
        let head = wires.point(wire.head)
        this.headLoc = [Number(head.x.toFixed(2)), Number(head.y.toFixed(2)), Number(head.z.toFixed(2))]
        let tail = wires.point(wire.tail)
        this.tailLoc = [Number(tail.x.toFixed(2)), Number(tail.y.toFixed(2)), Number(tail.z.toFixed(2))]

        wires.drawWires({wireId: newVal})
      },

      wireList(newVal) {
        let finalList = []
        let commaList = newVal.split(',')

        for (let x of commaList) {
          if (x.includes(':')) {
            let colonList = x.split(':')
            if (colonList.length==2) { colonList.push(1) }
            if (colonList.length==3) {
              let start = parseInt(colonList[0], 10)
              let end = parseInt(colonList[1], 10)
              let step = parseInt(colonList[2], 10)
              for (let i=start; i<end; i+=step) {
                finalList.push(i)
              }
            }
          }
          else {
            finalList.push(parseInt(x, 10))
          }
        }
        wires.drawWires({wireList: finalList})
        //console.log(finalList)
      }

    },

    mounted() {
      wires.dataPromise.then(() => {
        this.anode = 0
        wires.drawWires({planeId: 0})
      })
    },
}).mount('#vue')