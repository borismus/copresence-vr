var EventEmitter = require('eventemitter3');
var Util = require('./util');
var adapter = require('webrtc-adapter');

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
function PeerConnection(manager) {
  var self = this;
  this.manager = manager;
  this.connectionId = Math.random();

  this.isCaller = false;

  this.getWebRTCConfig_().then(function(config) {
    var peerConnection = new RTCPeerConnection(config);
    peerConnection.onicecandidate = self.onIceCandidate_.bind(self);
    peerConnection.onaddstream = self.onAddStream_.bind(self);
    peerConnection.ondatachannel = self.onDataChannel_.bind(self);
    peerConnection.oniceconnectionstatechange = self.onIceConnectionStateChange_.bind(self);
    
    var sendChannel = peerConnection.createDataChannel('sendDataChannel');
    sendChannel.onopen = self.onSendDataOpen_.bind(self);
    sendChannel.onclose = self.onSendDataClose_.bind(self);

    self.sendChannel = sendChannel;
    self.peerConnection = peerConnection;

    // Emit ready event.
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
  var self = this;

  return new Promise(function(resolve, reject) {
    self.isCaller = true;
    self.remotePeerId = remotePeerId;

    self.manager.getLocalStream().then(function(localStream) {
      self.peerConnection.addStream(localStream);

      self.peerConnection.createOffer()
        .then(self.onCreateOffer_.bind(self))
        .catch(self.onError_);

    }).catch(self.onError_);

    self.onConnectResolve = resolve;
    self.onConnectReject = reject;
  });
};

PeerConnection.prototype.send = function(data) {
  if (this.sendChannel.readyState != 'open') {
    //console.error('Not sending message: send channel not ready.');
    return;
  }
  this.sendChannel.send(data);
};

PeerConnection.prototype.close = function() {
  console.log('PeerConnection.close');
};

PeerConnection.prototype.isConnected = function() {
  return !!this.remotePeerId;
};

PeerConnection.prototype.processSignalingMessage = function(msg) {
  var self = this;

  console.log('processSignalingMessage type: %s', msg.type);
  var pc = this.peerConnection;
  switch (msg.type) {
    case 'offer':
      pc.setRemoteDescription(new RTCSessionDescription(msg)).then(function() {
        self.manager.getLocalStream().then(function(localStream) {
          pc.addStream(localStream);
          pc.createAnswer().then(self.onCreateAnswer_.bind(self)).catch(self.onError_);
        });
      });
      break;
    case 'answer':
      pc.setRemoteDescription(new RTCSessionDescription(msg)).then(function(e) {
        console.log('setRemoteDescription success!');
      }).catch(function(e) {
        console.error('setRemoteDescription failed!', e);
      });
      break;
    default:
      console.log('Got unknown message of type %s', msg.type);
  }
}

PeerConnection.prototype.processIceCandidate = function(msg) {
  console.log('processIceCandidate');
  if (!this.peerConnection) {
    console.log('No peer connection. Should not happen.');
    return;
  }

  var candidate = new RTCIceCandidate(msg);
  this.peerConnection.addIceCandidate(candidate).catch(this.onError_);
};

/** PRIVATE API **/

PeerConnection.prototype.onIceCandidate_ = function(event) {
  if (event.candidate != null) {
    this.manager.sendSignalMessage({
      ice: event.candidate.toJSON()
    });
  }
};

PeerConnection.prototype.onAddStream_ = function(e) {
  console.log('onAddStream_');

  this.onRemoteStream_(e.stream);

  if (this.onConnectResolve) {
    console.log('onConnectResolve');
    this.onConnectResolve();
    this.onConnectResolve = null;
    this.onConnectReject = null;
  }
};

PeerConnection.prototype.onIceConnectionStateChange_ = function(e) {
  console.log('onIceConnectionStateChange_', e);
  if (this.peerConnection.iceConnectionState == 'connected') {
    this.emit('open', this.remotePeerId);
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

PeerConnection.prototype.onRemoteStream_ = function(stream) {
  console.log('onRemoteStream_', stream);
  this.remoteStream = stream;
  this.emit('remoteStream', stream);
};

PeerConnection.prototype.onCreateOffer_ = function(description) {
  console.log('onCreateOffer_');
  var self = this;

  this.peerConnection.setLocalDescription(description).then(function() {
    self.manager.sendSignalMessage({
      sdp: self.peerConnection.localDescription.toJSON()
    });
  }).catch(self.onError_);
};

PeerConnection.prototype.onCreateAnswer_ = function(description) {
  console.log('onCreateAnswer_');
  this.onCreateOffer_(description);
};


PeerConnection.prototype.setRemotePeerId = function(remotePeerId) {
  console.log('setRemotePeerId: %s, randomId: %s', remotePeerId, this.connectionId);
  this.remotePeerId = remotePeerId;
};

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
