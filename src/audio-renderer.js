var PitchShift = require('soundbank-pitch-shift');
var SfxPlayer = require('./sfx-player');

/**
 * Adds effects to audio streams. Mainly this is around spatialization of the
 * other peer's voice, but effects can also be applied.
 *
 * Functionality:
 *   Set position and orientation of listener based on your own position.
 *   Set position and orientation of the peer.
 *   Change pitch of the peer.
 */
function AudioRenderer() {
  var context = new AudioContext();
  var panner = context.createPanner();
  panner.panningModel = 'HRTF';
  // Increase the refDistance.
  panner.refDistance = 10;

  var pitchShift = PitchShift(context);
  window.pitchShift = pitchShift;

  pitchShift.connect(panner);
  panner.connect(context.destination);

  this.context = context;
  this.panner = panner;
  this.pitchShift = pitchShift;
  // No transpose by default.
  this.pitchShift.transpose = 0;

  this.forward = new THREE.Vector3();
  
  this.scale = 1.5;
  this.peerScale = 1.5;

  this.sfxPlayer = new SfxPlayer(this.context);
}

AudioRenderer.prototype.setRemoteStream = function(stream) {
  var peerInput = this.context.createMediaStreamSource(stream);
  peerInput.connect(this.pitchShift);
};

AudioRenderer.prototype.setPose = function(pose) {
  // Set position and orientation on the observer.
  // TODO(smus): Move to non-deprecated context.listener.positionX.value once
  // it's implemented in Chrome.
  var pos = pose.position;
  this.context.listener.setPosition(pos.x, pos.y, pos.z);

  var forward = this.forward.set(0, 0, -1);
  forward.applyQuaternion(pose.quaternion);
  this.context.listener.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);

  var oldScale = this.scale;
  this.scale = pose.scale;

  // Play the appropriate sound effect.
  if (this.scale > oldScale) {
    this.playLocalSound('grow');
  }
  if (this.scale < oldScale) {
    this.playLocalSound('shrink');
  }

  this.setPeerPitch_();
};

AudioRenderer.prototype.setPeerPose = function(peerPose) {
  // Set position and orientation on the panner.
  var pos = peerPose.position;
  this.panner.setPosition(pos.x, pos.y, pos.z);

  var forward = this.forward.set(0, 0, -1);
  forward.applyQuaternion(peerPose.quaternion);
  this.panner.setOrientation(forward.x, forward.y, forward.z);

  var oldScale = this.peerScale;
  this.peerScale = peerPose.scale;
  
  // Play a remote sound effect.
  if (this.peerScale > oldScale) {
    this.playRemoteSound('grow');
  }
  if (this.peerScale < oldScale) {
    this.playRemoteSound('shrink');
  }

  this.setPeerPitch_();
};

AudioRenderer.prototype.setPeerPitch_ = function() {
  var speed = this.scale / this.peerScale;
  var semitones = 5 * Math.log10(speed);
  if (this.pitchShift.transpose != semitones) {
    this.pitchShift.transpose = semitones;
  }
};

AudioRenderer.prototype.playRemoteSound = function(bufferName) {
  var source = this.sfxPlayer.createSource(bufferName);
  source.connect(this.pitchShift);
  source.start();
};

AudioRenderer.prototype.playLocalSound = function(bufferName) {
  var source = this.sfxPlayer.createSource(bufferName);
  source.connect(this.context.destination);
  source.start();
};


module.exports = AudioRenderer;
