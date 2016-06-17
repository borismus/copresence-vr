var PitchShift = require('soundbank-pitch-shift');

/**
 * Adds effects to audio streams. Mainly this is around spatialization of the
 * other peer's voice, but effects can also be applied.
 *
 * Functionality:
 *   Set position and orientation of listener based on your own position.
 *   Set position and orientation of the peer.
 *   Change pitch of the peer.
 */
function AudioRenderer(stream) {
  var context = new AudioContext();
  var peerInput = context.createMediaStreamSource(stream);
  var panner = context.createPanner();
  panner.panningModel = 'HRTF';

  var pitchShift = PitchShift(context);
  window.pitchShift = pitchShift;

  peerInput.connect(pitchShift);
  pitchShift.connect(panner);
  panner.connect(context.destination);

  this.context = context;
  this.panner = panner;
  this.pitchShift = pitchShift;

  this.forward = new THREE.Vector3();
  
  this.scale = 1.5;
  this.peerScale = 1.5;
}

AudioRenderer.prototype.setPose = function(pose) {
  // Set position and orientation on the observer.
  // TODO(smus): Move to non-deprecated context.listener.positionX.value once
  // it's implemented in Chrome.
  var pos = pose.position;
  this.context.listener.setPosition(pos.x, pos.y, pos.z);

  var forward = this.forward.set(0, 0, -1);
  forward.applyQuaternion(pose.quaternion);
  this.context.listener.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);

  this.scale = pose.scale;
  this.setPeerPitch_();
};

AudioRenderer.prototype.setPeerPose = function(peerPose) {
  // Set position and orientation on the panner.
  var pos = peerPose.position;
  this.panner.setPosition(pos.x, pos.y, pos.z);

  var forward = this.forward.set(0, 0, -1);
  forward.applyQuaternion(peerPose.quaternion);
  this.panner.setOrientation(forward.x, forward.y, forward.z);

  this.peerScale = peerPose.scale;
  this.setPeerPitch_();
};

AudioRenderer.prototype.setPeerPitch_ = function() {
  var speed = this.scale / this.peerScale;
  var semitones = 5 * Math.log10(speed);
  console.log('Transposing by %s semitones', semitones);
  this.pitchShift.transpose = semitones;
};

module.exports = AudioRenderer;
