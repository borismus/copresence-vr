var BUFFERS = {
  footsteps: 'audio/footsteps_loop.mp3',
  grow: 'audio/grow.mp3',
  shrink: 'audio/shrink.mp3'
};

function SfxPlayer(audioContext) {
  this.context = audioContext;

  this.buffers = {};
  this.loadBuffers_();
}

SfxPlayer.prototype.createSource = function(bufferName) {
  var source = this.context.createBufferSource();
  source.buffer = this.buffers[bufferName];
  return source;
};

SfxPlayer.prototype.loadBuffers_ = function() {
  for (var k in BUFFERS) {
    this.loadBuffer_(k);
  }
};

SfxPlayer.prototype.loadBuffer_ = function(name) {
  var url = BUFFERS[name];
  var self = this;
  fetch(url).then(function(result) {
    return result.arrayBuffer();
  }).then(function(arrayBuffer) {
    return self.context.decodeAudioData(arrayBuffer);
  }).then(function(audioBuffer) {
    self.buffers[name] = audioBuffer;
  });
};

module.exports = SfxPlayer;
