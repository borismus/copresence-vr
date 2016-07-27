var AudioRenderer = require('./audio-renderer');
var ChatRenderer = require('./chat-renderer');
var PeerRenderer = require('./peer-renderer');
var Pose = require('./pose');
var TWEEN = require('tween.js');

function onLoad() {
  audioRenderer = new AudioRenderer();
  chatRenderer = new ChatRenderer();
  peerRenderer = new PeerRenderer(chatRenderer.scene);

  // Stay at a distance, rotate toward me.
  peerRenderer.peer.position.set(0, 0, -5);
  peerRenderer.peer.rotation.y = Math.PI;

  // Get access to microphone and connect it up to the graph.
  navigator.webkitGetUserMedia({video: false, audio: true}, function(stream) {
    audioRenderer.setRemoteStream(stream);
  }, function(error) {
    console.log('GetUserMedia error', error);
  });

  requestAnimationFrame(render);
}

function render() {
  chatRenderer.render();

  TWEEN.update();

  if (audioRenderer) {
    var pose = chatRenderer.getPose();
    audioRenderer.setPose(pose);

    peerRenderer.setPeerAudioLevel(audioRenderer.getLevel());
  }

  requestAnimationFrame(render);
}

var scale = 1;
function onKeyUp(e) {
  console.log('keyCode', e.keyCode);
  var peer = peerRenderer.peer;
  switch (e.keyCode) {
    case 69: // E: enter.
      peerRenderer.enter();
      break;
    case 79: // L: leave.
      peerRenderer.leave();
      break;
    case 87: // W: walk.
      var pos = peerRenderer.peer.position.clone();
      pos.x += 1;
      peerRenderer.setPeerPose(new Pose(peer.quaternion, pos));
      break;
    case 83: // S: scale.
      scale *= 1.5;
      peerRenderer.setPeerPose(new Pose(peer.quaternion, peer.position, scale));
      break;
    case 68: // D: scale down.
      scale /= 1.5;
      peerRenderer.setPeerPose(new Pose(peer.quaternion, peer.position, scale));
      break;
    case 82: // R: rotate.
      var quat = peerRenderer.peer.quaternion;
      quat.setFromEuler(new THREE.Euler(0.1, Math.PI, 0));
      peerRenderer.setPeerPose(new Pose(quat, peer.position));
      break;
    case 80: // P: play.
      audioRenderer.playRemoteSound_('grow');
      break;
  }
}

function onResize() {
  chatRenderer.onResize();
}

window.addEventListener('load', onLoad);
window.addEventListener('keyup', onKeyUp);
window.addEventListener('resize', onResize);
