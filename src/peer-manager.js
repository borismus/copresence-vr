var EventEmitter = require('eventemitter3');
var PeerConnection = require('./peer-connection-rtc');

var GUM_CONSTRAINTS = {video: false, audio: true};
/**
 * This class is a singleton. It listens to the signalling server to help
 * establish new PeerConnections. It can create new PeerConnections and clean up
 * old ones.
 *
 * Manages multiple peer connections, making sure that there is always one
 * active one.
 *
 * Manages the local getUserMedia stream.
 *
 * The following events are emitted:
 *   connection(function(PeerConnection)): A new connection is created.
 *   
 */
function PeerManager(signal) {
  this.signal = signal;
  // Array of established peer connections.
  this.establishedPeerConnections = [];

  // Listen to messages.
  signal.on('message', this.onMessage_.bind(this));
}
PeerManager.prototype = new EventEmitter();

/**
 * Connects to the specified peer ID using a new PeerConnection.
 *
 * @return {Promise(PeerConnection)} A promise that resolves when the connection
 *    is established.
 */
PeerManager.prototype.connect = function(remotePeerId) {
  var self = this;

  return new Promise(function(resolve, reject) {
    var pc = self.createPeerConnection_();
    pc.on('ready', function() {
      self.activePeerConnection = pc;
      pc.connect(remotePeerId).then(function() {
        console.log('Peer connection established');
        resolve();
      }).catch(reject);
    });
  });
};

PeerManager.prototype.disconnect = function(remotePeerId) {
  // Find the right peer connection to disconnect.
  for (var i = 0; i < this.establishedPeerConnections.length; i++) {
    var pc = this.establishedPeerConnections[i];
    if (pc.remotePeerId == remotePeerId) {
      // Close the connection.
      pc.close();
      // Remove from list of established connections.
      this.establishedPeerConnections.splice(i, 1);
    }
  }
};

PeerManager.prototype.sendSignalMessage = function(message) {
  var remotePeerId = this.activePeerConnection.remotePeerId;
  console.log('Sending message to peer %s', remotePeerId);
  message.peerId = this.signal.getOwnPeerId();
  this.signal.send(remotePeerId, message);
};

/**
 * Doing this explicitly in order to trigger a 'connection' event for the
 * initial connection.
 */
PeerManager.prototype.createActiveConnection = function() {
  // The currently active peer connection.
  this.activePeerConnection = this.createPeerConnection_();
};

PeerManager.prototype.getLocalStream = function() {
  return new Promise(function(resolve, reject) {
    if (window.localStream) {
      resolve(window.localStream);
    } else {
      navigator.webkitGetUserMedia(GUM_CONSTRAINTS, function(stream) {
        window.localStream = stream;
        resolve(stream);
      }, reject);
    }
  });
};

PeerManager.prototype.closeLocalStream = function() {
  if (!window.localStream) {
    console.error('Cannot close local stream: none found.');
    return;
  }
  var tracks = window.localStream.getTracks();
  for (var i = 0; i < tracks.length; i++) {
    tracks[i].stop();
  }
};


/***** PRIVATE METHODS FOLLOW *****/

PeerManager.prototype.createPeerConnection_ = function() {
  console.log('createPeerConnection_');
  var pc = new PeerConnection(this);
  this.emit('connection', pc);

  pc.on('open', this.onConnectionEstablished_.bind(this))

  return pc;
};

PeerManager.prototype.onConnectionEstablished_ = function(remotePeerId) {
  // Add this peer connection to the array of established ones.
  this.establishedPeerConnections.push(this.activePeerConnection);
  // Spawn a new connection.
  this.createActiveConnection();
};

PeerManager.prototype.onMessage_ = function(message) {
  console.log('Got message from peer %s.', message.peerId);
  var self = this;

  var pc = this.activePeerConnection;

  if (message.sdp) {
    // If we're being called, and we don't have an remote ID yet, save it.
    if (!pc.isCaller && !pc.remotePeerId) {
      this.activePeerConnection.setRemotePeerId(message.peerId);
    }
    this.activePeerConnection.processSignalingMessage(message.sdp);
  } else if (message.ice) {
    this.activePeerConnection.processIceCandidate(message.ice);
  }
};

module.exports = PeerManager;
