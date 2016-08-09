var PitchShift = require('soundbank-pitch-shift');
var SfxPlayer = require('./sfx-player');
var VoiceActivityDetector = require('./voice-activity-detector');

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
  // Use the audio context if a global one exists.
  var context;
  if (window.audioContext) {
    context = window.audioContext;
  } else {
    context = new AudioContext();
  }
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

  // Play remote sound effects through the same pitch shifted channel, but do it
  // much quieter!
  this.remoteSfxGain = context.createGain();
  this.remoteSfxGain.gain.value = 0.4;
  this.remoteSfxGain.connect(pitchShift);

  this.forward = new THREE.Vector3();
  
  this.scale = 1;
  this.peerScale = 1;

  this.sfxPlayer = new SfxPlayer(context);
  this.vad = new VoiceActivityDetector(context);

  // Current audio level.
  this.currentLevel = null;
}

AudioRenderer.prototype.setRemoteStream = function(stream) {
  var self = this;

  var peerInput = this.context.createMediaStreamSource(stream);
  peerInput.connect(this.pitchShift);

  this.vad.setSource(peerInput);
  this.vad.on('active', function(e) {
    self.currentLevel = e;
  });

  this.vad.on('inactive', function(e) {
    self.currentLevel = null;
  });

  this.vad.on('power', function(e) {
    self.currentLevel = e;
  });
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
    this.playLocalSound_('grow');
  }
  if (this.scale < oldScale) {
    this.playLocalSound_('shrink');
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
    this.playRemoteSound_('grow');
  }
  if (this.peerScale < oldScale) {
    this.playRemoteSound_('shrink');
  }

  this.setPeerPitch_();
};

AudioRenderer.prototype.getLevel = function() {
  return this.currentLevel;
};

AudioRenderer.prototype.playRemoteSound_ = function(bufferName) {
  var source = this.sfxPlayer.createSource(bufferName);
  source.connect(this.remoteSfxGain);
  source.start();
};

AudioRenderer.prototype.playLocalSound_ = function(bufferName) {
  var source = this.sfxPlayer.createSource(bufferName);
  source.connect(this.context.destination);
  source.start();
};

AudioRenderer.prototype.setPeerPitch_ = function() {
  var speed = this.scale / this.peerScale;
  var semitones = 5 * Math.log10(speed);
  if (this.pitchShift.transpose != semitones) {
    this.pitchShift.transpose = semitones;
  }
};


module.exports = AudioRenderer;
