var AudioRenderer = require('./audio-renderer');
var ChatRenderer = require('./chat-renderer');
var FirebaseSignal = require('./firebase-signal');
var PeerConnection = require('./peer-connection');
var Pose = require('./pose');
var Util = require('./util');

// Globals.
var audioRenderer;
var chatRenderer;
var fb;
var lastSentPose;
var pc;
var rafID;

function onLoad() {
  pc = new PeerConnection();
  pc.on('ready', function(peerId) {
    fb = new FirebaseSignal(peerId);

    // Show all available users.
    fb.on('usersChanged', onUsersChanged);
  });

  pc.on('opened', function() {
    fb.connect();
    chatRenderer = new ChatRenderer();
    chatRenderer.on('scale', onScale);
    render();
  });
  pc.on('disconnected', function() {
    fb.disconnect();
    chatRenderer.destroy();
    cancelAnimationFrame(rafID);
  });

  pc.on('data', function(data) {
    var jsonObject = JSON.parse(data);
    if (jsonObject.type == 'pose') {
      var pose = Pose.fromJsonObject(jsonObject.data);
      chatRenderer.setPeerPose(pose);
      if (audioRenderer) {
        audioRenderer.setPeerPose(pose);
      }
    }
  });

  // When a remote stream is available, render it via Web Audio.
  pc.on('remoteStream', function(stream) {
    var video = document.querySelector('video#remote');
    video.muted = true;
    video.src = URL.createObjectURL(stream);
    audioRenderer = new AudioRenderer(stream);
  });

  callButton = document.querySelector('button#call');
  callButton.disabled = true;

  callButton.addEventListener('click', onCallUser);
}

function onUsersChanged(users) {
  console.log('onUsersChanged', users);
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

function createUser(user) {
  var li = document.createElement('li');
  li.classList.add('mdl-list__item');
  li.innerHTML = ['<span class="mdl-list__item-primary-content">',
    '<i class="material-icons mdl-list__item-icon">person</i>',
    user.peerId,
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
  var pose = chatRenderer.getPose();
  if (!pose.equals(lastSentPose)) {
    var message = {
      type: 'pose',
      data: pose.toJsonObject()
    };
    pc.send(JSON.stringify(message));
    lastSentPose = pose;
    console.log('Sent pose', pose);
  }

  if (audioRenderer) {
    audioRenderer.setPose(pose);
  }

  rafID = requestAnimationFrame(render);
}

window.addEventListener('load', onLoad);
