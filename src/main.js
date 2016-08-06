var AudioRenderer = require('./audio-renderer');
var ChatRenderer = require('./chat-renderer');
var FirebaseSignal = require('./firebase-signal');
var PeerConnection = require('./peer-connection-rtc');
var PeerManager = require('./peer-manager');
var PeerRenderer = require('./peer-renderer');
var Pose = require('./pose');
var TWEEN = require('tween.js');
var Util = require('./util');

// Globals.
window.chatRenderer = null;
// Firebase signalling channel.
signal = null;
// Peer manager.
peerManager = null;

// Objects keyed on remotePeerId, of AudioRenderer and PeerRenderer objects.
audioRenderers = {};
peerRenderers = {};

var rafID;
var lastSentPose;
var lastSentTime = performance.now();

// How quickly to update dynamically changing pose.
var POSE_UPDATE_MS = 25;
// How quickly to send pose even if it remains unchanged.
var POSE_HEARTBEAT_MS = 1000;

function onLoad() {
  // Ensure that we are either in a localhost or secure environment.
  if (window.location.hostname !== 'localhost' && window.location.protocol !== 'https:') {
    window.location.protocol = 'https';
  }

  // Create the signal server.
  initSignalling();

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
  signal = new FirebaseSignal();
  peerManager = new PeerManager(signal);
  peerManager.on('connection', onPeerConnectionCreated);
  peerManager.createActiveConnection();

  if (localStorage.username) {
    signal.setUsername(localStorage.username);
  }

  // Show all available users.
  signal.on('userschange', onUsersChange);
  signal.on('peerleave', onPeerLeave);
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
    if (id == signal.getOwnPeerId()) {
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
  peerManager.disconnect(peerId);

  // If we are the last peer, disband the room.
  signal.getPeersInRoom(e.roomId).then(function(peers) {
    if (Util.length(peers) <= 1) {
      // Notify the signalling server.
      signal.leaveRoom();

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
  signal.setUsername(username);
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

function onPeerConnectionCreated(pc) {
  pc.on('open', function(remotePeerId) {
    // Create a chat renderer if there isn't one currently.
    if (!window.chatRenderer) {
      window.chatRenderer = new ChatRenderer();
      render();
    }

    var pr = new PeerRenderer(window.chatRenderer.scene, remotePeerId);
    peerRenderers[remotePeerId] = pr;

    // Assign the peer a random position on the field.
    var bbox = window.chatRenderer.getDimensions();
    var position = Util.randomPositionInBox(bbox);
    position.y = 0;
    window.chatRenderer.setPosition(position);

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
}

function onCall() {
  if (selectedInfo.userId) {
    // Connect to a single user using a new peer connection.
    connectUsingNewPeerConnection(selectedInfo.userId)().then(function() {
      // The caller tells the signaling server to join the room.
      signal.createRoom(selectedInfo.userId);
    });
  } else if (selectedInfo.roomId) {

    // Get the list of peers connected to the room.
    signal.getPeersInRoom(selectedInfo.roomId).then(function(peers) {
      // Create multiple peer connections in the series.
      var peerIds = [];
      for (var peerId in peers) {
        peerIds.push(peerId);
      }
      console.log('Establishing connections to %d peers.', peerIds.length);

      var promise = connectUsingNewPeerConnection(peerIds[0])();
      for (var i = 1; i < peerIds.length; i++) {
        promise = promise.then(connectUsingNewPeerConnection(peerIds[i]));
      }

      promise.then(function() {
        console.log('Connected to %d peers.', peerIds.length);
        signal.joinRoom(selectedInfo.roomId);
      });
    });
  }
}

function connectUsingNewPeerConnection(peerId) {
  return function() {
    return new Promise(function(resolve, reject) {
      console.log('Connecting to peer %s.', peerId);
      peerManager.connect(peerId).then(function(e) {
        console.log('Connection to peer %s established.', peerId);
        resolve();
      }, function(e) {
        console.error('Connection to peer %s failed: %s', peerId, e);
        reject();
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

  // Send the pose if it's changed (throttled), or send a rarer heartbeat (for
  // new clients).
  if (lastMessageDelta > POSE_HEARTBEAT_MS || 
      (!pose.equals(lastSentPose) && lastMessageDelta > POSE_UPDATE_MS)) {
    var state = {
      type: 'pose',
      data: pose.toJsonObject()
    };
    lastSentPose = pose;
    lastSentTime = now;
  }

  var peerConnections = peerManager.establishedPeerConnections;
  for (var i = 0; i < peerConnections.length; i++) {
    var pc = peerConnections[i];

    // If there is state to send, send it to active peer connections.
    if (state) {
      //console.log('Sent state to peer %s.', pc.remotePeerId);
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
