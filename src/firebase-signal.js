var EventEmitter = require('eventemitter3');
var Firebase = require('firebase');
var Util = require('./util');

var config = {
  apiKey: "AIzaSyBoFE5PciBtALg0TcUlCphjsqytNbwapEQ",
  authDomain: "copresence-vr.firebaseapp.com",
  databaseURL: "https://copresence-vr.firebaseio.com",
  storageBucket: "",
};
firebase.initializeApp(config);

/**
 * A Firebase implementation of a signalling server for establishing 1:1 WebRTC
 * connections.
 *
 * Functionality:
 *   List online users.
 *   Determine which users can be connected to (ie. aren't busy chatting).
 *   Connect to a peer.
 *   Disconnect from a peer.
 *   Send a message.
 *
 * Events:
 *   message: Received a message.
 *   userschange: List of connected users changed.
 *   peerleave: A peer from the current room has left.
 */
function FirebaseSignal() {
  this.registerSelf_();

  // Register callbacks for when the list of online users changes.
  this.watchUsers_();

  // Register for signaling server messages.
  this.messageRef = this.userRef.child('message');
  this.watchMessages_();
}

FirebaseSignal.prototype = new EventEmitter();

/**
 * Connect to a user by user ID, creating a new room.
 *
 * @return {Firebase.ref} Firebase ref to the new room.
 */
FirebaseSignal.prototype.createRoom = function(remotePeerId) {
  var self = this;

  this.usersRef.once('value', function(snapshot) {
    var users = snapshot.val();
    var ownPeerId = self.getOwnPeerId();
    // Make sure the peer is available.
    if (users[remotePeerId].roomId) {
      console.error('Cannot connect: peer %s is already in a room.', remotePeerId);
      return;
    }
    if (users[ownPeerId].roomId) {
      console.error('Cannot connect: already in a room.');
      return;
    }
    // Create a new room for these users.
    var roomRef = self.roomsRef.push();
    roomRef.set(true);
    var roomId = roomRef.getKey();

    // Set the room on both the current user and the remote user.
    self.userRef.update({roomId: roomId});
    self.usersRef.child(remotePeerId).update({roomId: roomId});
  });
};

FirebaseSignal.prototype.joinRoom = function(roomId) {
  this.userRef.update({roomId: roomId});
};

/**
 * @return {Promise} The peers that are currently in the specified room.
 */
FirebaseSignal.prototype.getPeersInRoom = function(roomId) {
  var self = this;
  return new Promise(function(resolve, reject) {
    self.usersRef.once('value', function(snapshot) {
      var result = {};
      var users = snapshot.val();
      for (var uid in users) {
        if (users[uid].roomId == roomId) {
          result[uid] = users[uid];
        }
      }
      resolve(result);
    });
  });
};

FirebaseSignal.prototype.leaveRoom = function() {
  var self = this;

  this.userRef.once('value', function(snapshot) {
    var roomId = snapshot.val().roomId;

    if (!roomId) {
      console.error('Cannot leave room: not currently in any room.');
      return;
    }

    // Remove the room ref from the user.
    self.userRef.child('roomId').remove();

    self.removeRoomIfEmpty_(roomId);
  });
};

FirebaseSignal.prototype.setUsername = function(name) {
  this.userRef.update({username: name});
};

/**
 * @param uid {String} The user ID to send the message to.
 * @param message {Object} A serializable object.
 */
FirebaseSignal.prototype.send = function(uid, message) {
  var message = this.usersRef.child(uid).child('message').push(message);
};

FirebaseSignal.prototype.getOwnPeerId = function() {
  return this.userRef.getKey();
};

/**
 * Debug only.
 */
FirebaseSignal.prototype.clear = function() {
  this.usersRef.set({});
};

FirebaseSignal.prototype.registerSelf_ = function() {
  var self = this;

  // Register our peer ID and user name with the Firebase.
  this.usersRef = firebase.database().ref('user');
  this.roomsRef = firebase.database().ref('room');

  this.userRef = this.usersRef.push();

  // Unregister once we disconnect.
  this.userRef.onDisconnect().remove();
};

/**
 * Register callback for when the user list changed so that the UI can be
 * updated.
 */
FirebaseSignal.prototype.watchUsers_ = function() {
  var self = this;

  // Notify if the user list has changed.
  this.usersRef.on('value', function(snapshot) {
    self.emit('userschange', snapshot.val());
  });

  // Notify if a user from the same room has left.
  this.usersRef.on('child_removed', function(oldChildSnapshot) {
    var removedUser = oldChildSnapshot.val();
    var id = oldChildSnapshot.getKey();
    self.userRef.once('value', function(snapshot) {
      var user = snapshot.val();
      // If you or the leaving user didn't have a room, ignore.
      if (removedUser.roomId && user.roomId && removedUser.roomId === user.roomId) {
        // Only emit if they are from the same room.
        self.emit('peerleave', {peerId: id, roomId: removedUser.roomId});
      }
    });
  });
};

FirebaseSignal.prototype.watchMessages_ = function() {
  var self = this;
  this.messageRef.on('child_added', function(snapshot) {
    self.emit('message', snapshot.val());
    // Remove the message once it was delivered.
    snapshot.ref.remove();
  });
};

FirebaseSignal.prototype.removeRoomIfEmpty_ = function(roomId) {
  var self = this;
  this.getPeersInRoom(roomId).then(function(peers) {
    console.log(peers);
    // If there's just one peer in this room, it can be deleted.
    if (Util.length(peers) == 1) {
      self.roomsRef.child(roomId).remove();
    }
  });
};


module.exports = FirebaseSignal;
