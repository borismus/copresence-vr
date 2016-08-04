var AudioRenderer = require('./audio-renderer');
var ChatRenderer = require('./chat-renderer');
var FirebaseSignal = require('./firebase-signal');
var PeerConnection = require('./peer-connection-rtc');
var PeerRenderer = require('./peer-renderer');
var Pose = require('./pose');
var TWEEN = require('tween.js');
var Util = require('./util');

// Globals.
window.chatRenderer = null;
// Firebase signalling channel.
var fb;

// Array of all peer connections.
peerConnections = [];
// Objects keyed on remotePeerId, of AudioRenderer and PeerRenderer objects.
audioRenderers = {};
peerRenderers = {};

var rafID;
var lastSentPose;
var lastSentTime = performance.now();

var POSE_UPDATE_MS = 25;

function onLoad() {
  // Ensure that we are either in a localhost or secure environment.
  if (window.location.hostname !== 'localhost' && window.location.protocol !== 'https:') {
    window.location.protocol = 'https';
  }

  // Create the signal server.
  initSignalling();

  // Establish a new peer connection with the signal server.
  createPeerConnection();

  callButton = document.querySelector('button#call');
  callButton.disabled = true;

  // Hook up the call button.
  callButton.addEventListener('click', onCall);

  // Hook up the name change thing.
  var nameInput = document.querySelector('input#name');
  if (localStorage.username) {
    nameInput.value = localStorage.username;
  }
  nameInput.addEventListener('keyup', onUsernameChange);
  nameInput.addEventListener('blur', onUsernameChange);
}

function initSignalling() {
  fb = new FirebaseSignal();

  if (localStorage.username) {
    fb.setUsername(localStorage.username);
  }

  // Show all available users.
  fb.on('userschange', onUsersChange);
  fb.on('peerleave', onPeerLeave);
}

function onResize() {
  if (chatRenderer) {
    chatRenderer.onResize();
  }
}

function onUsersChange(users) {
  //console.log('onUsersChange', users);
  var userList = document.querySelector('#user-list');
  userList.innerHTML = '';
  var rooms = {};
  for (var id in users) {
    var user = users[id];
    // Ignore yourself.
    if (id == fb.getOwnPeerId()) {
      continue;
    }
    // If the user is in a room,
    if (user.roomId) {
      // Make the room if it doesn't exist yet.
      if (!rooms[user.roomId]) {
        rooms[user.roomId] = [];
      }
      // And add the user to the room.
      rooms[user.roomId].push(user);
      continue;
    }
    var displayName = user.username || id;
    var li = createUser(displayName, {userId: id});
    userList.appendChild(li);
  }

  // Iterate through rooms.
  for (var roomId in rooms) {
    var room = rooms[roomId];
    var displayName = room.map(function(user) { return user.username }).join(' & ');
    var li = createUser(displayName, {roomId: roomId});
    userList.appendChild(li);
  }

  if (userList.children.length === 0) {
    var li = createUser('No users yet.');
    userList.appendChild(li);
  }
}

function onPeerLeave(e) {
  var peerId = e.peerId;
  console.log('onPeerLeave', peerId);
  // TODO(smus): Make this work for more than one peer.
  
  // TODO: Render the peer leaving for the right peer.
  peerRenderers[peerId].leave();
  delete peerRenderers[peerId];
  delete audioRenderers[peerId];

  // Close the local stream for the correct peer.
  for (var i = 0; i < peerConnections.length; i++) {
    var pc = peerConnections[i];
    if (pc.remotePeerId == e.peerId) {
      pc.close();
      // And destroy the peer connection.
      peerConnections.splice(i, 1);
    }
  }

  // If we are the last peer, disband the room.
  fb.getPeersInRoom(e.roomId).then(function(peers) {
    if (Util.length(peers) <= 1) {
      // Notify the signalling server.
      fb.leaveRoom();

      // Destroy the main renderer and stop animating.
      chatRenderer.destroy();
      chatRenderer = null;

      cancelAnimationFrame(rafID);
    }
  });
}

function onUsernameChange(e) {
  console.log('onUsernameChange', e);
  var username = e.target.value;
  localStorage.username = username;

  // Update the Firebase signal server.
  fb.setUsername(username);
}

function createUser(label, opt_info) {
  var li = document.createElement('li');
  li.classList.add('mdl-list__item');
  li.innerHTML = ['<span class="mdl-list__item-primary-content">',
    '<i class="material-icons mdl-list__item-icon">person</i>',
    label,
    '</span>'].join('\n');

  if (opt_info) {
    li.addEventListener('click', function(e) {
      onClickListItem(li, opt_info);
    });
  }
  return li;
}

