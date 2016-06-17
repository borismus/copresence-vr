/**
 * The pose of a peer. 6DOF position and also scale.
 */
function Pose(opt_quaternion, opt_position, opt_scale) {
  this.position = opt_position ? opt_position.clone() : new THREE.Vector3();
  this.quaternion = opt_quaternion ? opt_quaternion.clone() : new THREE.Quaternion();
  this.scale = opt_scale ? opt_scale : 1;
}

Pose.prototype.equals = function(pose) {
  if (!pose) {
    return false;
  }
  return this.position.equals(pose.position) &&
      this.quaternion.equals(pose.quaternion) && this.scale == pose.scale;
};

Pose.prototype.toJsonString = function() {
  return JSON.stringify(this.toJsonObject());
};

Pose.prototype.toJsonObject = function() {
  // TODO: Reduce precision to 3 sig figs to save data.
  return {
    p: this.position.toArray(),
    q: this.quaternion.toArray(),
    s: this.scale
  };
};

/**
 * Given a serialized version of the pose, recreate it.
 */
Pose.fromJsonString = function(jsonString) {
  var json = JSON.parse(jsonString);
  return Pose.fromJsonObject(jsonObject);
};

Pose.fromJsonObject = function(json) {
  var out = new Pose();
  out.position.fromArray(json.p);
  out.quaternion.fromArray(json.q);
  out.scale = parseFloat(json.s);
  return out;
};

module.exports = Pose;
