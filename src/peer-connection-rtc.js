var EventEmitter = require('eventemitter3');
var Util = require('./util');
var adapter = require('webrtc-adapter');

var GUM_CONSTRAINTS = {video: false, audio: true};

/**
 * Uses our Firebase for a signaling server, no longer using peer.js at all
 * because it's unmaintained and flakey.
 *
 * Provides the following functionality:
 *   TURN server setup.
 *   Registering with the right WebRTC server.
 *   Establish audio and data connection to peer.
 *   Send arbitrary data to the connected peer.
 *   Closing the connection and all streams fully.
 *
 * Events:
 *   ready: the peer connection is ready to connect.
 *   localStream: a local stream is available.
 *   remoteStream: a remote stream is available.
 *   data: some data was received.
 *   open: this connection was opened.
 */
function PeerConnection(signal) {
  var self = this;
  this.signal = signal;
  this.uuid = signal.getOwnPeerId();
  this.isCaller = false;

  this.getWebRTCConfig_().then(function(config) {
    var peerConnection = new RTCPeerConnection(config);
    peerConnection.onicecandidate = self.onIceCandidate_.bind(self);
    peerConnection.onaddstream = self.onAddStream_.bind(self);
    peerConnection.ondatachannel = self.onDataChannel_.bind(self);
    
    var sendChannel = peerConnection.createDataChannel('sendDataChannel');
    sendChannel.onopen = self.onSendDataOpen_.bind(self);
    sendChannel.onclose = self.onSendDataClose_.bind(self);

    self.sendChannel = sendChannel;
    self.peerConnection = peerConnection;

    // Listen for messages from the Firebase signal server.
    self.boundOnMessage = self.onMessage_.bind(self);
    signal.on('message', self.boundOnMessage);
    self.emit('ready');
  });
}
PeerConnection.prototype = new EventEmitter();

/**
 * Connects to a remote peer ID.
 *
 * @return {Promise} A promise that fires when the connection is established.
 */
PeerConnection.prototype.connect = function(remotePeerId) {
  this.isCaller = true;

  return new Promise(function(resolve, reject) {
    this.remotePeerId = remotePeerId;

    this.getLocalStream_().then(function(localStream) {
      this.onLocalStream_(localStream);
      this.peerConnection.addStream(localStream);

      this.peerConnection.createOffer()
        .then(this.onCreateOffer_.bind(this))
        .catch(this.onError_);

    }.bind(this)).catch(this.onError_);

    this.onConnectResolve = resolve;
    this.onConnectReject = reject;
  }.bind(this));
};

PeerConnection.prototype.send = function(data) {
  if (this.sendChannel.readyState != 'open') {
    console.error('Not sending message: send channel not ready.');
    return;
  }
  this.sendChannel.send(data);
};

PeerConnection.prototype.close = function() {
};

PeerConnection.prototype.isConnected = function() {
  return !!this.remotePeerId;
};

/** PRIVATE API **/

PeerConnection.prototype.onIceCandidate_ = function(event) {
  if (event.candidate != null) {
    this.signal.send(this.remotePeerId, {ice: event.candidate.toJSON(), uuid: this.uuid});
  }
};

PeerConnection.prototype.onAddStream_ = function(e) {
  console.log('onAddStream_');

  // Stop listening for messages on this channel.
  this.signal.removeListener('message', this.boundOnMessage);

  this.onRemoteStream_(e.stream);
  this.emit('open', this.remotePeerId);

  if (this.onConnectResolve) {
    console.log('onConnectResolve');
    this.onConnectResolve();
    this.onConnectResolve = null;
    this.onConnectReject = null;
  }
};

/** Start data channel event handlers */
PeerConnection.prototype.onDataChannel_ = function(e) {
  console.log('onDataChannel_');
  this.receiveChannel = e.channel;
  
  this.receiveChannel.onmessage = this.onReceiveDataMessage_.bind(this);
  this.receiveChannel.onopen = this.onReceiveDataOpen_.bind(this);
  this.receiveChannel.onclose = this.onReceiveDataClose_.bind(this);
};

PeerConnection.prototype.onReceiveDataMessage_ = function(e) {
  console.log('onReceiveDataMessage_');
  this.emit('data', e.data);
};

PeerConnection.prototype.onReceiveDataOpen_ = function(e) {
  console.log('onReceiveDataOpen_');
};

PeerConnection.prototype.onReceiveDataClose_ = function(e) {
  console.log('onReceiveDataClose_');
};

PeerConnection.prototype.onSendDataOpen_ = function(e) {
  console.log('onSendDataOpen_');
};

PeerConnection.prototype.onSendDataClose_ = function(e) {
  console.log('onSendDataClose_');
};

PeerConnection.prototype.getLocalStream_ = function() {
  return new Promise(function(resolve, reject) {
    // This local stream should be unique per page.
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

PeerConnection.prototype.onLocalStream_ = function(stream) {
  console.log('onLocalStream_', stream);
  this.localStream = stream;
  this.emit('localStream', stream);
};

PeerConnection.prototype.onRemoteStream_ = function(stream) {
  console.log('onRemoteStream_', stream);
  this.remoteStream = stream;
  this.emit('remoteStream', stream);
};

PeerConnection.prototype.onMessage_ = function(message) {
  var self = this;

  // If we're being called, save the remote uuid for later.
  if (!this.isCaller && !this.remotePeerId) {
    this.remotePeerId = message.uuid;
  }

  if (message.sdp) {
    this.processSignalingMessage(message.sdp);
  } else if (message.ice) {
    var candidate = new RTCIceCandidate(message.ice);
    this.peerConnection.addIceCandidate(candidate).catch(this.onError_);
  }
};

PeerConnection.prototype.onCreateOffer_ = function(description) {
  console.log('onCreateOffer_');
  var self = this;

  this.peerConnection.setLocalDescription(description).then(function() {
    self.signal.send(self.remotePeerId, {sdp: self.peerConnection.localDescription.toJSON(), uuid: self.uuid});
  }).catch(self.onError_);
};

PeerConnection.prototype.onCreateAnswer_ = function(description) {
  console.log('onCreateAnswer_');
  this.onCreateOffer_(description);
};

PeerConnection.prototype.processSignalingMessage = function(msg) {
  var self = this;

  console.log('Got signal message of type %s', msg.type);
  var pc = this.peerConnection;
  switch (msg.type) {
    case 'offer':
      pc.setRemoteDescription(new RTCSessionDescription(msg));
      this.getLocalStream_().then(function(localStream) {
        self.onLocalStream_(localStream);
        pc.addStream(localStream);
        pc.createAnswer().then(this.onCreateAnswer_.bind(this))
            .catch(this.onError_);
      }.bind(this));
      break;
    case 'answer':
      pc.setRemoteDescription(new RTCSessionDescription(msg));
      break;
    default:
      console.log('Got unknown message of type %s', msg.type);
  }
}

PeerConnection.prototype.onError_ = function(e) {
  console.error(e);

  if (this.onConnectReject) {
    this.onConnectReject();
    this.onConnectResolve = null;
    this.onConnectReject = null;
  }
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


module.exports = PeerConnection;
