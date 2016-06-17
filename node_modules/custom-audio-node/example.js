var createAudioNode = require('./index')
var extendTransform = require('audio-param-transform')

var audioContext = new AudioContext()

var filter = audioContext.createBiquadFilter()
var gain = audioContext.createGain()

extendTransform(filter.frequency, audioContext)
extendTransform(gain.gain, audioContext)

filter.connect(gain)

var decimalFrequencyParam = filter.frequency.transform(valueToFreq)
var gainBoostParam = gain.gain.transform(valueToGain)

var customNode = createAudioNode(filter, gain, {
  amount: {
    min: 0, 
    max: 1, 
    defaultValue: 0.5,
    targets: [ decimalFrequencyParam, gainBoostParam ]
  }
})

function valueToFreq(defaultValue, value){
  var min = Math.log(100)/Math.log(10)
    , max = Math.log(20000)/Math.log(10)
    , range = max-min
  return Math.pow(10, value * range + min)
}

function valueToGain(defaultValue, value){
  var gain = (value) + 1
  return gain
}

var oscillator = audioContext.createOscillator()
oscillator.type = 'sawtooth'
oscillator.frequency.value = 400
oscillator.start(0)


oscillator.connect(customNode)
customNode.connect(audioContext.destination)

var slider = document.createElement('input')
slider.type = 'range'
slider.min = 0
slider.max = 1
slider.step = 0.00001
slider.value = customNode.amount.value
document.body.appendChild(slider)

slider.onchange = function(){
  customNode.amount.value = parseFloat(this.value)
}

addButton('setValueAtTime (0.8 at t+0)', function(){
  customNode.amount.setValueAtTime(0.8, audioContext.currentTime)
})

addButton('linearRampToValueAtTime (0.2 at t+1)', function(){
  customNode.amount.linearRampToValueAtTime(0.2, audioContext.currentTime + 1)
})

addButton('exponentialRampToValueAtTime (0.9 at t+1)', function(){
  customNode.amount.exponentialRampToValueAtTime(0.9, audioContext.currentTime + 1)
})


function addButton(name, func){
  var button = document.createElement('button')
  button.onclick = func
  button.textContent = name
  document.body.appendChild(button)
}