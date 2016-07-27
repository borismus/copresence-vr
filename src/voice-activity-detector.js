var CBuffer = require('CBuffer');
var EventEmitter = require('eventemitter3');

var FFT_SIZE = 2048;
var HISTORY_SIZE = 5;
var POWER_FREQUENCY = 1000;
var VOICE_POWER_THRESHOLD = -90;

/**
 * Given an audio stream, fires events whenever voice activity starts and stops.
 * Current implementation relies on AnalyserNode for efficiency, but works more
 * based on frequency power metering than anything else.
 *
 * Emits the following events, both with a power amount:
 *
 *    active: When a voice is detected in the stream.
 *    inactive: When a voice is no longer detected in the stream.
 *    power: The current power level.
 *
 * TODO(smus): Make a more complex implementation that is based not on a naive
 * FFT approach, but the real deal (eg. http://goo.gl/wHlhOs) once AudioWorklets
 * are available.
 */
function VoiceActivityDetector(context) {
  this.context = context;
  this.fftData = new Float32Array(FFT_SIZE);

  // Track the current state to emit the right events.
  this.isActive = false;

  // A circular buffer of voice amplitude histories.
  this.buffer = new CBuffer(HISTORY_SIZE);

  // When the power level was last reported.
  this.lastPowerTime = performance.now();
}

VoiceActivityDetector.prototype = new EventEmitter();

/**
 * Sets the source on which to do voice activity detection.
 */
VoiceActivityDetector.prototype.setSource = function(source) {
  var analyser = this.context.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  source.connect(analyser);
  this.analyser = analyser;

  this.detect_();
};

VoiceActivityDetector.prototype.detect_ = function() {
  // Get FFT data into the fftData array.
  this.analyser.getFloatFrequencyData(this.fftData); 

  var power = this.getCurrentHumanSpeechPower_();
  this.buffer.push(power);

  // Get the running average of the last few samples.
  var powerHistory = this.getPowerHistory_();

  var isActive = powerHistory > VOICE_POWER_THRESHOLD;

  if (isActive && !this.isActive) {
    // Just became active.
    this.emit('active', power);
  } else if (!isActive && this.isActive) {
    // Just became inactive.
    this.emit('inactive', power)
  }

  // Periodically report the power level too.
  var now = performance.now();
  if (isActive && now - this.lastPowerTime > POWER_FREQUENCY) {
    this.emit('power', power);
    this.lastPowerTime = now;
  }


  this.isActive = isActive;

  requestAnimationFrame(this.detect_.bind(this));
};

VoiceActivityDetector.prototype.getCurrentHumanSpeechPower_ = function() {
  // Look at the relevant portions of the frequency spectrum (human speech is
  // roughly between 300 Hz to 3400 Hz).
  var start = this.freqToBucketIndex_(300);
  var end = this.freqToBucketIndex_(3400);

  var sum = 0;
  for (var i = start; i < end; i++) {
    sum += this.fftData[i];
  }

  var power = sum / (end - start);

  return power;
};

VoiceActivityDetector.prototype.getPowerHistory_ = function() {
  var sum = 0;
  var count = 0;
  this.buffer.forEach(function(value) {
    sum += value;
    count += 1;
  });
  return sum / count;
};

VoiceActivityDetector.prototype.freqToBucketIndex_ = function(frequency) {
  var nyquist = this.context.sampleRate/2;
  return Math.round(frequency/nyquist * this.fftData.length);
};

module.exports = VoiceActivityDetector;