function onClickListItem(li, opt_info) {
  li.style.background = 'lightblue';
  callButton.disabled = false;
  selectedInfo = opt_info;

  // Unselect everything else.
  var userList = document.querySelector('#user-list');
  for (var i = 0; i < userList.children.length; i++) {
    var thisLi = userList.children[i];
    if (li != thisLi) {
      thisLi.style.background = 'white';
    }
  }
}

function createPeerConnection() {
  var pc = new PeerConnection(fb);

  pc.on('open', function(remotePeerId) {
    // Create a chat renderer if there isn't one currently.
    if (!window.chatRenderer) {
      window.chatRenderer = new ChatRenderer();
      render();
    }

    // If we aren't the caller, spawn a new connection.
    if (!pc.isCaller) {
      createPeerConnection();
    }

    var pr = new PeerRenderer(window.chatRenderer.scene, pc.remotePeerId);
    peerRenderers[remotePeerId] = pr;

    // Render the peer entering.
    pr.enter();
  });

  pc.on('data', function(data) {
    var jsonObject = JSON.parse(data);
    if (jsonObject.type == 'pose') {
      var pose = Pose.fromJsonObject(jsonObject.data);
      peerRenderers[pc.remotePeerId].setPeerPose(pose);
      audioRenderers[pc.remotePeerId].setPeerPose(pose);
    }
  });

  // When a remote stream is available, render it via Web Audio.
  pc.on('remoteStream', function(stream) {
    var audio = new Audio();
    audio.muted = true;
    audio.src = URL.createObjectURL(stream);

    var ar = new AudioRenderer();
    ar.setRemoteStream(stream);
    audioRenderers[pc.remotePeerId] = ar;
  });

  peerConnections.push(pc);

  return pc;
}

function onCall() {
  if (selectedInfo.userId) {
    // Use the last peer connection. Assume one always exists.
    var pc = peerConnections[peerConnections.length - 1];

    // Connect to a single user.
    pc.connect(selectedInfo.userId).then(function() {
      // The caller tells the signaling server to join the room.
      fb.createRoom(selectedInfo.userId);

      // Create another peer connection in case someone connects to us.
      createPeerConnection();
    });
  } else if (selectedInfo.roomId) {

    // Get the list of peers connected to the room.
    fb.getPeersInRoom(selectedInfo.roomId).then(function(peers) {

      // Create multiple peer connections in the series.
      var peerIds = [];
      for (var peerId in peers) {
        peerIds.push(peerId);
      }

      // TODO: Generalize to N peers.
      var promise = connectUsingNewPeerConnection(peerIds[0])();
      for (var i = 1; i < peerIds.length; i++) {
        promise = promise.then(connectUsingNewPeerConnection(peerIds[1]));
      }

      promise.then(function() {
        fb.joinRoom(selectedInfo.roomId);

        // Create another peer connection in case someone connects to us.
        createPeerConnection();
      });
    });
  }
}

function connectUsingNewPeerConnection(peerId) {
  return function() {
    return new Promise(function(resolve, reject) {
      console.log('Connecting to peer %s.', peerId);
      var pc = createPeerConnection();
      pc.on('ready', function() {
        pc.connect(peerId).then(resolve, reject);
      });
    });
  };
};

function render() {
  window.chatRenderer.render();

  // Get the current pose, and send it to the peer, but only if it's changed.
  var now = performance.now();
  var lastMessageDelta = now - lastSentTime;
  var pose = window.chatRenderer.getPose();
  var state = null;
  if (!pose.equals(lastSentPose) && lastMessageDelta > POSE_UPDATE_MS) {
    var state = {
      type: 'pose',
      data: pose.toJsonObject()
    };
    lastSentPose = pose;
    lastSentTime = now;
  }

  for (var i = 0; i < peerConnections.length; i++) {
    var pc = peerConnections[i];
    // Sometimes peerConnections aren't connected.
    if (!pc.isConnected()) {
      continue;
    }

    // If there is state to send, send it to active peer connections.
    if (state) {
      console.log('Sent state', state);
      pc.send(JSON.stringify(state));
    }

    // Set the pose of the observer in the audio renderer.
    var ar = audioRenderers[pc.remotePeerId]
    var pr = peerRenderers[pc.remotePeerId];
    if (ar && pr) {
      ar.setPose(pose);

      // Reflect your peer's audio level in the peer renderer.
      pr.setPeerAudioLevel(ar.getLevel());
    }
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
