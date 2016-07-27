var AudioRenderer = require('./audio-renderer');
var ChatRenderer = require('./chat-renderer');
var FirebaseSignal = require('./firebase-signal');
var PeerConnection = require('./peer-connection');
var PeerRenderer = require('./peer-renderer');
var Pose = require('./pose');
var TWEEN = require('tween.js');
var Util = require('./util');

// Globals.
var audioRenderer = new AudioRenderer();
var chatRenderer;
// For now, just one peer renderer, but ultimately we will have one per peer.
var peerRenderer;
var fb;
var lastSentPose;
var lastSentTime = performance.now();
//var pc;
var rafID;
var remoteStream;

var POSE_UPDATE_MS = 50;

function onLoad() {
  // Ensure that we are either in a localhost or secure environment.
  if (window.location.hostname !== 'localhost' && window.location.protocol !== 'https:') {
    window.location.protocol = 'https';
  }
  // Establish a new peer connection.
  startPeerConnection();

  callButton = document.querySelector('button#call');
  callButton.disabled = true;

  // Hook up the call button.
  callButton.addEventListener('click', onCallUser);

  // Hook up the name change thing.
  var nameInput = document.querySelector('input#name');
  if (localStorage.username) {
    nameInput.value = localStorage.username;
  }
  nameInput.addEventListener('keyup', onUsernameChange);
  nameInput.addEventListener('blur', onUsernameChange);
}

function startPeerConnection() {
  pc = new PeerConnection();

  pc.on('ready', function(peerId) {
    fb = new FirebaseSignal(peerId);
    if (localStorage.username) {
      fb.setUsername(localStorage.username);
    }

    // Show all available users.
    fb.on('usersChange', onUsersChange);
  });

  pc.on('open', function() {
    fb.connect();
    chatRenderer = new ChatRenderer();
    chatRenderer.on('scale', onScale);

    peerRenderer = new PeerRenderer(chatRenderer.scene);

    // Render the peer entering.
    peerRenderer.enter();
    render();
  });
  pc.on('close', function() {
    console.log('close');
    // Render the peer leaving.
    peerRenderer.leave();

    // Notify the signalling server.
    fb.disconnect();
    chatRenderer.destroy();
    cancelAnimationFrame(rafID);

    // Kill the remote stream.
    var track = remoteStream.getTracks()[0];
    track.stop();
  });

  pc.on('data', function(data) {
    var jsonObject = JSON.parse(data);
    if (jsonObject.type == 'pose') {
      var pose = Pose.fromJsonObject(jsonObject.data);
      peerRenderer.setPeerPose(pose);
      if (audioRenderer) {
        audioRenderer.setPeerPose(pose);
      }
    }
  });

  // When a remote stream is available, render it via Web Audio.
  pc.on('remoteStream', function(stream) {
    var audio = new Audio();
    audio.muted = true;
    audio.src = URL.createObjectURL(stream);
    audioRenderer.setRemoteStream(stream);
    remoteStream = stream;
  });
}

function onResize() {
  chatRenderer.onResize();
}

function onUsersChange(users) {
  console.log('onUsersChange', users);
  var userList = document.querySelector('#user-list');
  userList.innerHTML = '';
  for (var id in users) {
    var user = users[id];
    // Ignore yourself, and users that aren't available.
    if (user.peerId == pc.getPeerId() || !user.isAvailable) {
      continue;
    }
    var li = createUser(user);
    userList.appendChild(li);
  }
}

function onScale(newScale, oldScale) {
  // Playback a sound effect.
}

function onUsernameChange(e) {
  console.log('onUsernameChange', e);
  var username = e.target.value;
  localStorage.username = username;

  // Update the Firebase signal server.
  fb.setUsername(username);
}

function createUser(user) {
  var displayName = user.username || user.peerId;
  var li = document.createElement('li');
  li.classList.add('mdl-list__item');
  li.innerHTML = ['<span class="mdl-list__item-primary-content">',
    '<i class="material-icons mdl-list__item-icon">person</i>',
    displayName,
    '</span>'].join('\n');

  li.addEventListener('click', function(e) {
    li.style.background = 'lightblue';
    callButton.disabled = false;
    selectedUser = user;
  });
  return li;
}

function onCallUser() {
  pc.connect(selectedUser.peerId);
}

function render() {
  chatRenderer.render();

  // Get the current pose, and send it to the peer, but only if it's changed.
  var now = performance.now();
  var lastMessageDelta = now - lastSentTime;
  var pose = chatRenderer.getPose();
  if (!pose.equals(lastSentPose) && lastMessageDelta > POSE_UPDATE_MS) {
    var message = {
      type: 'pose',
      data: pose.toJsonObject()
    };
    pc.send(JSON.stringify(message));
    lastSentPose = pose;
    lastSentTime = now;
    console.log('Sent pose', pose);
  }

  if (audioRenderer) {
    audioRenderer.setPose(pose);
    peerRenderer.setPeerAudioLevel(audioRenderer.getLevel());
  }

  TWEEN.update();

  rafID = requestAnimationFrame(render);
}

function onKeyUp(e) {
  switch (e.keyCode) {
  }
}

window.addEventListener('load', onLoad);
window.addEventListener('resize', onResize);
window.addEventListener('keyup', onKeyUp);
