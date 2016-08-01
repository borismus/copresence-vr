var EventEmitter = require('eventemitter3');
var Peer = require('peerjs');

var PEER_HOST = 'copresence-vr.herokuapp.com';
var PEER_PORT = 443;
var API_KEY = 'hhs0czskhjda38fr';
var GUM_CONSTRAINTS = {video: false, audio: true};

/**
 * Wraps around peer.js to provide Audio and Data channels.
 *
 * Provides the following functionality:
 *   TURN server setup.
 *   Registering with the right WebRTC server.
 *   Establish audio and data connection to peer.
 *   Send arbitrary data to the connected peer.
 *
 * Events:
 *   remoteStream: a remote stream is available.
 *   data: some data was received.
 *   open: this connection was opened.
 *   close: this connection was closed.
 */
function PeerConnection() {
  var self = this;
  this.getWebRTCConfig_().then(function(config) {
    peer = new Peer({config: config, host: PEER_HOST, port: PEER_PORT, secure: true}); 
    peer.on('call', self.onIncomingCall_.bind(self));
    peer.on('error', self.onPeerError_.bind(self));
    peer.on('connection', self.onOpenConnection_.bind(self));

    self.peer = peer;

    peer.on('open', function(id) {
      self.emit('ready', id);
      // Only do this once.
      peer.removeListener('open');
    });
  });
}
PeerConnection.prototype = new EventEmitter();

/**
 * Connects to a remote peer with the specified peerId, establishing audio and
 * data connections.
 */
PeerConnection.prototype.connect = function(remotePeerId) {
  var self = this;

  // Make the audio call happen.
  navigator.webkitGetUserMedia(GUM_CONSTRAINTS, function(stream) {
    self.onLocalStream_(stream);
    var call = self.peer.call(remotePeerId, stream);
    call.on('stream', function(remoteStream) {
      // Show stream in some video/canvas element.
      self.onRemoteStream_(remoteStream);
    });
  }, function(e) {
    console.log('Failed to get local stream', e);
  });

  // Also establish the data connection.
  var connection = peer.connect(remotePeerId);
  this.onOpenConnection_(connection);
};

PeerConnection.prototype.getPeerId = function() {
  return this.peer ? this.peer.id : null;
};

/**
 * Sends some data to the peer.
 */
PeerConnection.prototype.send = function(data) {
  this.connection.send(data);
};

PeerConnection.prototype.getWebRTCConfig_ = function() {
  var urlParams = new URLSearchParams();
  urlParams.set('ident', 'borismus');
  urlParams.set('secret', '7f8ee400-f788-11e5-99cf-80873db2eccf');
  urlParams.set('domain', 'cardboardvr.com');
  urlParams.set('application', 'default');
  urlParams.set('room', 'default');
  urlParams.set('secure', 1);

  var fetchParams = {
    method: 'GET',
    body: urlParams
  };
  var url = 'https://service.xirsys.com/ice?' + urlParams.toString();

  return new Promise(function(resolve, reject) {
    return fetch(url).then(function(result) {
      return result.json();
    }).then(function(json) {
      var config = json.d;
      resolve(config);
    }).catch(reject);
  });
};

PeerConnection.prototype.onIncomingCall_ = function(call) {
  var self = this;
  navigator.webkitGetUserMedia(GUM_CONSTRAINTS, function(stream) {
    self.onLocalStream_(stream);
    call.answer(stream); // Answer the call with an A/V stream.
    call.on('stream', function(remoteStream) {
      // Show stream in some video/canvas element.
      self.onRemoteStream_(remoteStream);
    });
  }, function(err) {
    console.log('Failed to get local stream' ,err);
  });
};

PeerConnection.prototype.onRemoteStream_ = function(stream) {
  console.log('onRemoteStream_', stream);
  this.emit('remoteStream', stream);
};

PeerConnection.prototype.onLocalStream_ = function(stream) {
  console.log('onLocalStream_', stream);
  this.emit('localStream', stream);
};

PeerConnection.prototype.onReceiveConnection_ = function(conn) {
  this.onOpenConnection_(conn);
};

PeerConnection.prototype.onOpenConnection_ = function(conn) {
  this.connection = conn;
  this.emit('open');

  conn.on('data', this.onData_.bind(this));

  var self = this;
  conn.on('close', function() {
    self.emit('close');
  });
};

PeerConnection.prototype.onData_ = function(data) {
  this.emit('data', data);
};

PeerConnection.prototype.onPeerError_ = function(e) {
  console.log('onPeerError_', e);
};

module.exports = PeerConnection;
