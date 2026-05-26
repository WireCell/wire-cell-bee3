importScripts('lib/three.min.js');

onmessage = function(e) {
  var data = e.data.vertices;
  var geo = e.data.geo;
  var center_y = geo.center_y;
  var center_z = geo.center_z;

  // Support both legacy {halfx} and new {anode_x, anode_dx} geo fields.
  // Legacy: extrude from -halfx to -halfx+2 (union outer-anode, 2 cm slab).
  // New:    extrude from anode_x to anode_x+anode_dx (per-TPC anode face).
  var x0, x1;
  if (geo.anode_x !== undefined) {
    x0 = geo.anode_x;
    x1 = geo.anode_x + geo.anode_dx;
  } else {
    x0 = -geo.halfx;
    x1 = -geo.halfx + 2;
  }

  var extrudeSettings = {
      steps           : 100,
      bevelEnabled    : false,
      extrudePath     : null
  };

  var mergedGeometry = new THREE.Geometry();
  for (var i=0; i<data.length; i++) {
      var pts = [];
      var raw_pts = data[i];
      var cy = 0;
      var cz = 0;
      for (var j = 0; j < raw_pts.length; j ++ ) {
          cy += raw_pts[j][0];
          cz += raw_pts[j][1];
      }
      cy /= raw_pts.length;
      cz /= raw_pts.length;
      for (var j = 0; j < raw_pts.length; j ++ ) {
          pts.push( new THREE.Vector2(-raw_pts[j][1]+cz, raw_pts[j][0]-cy) );
      }
      var spline = new THREE.SplineCurve3( [
          new THREE.Vector3( x0, cy-center_y,  cz-center_z),
          new THREE.Vector3( x1, cy-center_y,  cz-center_z),
      ] );
      extrudeSettings.extrudePath = spline;
      var shape = new THREE.Shape(pts);
      var geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      mergedGeometry.merge(geometry);
  }
  var bufferGeometry = new THREE.BufferGeometry().fromGeometry(mergedGeometry);
  postMessage({
    position: bufferGeometry.attributes.position.array,
    normal: bufferGeometry.attributes.normal.array
  });
  return close();
}
