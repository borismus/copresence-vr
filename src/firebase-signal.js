var EventEmitter = require('eventemitter3');
var Firebase = require('firebase');

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
 */
function FirebaseSignal(peerId) {
  this.peerId = peerId;
  this.registerSelf_();

  // Register callbacks for when the list of online users changes.
  this.watchUsers_();
}

FirebaseSignal.prototype = new EventEmitter();

/**
 * Register callback for when the user list changed so that the UI can be
 * updated.
 */
FirebaseSignal.prototype.watchUsers_ = function() {
  var self = this;
  this.onlineRef.on('value', function(snapshot) {
    console.log('watchUsers_: usersChange');
    self.emit('usersChange', snapshot.val());
  });
};

/**
 * Methods to indicate that the user connected or disconnected.
 */
FirebaseSignal.prototype.connect = function() {
  this.userRef.update({isAvailable: false});
};

FirebaseSignal.prototype.disconnect = function() {
  this.userRef.update({isAvailable: true});
};

FirebaseSignal.prototype.setUsername = function(name) {
  this.userRef.update({username: name});
};

FirebaseSignal.prototype.registerSelf_ = function() {
  // Register our peer ID and user name with the Firebase.
  this.onlineRef = firebase.database().ref('online');

  this.userRef = this.onlineRef.push();
  this.userRef.set({
    peerId: this.peerId,
    isAvailable: true
  });

  // Unregister once we disconnect.
  this.userRef.onDisconnect().remove();
};

module.exports = FirebaseSignal;
